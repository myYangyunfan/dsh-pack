#!/usr/bin/env node
// 修掉两个真实发布阻塞（本地 registry 实测暴露）：
//
// ① 发布期脚本：6 个包挂了 prepare / prepack / prepublishOnly。
//    npm publish **一定会执行 prepare**，于是真发 npm 时当场失败
//    （本地 registry 已复现 graph-memory 与 harness-pet 失败）。
//    更麻烦的是即便构建跑通，它会用 src/ 重新生成 lib/，
//    发出去的就不再是我们测过的那份产物 —— 本仓库的约定是
//    「预构建产物随包提交」（loader 只吃 .js，且没有 CI 构建环节）。
//    处理：删掉发布期钩子，保留 build/bundle 手动脚本不动。
//
// ② sharp 只在惰性 createRequire 兜底链里用到，链尾本来就有
//    "sharp is not available in this desktop runtime" 的干净降级；
//    却把 ~30MB 原生二进制变成必装依赖。移进 optionalDependencies。
//
// 用法：node tools/codemod/fix-publish-blockers.mjs [--apply]

import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PKGS = join(REPO, 'packages');
const APPLY = process.argv.includes('--apply');

const HOOKS = ['prepare', 'prepack', 'postpack', 'prepublish', 'prepublishOnly'];
let hookEdits = 0;
let sharpEdits = 0;

for (const dir of readdirSync(PKGS).sort()) {
  const pj = join(PKGS, dir, 'package.json');
  if (!existsSync(pj)) continue;
  const original = readFileSync(pj, 'utf8');
  let j;
  try {
    j = JSON.parse(original);
  } catch {
    console.log(`  ✗ ${dir}: package.json 解析失败，跳过`);
    continue;
  }
  const notes = [];

  // ① 发布期钩子
  const scripts = j.scripts || {};
  const present = HOOKS.filter((h) => scripts[h]);
  if (present.length) {
    for (const h of present) {
      notes.push(`删 ${h}="${scripts[h]}"`);
      delete scripts[h];
      hookEdits += 1;
    }
    j.scripts = scripts;
  }

  // ② sharp → optionalDependencies
  if (j.dependencies && j.dependencies.sharp) {
    const v = j.dependencies.sharp;
    delete j.dependencies.sharp;
    j.optionalDependencies = { ...(j.optionalDependencies || {}), sharp: v };
    if (Object.keys(j.dependencies).length === 0) delete j.dependencies;
    notes.push(`sharp ${v} → optionalDependencies`);
    sharpEdits += 1;
  }

  if (!notes.length) continue;
  console.log(`  ${dir}`);
  for (const n of notes) console.log(`      - ${n}`);
  if (APPLY) {
    const indent = original.includes('\n  "') ? 2 : 4;
    writeFileSync(pj, JSON.stringify(j, null, indent) + '\n');
  }
}

console.log(`\n合计：发布期钩子 ${hookEdits} 处，sharp 调整 ${sharpEdits} 处${APPLY ? '（已写入）' : '（dry-run，加 --apply 落盘）'}`);
