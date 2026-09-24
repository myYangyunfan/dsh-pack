#!/usr/bin/env node
// 修 scan-self-name-mismatch.mjs 查出的「改名遗留自身引用」：
// 把包内代码里自称的旧 @deepseek-ai/<包> 换成该包现在的 @dsh-pack/<包>。
//
// 只动功能性位置（id: / const name = / name:），不动文件头注释与说明文字。
// 每处都打印命中数（本仓库约定：批量改动必须打印命中数）。
//
// 用法：node tools/codemod/fix-self-name-mismatch.mjs [--apply]

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT = join(REPO, 'packages');
const APPLY = process.argv.includes('--apply');

function jsFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) jsFiles(abs, out);
    else if (/\.(js|cjs|mjs)$/.test(e.name)) out.push(abs);
  }
  return out;
}

let files = 0;
let edits = 0;
for (const dir of readdirSync(ROOT).sort()) {
  const pkgDir = join(ROOT, dir);
  const pj = join(pkgDir, 'package.json');
  if (!existsSync(pj)) continue;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(pj, 'utf8'));
  } catch {
    continue;
  }
  const self = manifest.name;
  if (!self || !self.startsWith('@dsh-pack/')) continue;
  const legacy = self.replace(/^@dsh-pack\//, '@deepseek-ai/');

  for (const f of jsFiles(pkgDir)) {
    const lines = readFileSync(f, 'utf8').split('\n');
    let changed = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.includes(legacy)) continue;
      const trimmed = line.trim();
      // 注释行放过：不影响运行期，改了反而制造噪音 diff
      if (/^(\/\/|\/?\*|<!--)/.test(trimmed)) continue;
      // 只认自身标识的赋值/声明位置
      if (!/(^|[,{\s])(id|name)\s*[:=]\s*["'`]/.test(trimmed) && !/__ModuleLoader__/.test(trimmed)) continue;
      // 模板里生成的源码（会被写进别的包）不动：那属于被生成物，不是本包自称
      if (/^\s*return\s*`/.test(trimmed)) continue;
      lines[i] = line.split(legacy).join(self);
      changed += 1;
    }
    if (changed) {
      files += 1;
      edits += changed;
      console.log(`  ${f.slice(REPO.length + 1).replace(/\\/g, '/')}  ${changed} 处 → ${self}`);
      if (APPLY) writeFileSync(f, lines.join('\n'));
    }
  }
}

console.log(`\n合计：${APPLY ? '已改' : '可改'} ${files} 个文件、${edits} 处自称`);
if (!APPLY) console.log('（dry-run；确认无误后加 --apply）');
