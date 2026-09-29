#!/usr/bin/env node
// 把 packages/ 下所有可发布包打成 tarball，落到仓库根的 packs/（不入库，见 .gitignore），
// 并写一份 MANIFEST.txt；若 docs/install-from-tarballs.md 在，一并复制成 packs/INSTALL.md。
//
// 什么时候用它：官方客户端的 desktop profile 被 CLI 独占保护（rejectElectronProfile），
// 而 registry 又不方便起（内网/离线）时，把 packs/ 整个目录交给客户端内的 agent，
// 用 plugin_manager 工具的 install_bundle 逐个装。步骤见 docs/install-from-tarballs.md。
//
// 姿势与 tools/itest/pack-audit.mjs 保持一致：
//   · npm pack --ignore-scripts：发的是**仓库里已提交的可加载产物**，不跑
//     prepare/prepack/prepublishOnly（6 个包挂了这些脚本，跑了会用 src/ 重新生成 lib/，
//     产物就不是测过的那份了）；
//   · Windows 必须走 shell，否则 spawnSync 解析不到 npm.cmd，而且**不报错只给空输出**。
//
// 用法：node tools/pack-local.mjs
// 退出码：0 = 全部打包成功；1 = 有包打不出来（打不出来本身就是发布阻塞）

import { readdirSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO, 'packs');
const ROOT = join(REPO, 'packages');
const DOC = join(REPO, 'docs', 'install-from-tarballs.md');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const rows = [];
let failed = 0;
for (const dir of readdirSync(ROOT).sort()) {
  const pkgDir = join(ROOT, dir);
  const manifestPath = join(pkgDir, 'package.json');
  if (!existsSync(manifestPath)) continue;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    continue;
  }
  if (!manifest.name || manifest.private === true) {
    console.log(`- 跳过 private/无名包：${dir}`);
    continue;
  }
  const packed = spawnSync('npm', ['pack', '--pack-destination', `"${OUT}"`, '--ignore-scripts'], {
    cwd: pkgDir, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024,
  });
  const out = (packed.stdout || '') + (packed.stderr || '');
  const file = (out.match(/([\w.@/-]+?\.tgz)/) || [])[0];
  if (packed.status !== 0 || !file) {
    failed += 1;
    console.log(`FAIL ${manifest.name}: ${out.split('\n').filter(Boolean).slice(-2).join(' | ') || '(无输出)'}`);
    continue;
  }
  rows.push({ name: manifest.name, version: manifest.version, file, bytes: statSync(join(OUT, file)).size });
}

rows.sort((a, b) => a.name.localeCompare(b.name));
const lines = [`# ${rows.length} 个 tarball（${new Date().toISOString()}）`, ''];
for (const row of rows) {
  lines.push(row.name.padEnd(38) + row.version.padEnd(12) + row.file.padEnd(42) + (row.bytes / 1024).toFixed(1) + ' KiB');
}
writeFileSync(join(OUT, 'MANIFEST.txt'), lines.join('\n') + '\n');

// PATHS.txt：给「在客户端插件页里逐条粘贴」用的一行一条绝对路径。
// 顺序有讲究：① 元包与能力库列在最前并注明「不要装」——插件页对 .tgz 的 tarball 形态
// 不查 already-installed（内核 parseInstallSpec 的 tarball 分支），所以粘错了它真会去装；
// ② 依赖原生构建脚本的两个包放最后（better-sidebar 的 node-pty、graph-memory 的
// @photostructure/sqlite）：它们会让 pnpm 弹出「Allow these scripts and retry」，
// 而在放行之前**此后每一次**安装都会被同一个门禁整体拒掉，放最后就不会堵住别人。
// 原生依赖只有这两个（实测：harness-pet 零 dependencies，不碰 sqlite），别再往里加。
const NATIVE_LAST = ['@dsh-pack/dsh-better-sidebar', '@dsh-pack/graph-memory'];
const NOT_INSTALLABLE = new Set(['@dsh-pack/all', '@dsh-pack/host-capabilities']);
const installable = rows.filter((r) => !NOT_INSTALLABLE.has(r.name));
const ordered = [
  ...installable.filter((r) => r.name === '@dsh-pack/billion-context-dsh'),
  ...installable.filter((r) => !NATIVE_LAST.includes(r.name) && r.name !== '@dsh-pack/billion-context-dsh'),
  ...installable.filter((r) => NATIVE_LAST.includes(r.name)),
];
const pathLines = [
  '# 客户端「设置 → 插件」安装输入框里逐条粘贴的路径（一行一条，正斜杠写法）。',
  '# 前置：先把 @dsh-pack/all 的开关关掉（停用，不卸载），否则成员的行会被插入两次。',
  '# 顺序：第 1 条是「每轮对话 TypeError」的正主；最后 2 条会弹构建门禁，弹了就点它。',
  '# 想「一条装齐」别在这儿凑：走 INSTALL.md §3 的通道 A（本机 registry + 按名装',
  '# @dsh-pack/all@^0.2.0）—— 元包的 tarball 路径粘进来会被陈旧的 ^0.1.0 声明噎死。',
  '# 本文件由 node tools/pack-local.mjs 生成；详细步骤见同目录 INSTALL.md。',
  '',
  ...ordered.map((r, i) => `${String(i + 1).padStart(2)}. ${join(OUT, r.file).replace(/\\/g, '/')}`),
  '',
  '# 不要装这两个（列在这里是为了防止手滑，它们长得和别人一样）：',
  ...rows.filter((r) => NOT_INSTALLABLE.has(r.name)).map((r) => `# ${r.name} — ${join(OUT, r.file).replace(/\\/g, '/')}`),
];
writeFileSync(join(OUT, 'PATHS.txt'), pathLines.join('\n') + '\n');

if (existsSync(DOC)) copyFileSync(DOC, join(OUT, 'INSTALL.md'));
else console.log(`- 注意：${DOC} 不存在，packs/ 里不会有 INSTALL.md`);

console.log(`\n打包 ${rows.length} 个，失败 ${failed} 个 → ${OUT}`);
console.log(`可装 ${ordered.length} 个的粘贴清单：${join(OUT, 'PATHS.txt')}`);
console.log(lines.slice(2).join('\n'));
process.exit(failed === 0 ? 0 : 1);
