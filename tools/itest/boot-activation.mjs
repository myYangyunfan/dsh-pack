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
 * 后来发现还有第三种静默：**日志里什么都没有，路由却从未挂上**。
 * dsh-reasoning-effort 走 `ctx.connection.rpc.handle`，那个 API 内部要访问它自己 ctx
 * 没 inject 的 `webServer`，隔离层抛错 —— apply 不报错、启动日志干净，
 * 用户看到的是一行 405。所以本 job 除了看日志，还要**真发一次 HTTP 请求**
 * （打 tools/itest/live-probes.json 里声明的页内表面）。
 *
 * 判据：
 *   ① 没有任何 @dsh-pack 条目出现在「did not activate」清单里；
 *   ② 没有任何一条被 catch 吞掉的「服务/API 不存在」日志（这类日志本身就是缺陷信号）；
 *   ③ 没有任何 duplicate route（分层元包退役那次的回归面）；
 *   ④ live-probes.json 里每条探针的状态码/响应体都符合预期（页内表面真的在服务）。
 *
 * 用法：
 *   node tools/itest/boot-activation.mjs [--profile=desktop] [--timeout=90]
 * 环境变量 DSH_HOME 会被强制改写，绝不允许指向真实的 ~/.dsh。
 */
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
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
const TIMEOUT = Number(argOf('timeout', 90)) * 1000;
// 默认从真实 ~/.dsh/profiles/<name> 取一份现成 profile 当模板（本机验证）；
// CI 上没有 ~/.dsh，用 --profileDir 指一个已经真装好的 profile（例如 J2 从 tarball 装出来的那个）。
const SRC_PROFILE = SRC_PROFILE_ARG || join(REAL_HOME, 'profiles', PROFILE);
const PROBES_FILE = join(REPO, 'tools', 'itest', 'live-probes.json');

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

const failed = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 发一个请求；连接被拒（服务还没起来）返回 status 0 而不是抛。 */
function httpProbe({ method, path, headers = {}, body = null, port }) {
  return new Promise((resolve) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c.toString('utf8'); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text }));
    });
    req.on('error', (error) => resolve({ status: 0, error: error.message }));
    req.setTimeout(10000, () => { req.destroy(new Error('timeout')); });
    if (body !== null) req.write(body);
    req.end();
  });
}

/** 从启动日志里取端口与「带 token 的干净应用 URL」里的 token。 */
function parseBoot(log) {
  const urlLine = log.split('\n').find((l) => /https?:\/\/127\.0\.0\.1:\d+/.test(l)) ?? '';
  const port = Number(urlLine.match(/:(\d+)/)?.[1] ?? 0) || 3080;
  const token = log.match(/[?&]token=([A-Za-z0-9._~-]+)/)?.[1] ?? null;
  return { port, token };
}

/** 跑一条探针：按声明补 envelope / cookie，再核对状态码与响应体。 */
async function runProbe(spec, { port, cookie }) {
  const headers = { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, 'sec-fetch-site': 'same-origin' };
  if (spec.auth === 'session') {
    if (!cookie) return '拿不到会话 cookie（内核输出里没有带 token 的应用 URL？），无法判定';
    headers.cookie = cookie;
  }
  let body = null;
  if (spec.rpc) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify({ type: 'client-request', rpcId: 'j4-probe', method: spec.rpc.method, payload: spec.rpc.payload ?? {} });
  }
  const res = await httpProbe({ method: spec.method, path: spec.path, headers, body, port });
  if (res.status === 0) return `请求失败：${res.error}`;
  const expect = spec.expect ?? {};
  if (expect.status !== undefined && res.status !== expect.status) {
    return `期望 HTTP ${expect.status}，实得 ${res.status}：${res.body.slice(0, 160) || '(空响应体)'}`;
  }
  if (expect.contains !== undefined && !res.body.includes(expect.contains)) {
    return `响应体里没有 ${JSON.stringify(expect.contains)}：${res.body.slice(0, 160)}`;
  }
  return null;
}

