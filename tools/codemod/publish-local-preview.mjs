#!/usr/bin/env node
// 把 packages/ 下所有包发布到**本地预览 registry**（verdaccio），
// 用来在官方客户端上验证「一个输入装齐一层」的真实语义。
//
// 为什么非得走 registry：dsh plugin add <本地路径> 会被写成 link: 规格，
// 而 pnpm 对 link:/file: 的包**不安装它的 dependencies** ——
// 实测元包装完后 profile 里只有它自己，成员一个都没进来，
// 可它那份生成的 cordis.patch.yml 照样把 18 行插了进去，
// 既不报错也不告警（dump-config 还 exit 0）。所以本地路径这条路
// 永远验证不到元包的真正行为，只有 registry 语义才对得上生产。
//
// 用法：node tools/codemod/publish-local-preview.mjs [registryUrl] [--userconfig=<文件>]
// 默认 http://127.0.0.1:14873
//
// 为什么带 --ignore-scripts：6 个包（better-sidebar / cardian / easyrewrite / synapse /
// graph-memory / harness-pet）在 package.json 里挂了 prepare/prepack/prepublishOnly，
// npm publish 必然执行它们 —— 那要求完整构建工具链，而且会用 src/ 重新生成 lib/，
// 产物就不再是我们测过的那份。预览发布要发的是**仓库里已提交的可加载产物**，所以跳脚本。
// 这条同时暴露了一个真问题：正式发 npm 前必须先处理这 6 个包的发布期脚本，
// 否则 npm publish 会当场失败（本地 registry 实测已复现）。

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PKGS = join(REPO, 'packages');
const argv = process.argv.slice(2);
const REGISTRY = (argv.find((a) => !a.startsWith('--')) || 'http://127.0.0.1:14873').replace(/\/$/, '');
const userconfigArg = argv.find((a) => a.startsWith('--userconfig='));

const done = [];
const failed = [];
const skipped = [];

for (const dir of readdirSync(PKGS).sort()) {
  const pkgDir = join(PKGS, dir);
  const pj = join(pkgDir, 'package.json');
  if (!existsSync(pj)) continue;
  const manifest = JSON.parse(readFileSync(pj, 'utf8'));
  if (!manifest.name || !manifest.version) {
    skipped.push(`${dir}（无 name/version）`);
    continue;
  }

  // 先 dry-run 看一眼要发什么，真发用同一次调用的 --force-publish? npm 无此组合，
  // 直接发：本地 registry 允许 unpublish，重复发会 EPUBLISHCONFLICT，逐条记下即可。
  // Windows 上 npm 是 .cmd，spawnSync 不带 shell 会静默失败（实测：所有包都「失败」但
  // 错误信息为空，而手动 npm publish 是成功的）。手写真拼命令又有注入与空格风险。
  // 正解：用当前 node 直接跑 npm 自带的 npm-cli.js，不经 shell。
  const npmCli = (() => {
    const cand = [
      join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      process.env.NPM_CLI_JS,
    ].filter(Boolean);
    for (const c of cand) if (existsSync(c)) return c;
    return null;
  })();
  if (!npmCli) {
    console.error('✗ 找不到 npm-cli.js，无法免 shell 发布。设 NPM_CLI_JS 环境变量指过去再跑。');
    process.exit(2);
  }
  // prerelease（如 graph-memory 的 1.6.0-beta.1）不带 --tag 会被 npm 直接拒绝：
  //   "You must specify a tag using --tag when publishing a prerelease version."
  const isPrerelease = /-[0-9A-Za-z.]/.test(manifest.version) && manifest.version.includes('-');
  const args = ['publish', '--registry', REGISTRY, '--access', 'public', '--no-audit', '--no-fund', '--ignore-scripts'];
  if (isPrerelease) args.push('--tag', 'beta');
  if (userconfigArg) args.push(`--userconfig=${userconfigArg.split('=')[1]}`);
  const r = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: pkgDir,
    encoding: 'utf8',
    timeout: 120000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    done.push(manifest.name);
  } else if (/EPLUGINCONFlict|EPUBLISHCONFLICT|cannot overwrite/i.test(out)) {
    skipped.push(`${manifest.name}（已存在，跳过）`);
  } else {
    failed.push({ name: manifest.name || dir, why: out.split('\n').map((s) => s.trim()).filter(Boolean).slice(-2).join(' | ') });
  }
}

console.log(`目标 registry: ${REGISTRY}`);
console.log(`发布成功 ${done.length} 个，跳过 ${skipped.length} 个，失败 ${failed.length} 个`);
if (failed.length) {
  console.log('\n失败明细（这些是真问题，不要忽略）：');
  for (const f of failed) console.log(`  ✗ ${f.name}\n      ${f.why}`);
}
if (skipped.length) {
  console.log('\n跳过：');
  for (const s of skipped) console.log(`  · ${s}`);
}
process.exitCode = failed.length ? 1 : 0;
