#!/usr/bin/env node
// J2 的「打包内容」那一半，单独成 job：不需要联网、不需要包已发布。
//
// 为什么单独拆出来：tools/itest 的 J2 还要 dsh plugin add 真装 tarball，
// 而那一步在两种情况下必然失败且与包质量无关——
//   · @dsh-pack/* 尚未发布（元包的依赖去 registry 取不到）；
//   · 本机网络在下载 @img/sharp-* 等多平台可选二进制时会掉线。
// 结果就是「files 白名单有没有写错」这个真正要看的问题被噪声淹掉。
// 打包内容检查只依赖 npm pack + tar，离线可跑，所以拆成独立门禁。
//
// 用法：node tools/itest/pack-audit.mjs
// 退出码：0 = 全部干净；1 = 有包会把不该发的东西打出去

import { readdirSync, existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PKGS = join(REPO, 'packages');
const OUT = mkdtempSync(join(tmpdir(), 'dsh-pack-audit-'));

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: true, ...opts });
}

const findings = [];
let checked = 0;

for (const dir of readdirSync(PKGS).sort()) {
  const pkgDir = join(PKGS, dir);
  if (!existsSync(join(pkgDir, 'package.json'))) continue;
  const packed = sh('npm', ['pack', '--pack-destination', `"${OUT}"`, '--ignore-scripts', '--quiet'], { cwd: pkgDir });
  const out = (packed.stdout || '') + (packed.stderr || '');
  const file = (out.match(/([\w.@-]+\.tgz)/) || [])[0];
  if (packed.status !== 0 || !file) {
    // 打不出包本身就是发布阻塞（private:true / manifest 非法）
    findings.push({ dir, why: `npm pack 失败：${out.split('\n').filter(Boolean).slice(-2).join(' | ') || '(无输出)'}` });
    continue;
  }
  checked += 1;
  const listing = sh('tar', ['--force-local', '-tzf', join(OUT, file)]);
  if (listing.status !== 0) {
    findings.push({ dir, why: `tar 列不出来：${(listing.stderr || '').trim().split('\n')[0]}` });
    continue;
  }
  const entries = (listing.stdout || '').split('\n').filter(Boolean);
  const strip = (e) => e.replace(/^package\//, '');
  const manifest = (() => {
    try {
      return JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    } catch {
      return {};
    }
  })();
  // 只有声明了 dsh.bundle.patch 的包才是 bundle，才必须把那份补丁层打进发布物。
  // host-capabilities 这类构建期库刻意不是 bundle（没有 dsh 键），对它要求
  // cordis.patch.yml 是检查写错了；而「该声明却没声明」由 tools/audit/self-mount 报错，
  // 两边各管一段，不在这里重复判据。
  const isBundle = Boolean(manifest.dsh && manifest.dsh.bundle && manifest.dsh.bundle.patch);
  const problems = [];
  if (entries.some((e) => /(^|\/)node_modules\//.test(e))) problems.push('混进 node_modules');
  if (entries.some((e) => /\.map$/.test(e))) problems.push('带 .map（可能内嵌上游 sourcesContent）');
  if (entries.some((e) => /(^|\/)test\//.test(e))) problems.push('带 test/ 测试目录');
  if (entries.some((e) => /(^|\/)scripts\/(build|bundle)/.test(e))) problems.push('带构建脚本（dev-only 工具）');
  if (!entries.some((e) => /\/package\.json$/.test(e))) problems.push('缺 package.json');
  if (isBundle && !entries.some((e) => /cordis\.patch\.yml$/.test(e))) problems.push('缺 cordis.patch.yml（装了挂不上）');
  if (!entries.some((e) => /(LICENSE|licence|license)/.test(e))) problems.push('缺 LICENSE');
  if (entries.length > 400) problems.push(`条目过多(${entries.length})，files 白名单可能没写`);
  if (problems.length) findings.push({ dir, why: `${problems.join('; ')}｜共 ${entries.length} 条目` });
}

rmSync(OUT, { recursive: true, force: true });

console.log(`检查 ${checked} 个包（npm pack 真实产物）`);
if (!findings.length) {
  console.log('✅ 全部干净：没有 node_modules / .map / test/ 泄漏，补丁层与 LICENSE 齐备');
  process.exit(0);
}
console.log(`\n★ ${findings.length} 个包的发布内容有问题：`);
for (const f of findings) console.log(`   ${f.dir.padEnd(26)} ${f.why}`);
process.exit(1);
