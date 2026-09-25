#!/usr/bin/env node
// dsh-better-sidebar 依赖分层修正：
//   · dependencies 只留运行期真的静态 import 的：ws、schemastery
//     （lib/index.js:4-5 顶层 import，缺了就 ERR_MODULE_NOT_FOUND）
//   · node-pty → optionalDependencies：代码里是**刻意懒加载**的
//     （lib/index.js:1020-1038，issue #140：绝不能静态 import，否则装脚本被
//     pnpm 11 拦下或 store 被裁就整个插件起不来）。放在 dependencies 会让
//     每个装 plus 层的用户都被要求放行一次 node-gyp 构建脚本 —— 而它缺席时
//     本来就有降级路径。optional 才是它的真实语义。
//   · 24 个 @codemirror/* / @lezer / clsx / mermaid / react-icons / rxjs
//     → devDependencies：tsdown 已经把产物内联进 lib/client*.js，运行期不需要解析
//     （dep-closure 那 8 条 warning 里最大的一坨就是它）。
//
// 用法：node tools/codemod/fix-better-sidebar-deps.mjs [--apply]

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PJ = join(REPO, 'packages', 'dsh-better-sidebar', 'package.json');
const APPLY = process.argv.includes('--apply');

const RUNTIME = ['ws', 'schemastery'];
const OPTIONAL = ['node-pty'];

const j = JSON.parse(readFileSync(PJ, 'utf8'));
const deps = j.dependencies || {};

const kept = {};
const movedToDev = [];
const movedToOpt = [];
const leftover = [];

for (const [name, ver] of Object.entries(deps)) {
  if (RUNTIME.includes(name)) kept[name] = ver;
  else if (OPTIONAL.includes(name)) { movedToOpt.push(name); }
  else if (name.startsWith('@deepseek-ai/')) {
    // 内核包绝不该出现在 dependencies（会装出第二份物理拷贝 → 官方客户端拒绝启动）
    movedToDev.push(name);
    leftover.push(name + ' ← 内核包，按 R3 不该在 dependencies');
  } else movedToDev.push(name);
}

j.dependencies = kept;
j.optionalDependencies = { ...(j.optionalDependencies || {}), 'node-pty': deps['node-pty'] };
j.devDependencies = { ...(j.devDependencies || {}), ...Object.fromEntries(movedToDev.map((n) => [n, deps[n]])) };
for (const n of movedToOpt) delete j.devDependencies[n];

console.log(`  dependencies 保留 : ${Object.keys(kept).join(', ')}`);
console.log(`  → optional        : ${movedToOpt.join(', ')}`);
console.log(`  → devDependencies  : ${movedToDev.length} 个`);
if (leftover.length) console.log(`  ⚠ ${leftover.join('; ')}`);
console.log(`  dependencies 由 ${Object.keys(deps).length} 缩到 ${Object.keys(kept).length}`);

if (APPLY) {
  const original = readFileSync(PJ, 'utf8');
  const indent = original.includes('\n  "') ? 2 : 4;
  writeFileSync(PJ, JSON.stringify(j, null, indent) + '\n');
  console.log('  ✅ 已写入');
} else {
  console.log('  （dry-run；确认后加 --apply）');
}
