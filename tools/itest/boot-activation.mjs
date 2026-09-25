#!/usr/bin/env node
/**
 * J4：真启动激活门禁。
 *
 * 为什么必须有它：J1 只跑 `--dump-config`，那证明的是**组合**（条目清单拼对了），
 * 不是**激活**（apply 真跑通）。`ctx.settings.register` 这个 API 在内核 0.1.7-rc.1
 * 里根本不存在，于是 10 个包在 apply 里抛 TypeError —— dump 全绿、CI 全绿，
 * 最后是用户在官方客户端界面上看到「N entries did not activate」才发现。
 * 更坏的一半是：其中 6 个包把同一个错误 catch 住只打一行日志，
 * 连"未激活"都不报，设置静默存不住。
 *
 * 本 job 把 profile 复制到临时 DSH_HOME 后真挂载，然后要求：
 *   ① 没有任何 @dsh-pack 条目出现在「did not activate」清单里；
 *   ② 没有任何一条被 catch 吞掉的「服务/API 不存在」日志（这类日志本身就是缺陷信号）；
 *   ③ 没有任何 duplicate route（分层元包退役那次的回归面）。
 *
 * 用法：
 *   node tools/itest/boot-activation.mjs [--profile=desktop] [--timeout=60]
 * 环境变量 DSH_HOME 会被强制改写，绝不允许指向真实的 ~/.dsh。
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL_HOME = join(process.env.HOME || process.env.USERPROFILE || '', '.dsh');

const argOf = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : dflt;
};
const PROFILE = argOf('profile', 'desktop');
const SRC_PROFILE_ARG = argOf('profileDir', '');
const TIMEOUT = Number(argOf('timeout', 60)) * 1000;
// 默认从真实 ~/.dsh/profiles/<name> 取一份现成 profile 当模板（本机验证）；
// CI 上没有 ~/.dsh，用 --profileDir 指一个已经真装好的 profile（例如 J2 从 tarball 装出来的那个）。
const SRC_PROFILE = SRC_PROFILE_ARG || join(REAL_HOME, 'profiles', PROFILE);

if (!existsSync(SRC_PROFILE)) {
  console.error(`找不到源 profile：${SRC_PROFILE}`);
  console.error('本机：确认 ~/.dsh/profiles/' + PROFILE + ' 存在；');
  console.error('CI：传 --profileDir=<已真装好的 profile 目录>（J4 不能拿空 profile 跑，那是空跑）');
  process.exit(2);
}
const HOME = mkdtempSync(join(tmpdir(), 'dsh-activation-'));
if (!HOME.startsWith(tmpdir())) {
  rmSync(HOME, { recursive: true, force: true });
  throw new Error(`拒绝执行：临时 DSH_HOME 没有落在 ${tmpdir()} 下（${HOME}）`);
}

let failed = [];
try {
  // 1) 复制 profile（含 node_modules），再把仓库里各包的源码盖进去 ——
  //    这样测的是**工作区当前代码**，而不是上次发布到 registry 的旧产物。
  cpSync(SRC_PROFILE, join(HOME, 'profiles', 'probe'), { recursive: true });
  const probe = join(HOME, 'profiles', 'probe');
  let overlaid = 0;
  for (const dir of readdirSync(join(REPO, 'packages'))) {
    const src = join(REPO, 'packages', dir);
    if (!existsSync(join(src, 'package.json'))) continue;
    let name;
    try {
      name = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8')).name;
    } catch { continue; }
    if (!name?.startsWith('@dsh-pack/')) continue;
    const dest = join(probe, 'node_modules', ...name.split('/'));
    if (!existsSync(dest)) continue;
    cpSync(src, dest, { recursive: true, filter: (s) => !s.includes('node_modules') });
    overlaid += 1;
  }

  // 2) 真启动（CLI 只禁 desktop 这个 profile 名，所以副本改叫 probe）
  const bin = join(REPO, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  if (!existsSync(bin)) {
    console.error('缺少 node_modules/@deepseek-ai/dsh，无法真启动。先 npm i @deepseek-ai/dsh。');
    process.exit(2);
  }
  const r = spawnSync(process.execPath, [bin, '--profile', 'probe'], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, DSH_HOME: HOME },
    timeout: TIMEOUT,
  });
  const err = String(r.stderr || '');
  const out = String(r.stdout || '');
  // 超时是预期的（应用起来了没退），其它非零退出要报出来。
  const timedOut = r.error?.code === 'ETIMEDOUT' || err.includes('ETIMEDOUT');
  if (r.status !== 0 && !timedOut && r.signal !== 'SIGTERM') {
    failed.push(`启动退出码 ${String(r.status)}（不是超时）：${err.split('\n').filter(Boolean).slice(0, 3).join(' | ')}`);
  }

  // 3) 判据
  const inactive = err.match(/^\s*([a-z0-9][a-z0-9-]*) \(@dsh-pack\/[^)]+\): .*$/gim) || [];
  for (const line of inactive) failed.push(`未激活：${line.trim()}`);

  const swallowed = err
    .split('\n')
    .filter((l) => /@dsh-pack|^\[(dsh-|offpeak|openclaw|graph-|harness-)/i.test(l))
    .filter((l) => /is not a function|服务在当前内核不存在|unavailable|falls? back|retrying with defaults|stored config rejected/i.test(l));
  for (const line of swallowed) failed.push(`被吞掉的降级：${line.trim()}`);

  if (/duplicate (exact|prefix|upgrade) route/i.test(err)) failed.push('出现 duplicate route（分层/成员重复装配）');
  if (!/did not activate/.test(err) && inactive.length === 0 && overlaid === 0) {
    failed.push('一个包都没覆盖到（overlaid=0），本次判定为空跑');
  }

  console.log(`临时 DSH_HOME: ${HOME}`);
  console.log(`覆盖进副本的包: ${overlaid} 个；stderr ${err.split('\n').length} 行；stdout ${out.split('\n').length} 行`);
  if (failed.length) {
    console.log(`\n✗ J4 未通过，${failed.length} 项：`);
    for (const f of failed) console.log(`  · ${f.slice(0, 220)}`);
    // 内核把完整启动诊断落到 $DSH_HOME/logs/startup-*.log，里面有被 stderr 摘要
    // 省掉的原始错误（"failed to import" 只给结论不给原因）。失败时把它一并打出来，
    // 并留一份副本 —— 否则 finally 删掉临时目录后就再也查不到了。
    const logs = existsSync(join(HOME, 'logs')) ? readdirSync(join(HOME, 'logs')) : [];
    const keep = join(REPO, '.tmp-j4-diagnostics.log');
    let dump = '';
    for (const name of logs.filter((n) => n.startsWith('startup-')).sort()) {
      try { dump += readFileSync(join(HOME, 'logs', name), 'utf8'); } catch { /* 读不到就跳过 */ }
    }
    if (dump) {
      writeFileSync(keep, dump);
      const interesting = dump.split('\n')
        .filter((l) => /Error|error|failed|Cannot|Unexpected|is not/.test(l))
        .filter((l) => !/^\s*at /.test(l));
      console.log('\n--- 内核启动诊断（错误行）---');
      for (const l of [...new Set(interesting)].slice(0, 20)) console.log(`  ${l.slice(0, 220)}`);
      console.log(`\n完整诊断已留到 ${keep}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\n✅ J4 通过：@dsh-pack 条目全部激活，无降级日志、无 duplicate route。');
  }
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