async function main() {
  const probeDir = join(HOME, 'profiles', 'probe');
  // 1) 复制 profile（含 node_modules），再把仓库里各包的源码盖进去 ——
  //    这样测的是**工作区当前代码**，而不是上次发布到 registry 的旧产物。
  cpSync(SRC_PROFILE, probeDir, { recursive: true });
  let overlaid = 0;
  for (const dir of readdirSync(join(REPO, 'packages'))) {
    const src = join(REPO, 'packages', dir);
    if (!existsSync(join(src, 'package.json'))) continue;
    let name;
    try {
      name = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8')).name;
    } catch { continue; }
    if (!name?.startsWith('@dsh-pack/')) continue;
    const dest = join(probeDir, 'node_modules', ...name.split('/'));
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
  const child = spawn(process.execPath, [bin, '--profile', 'probe'], {
    cwd: REPO,
    env: { ...process.env, DSH_HOME: HOME },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d.toString('utf8'); });
  child.stderr.on('data', (d) => { log += d.toString('utf8'); });

  let probes = null;
  try {
    const { port, token } = await (async () => {
      // 等端口起来；进程提前退出就立刻停（别把 90 秒耗在必然失败的等待上）
      for (let waited = 0; waited < TIMEOUT; waited += 500) {
        if (child.exitCode !== null) return { port: 0, token: null };
        const { port } = parseBoot(log);
        const ping = await httpProbe({ method: 'GET', path: '/', headers: { host: `127.0.0.1:${port}` }, port });
        if (ping.status !== 0) return parseBoot(log);
        await sleep(500);
      }
      return { port: 0, token: null };
    })();

    if (port === 0) {
      failed.push(child.exitCode !== null
        ? `启动进程已退出（退出码 ${String(child.exitCode)}），服务没起来`
        : `等待 ${TIMEOUT / 1000}s 服务仍未监听`);
    } else {
      console.log(`临时 DSH_HOME: ${HOME}\n服务端口: ${port}`);
      // 3) 会话 cookie：外壳打开的是带 token 的干净应用 URL，用它换一次 cookie。
      //    ⚠ token 行可能比「端口就绪」晚一拍才打出来，所以要等一下 ——
      //    直接读会得到「拿不到 cookie」这种**假失败**（第一次跑就踩过）。
      let tokenNow = token;
      for (let i = 0; i < 20 && !tokenNow; i++) {
        await sleep(500);
        tokenNow = parseBoot(log).token;
      }
      let cookie = '';
      if (tokenNow) {
        const index = await httpProbe({ method: 'GET', path: `/?token=${tokenNow}`, headers: { host: `127.0.0.1:${port}` }, port });
        cookie = (index.headers?.['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');
      }
      // 4) 页内表面探针
      if (existsSync(PROBES_FILE)) {
        probes = JSON.parse(readFileSync(PROBES_FILE, 'utf8')).probes ?? [];
        console.log(`页内表面探针: ${probes.length} 条（tools/itest/live-probes.json）`);
        for (const spec of probes) {
          const problem = await runProbe(spec, { port, cookie });
          if (problem) {
            failed.push(`探针「${spec.name}」：${problem}`);
            console.log(`  ✗ ${spec.name}`);
          } else {
            console.log(`  ✓ ${spec.name}`);
          }
        }
      } else {
        // fail-closed：探针清单是仓库文件，它没了说明门禁被悄悄削弱了
        failed.push('缺少 tools/itest/live-probes.json：页内表面无法判定（宁可报错也不静默放过）');
      }
    }
  } finally {
    child.kill('SIGTERM');
    await sleep(1200);
    if (child.exitCode === null) child.kill('SIGKILL');
  }

  // 5) 日志判据
  const inactive = log.match(/^\s*([a-z0-9][a-z0-9-]*) \(@dsh-pack\/[^)]+\): .*$/gim) || [];
  for (const line of inactive) failed.push(`未激活：${line.trim()}`);

  const swallowed = log
    .split('\n')
    .filter((l) => /@dsh-pack|^\[(dsh-|offpeak|openclaw|graph-|harness-)/i.test(l))
    .filter((l) => /is not a function|服务在当前内核不存在|unavailable|falls? back|retrying with defaults|stored config rejected/i.test(l));
  for (const line of swallowed) failed.push(`被吞掉的降级：${line.trim()}`);

  if (/duplicate (exact|prefix|upgrade) route/i.test(log)) failed.push('出现 duplicate route（分层/成员重复装配）');
  if (/EADDRINUSE/.test(log)) failed.push('端口被占用（EADDRINUSE）：先关掉正在跑的客户端/旧实例再跑 J4');
  if (overlaid === 0) failed.push('一个包都没覆盖到（overlaid=0），本次判定为空跑');

  console.log(`覆盖进副本的包: ${overlaid} 个；日志 ${log.split('\n').length} 行`);
  if (failed.length) {
    console.log(`\n✗ J4 未通过，${failed.length} 项：`);
    for (const f of failed) console.log(`  · ${f.slice(0, 240)}`);
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
    console.log(`\n✅ J4 通过：@dsh-pack 条目全部激活，无降级日志、无 duplicate route，${probes?.length ?? 0} 条页内探针全绿。`);
  }
}

try {
  await main();
} finally {
  rmSync(HOME, { recursive: true, force: true });
}
