#!/usr/bin/env node
// 生成官方内核的「包名 + loader id」两份快照，供 tools/audit 做撞名与悬挂引用检查。
//
// 为什么需要它：本仓库的插件以 cordis bundle 形式装进官方客户端，补丁层是按 id 寻址的。
// 若我们的 loader id 与内核自带的 id 撞上，补丁会整行替换内核那一行——实测
// `plugin-manager` 就撞了（dsh-base/cordis.patch.yml），会静默顶替内核的插件管理器。
// 同理 dsh.client.inject 引用一个不存在的包名不会响亮失败，只会产出一个永不挂载的 client 半边。
// 这两份快照就是把「撞名」变成可机器检查的事前条件。
//
// 数据来源是 npm 装的 @deepseek-ai/dsh 闭包（不是官方客户端的 app.asar），因此 CI 无需解包 asar。
//
// 用法：node tools/audit/extract-kernel-snapshots.mjs <node_modules 目录>
// 例：  node tools/audit/extract-kernel-snapshots.mjs ../kernel/node_modules

import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE);

const root = process.argv[2];
if (!root || !existsSync(root)) {
  console.error(`用法: node ${basename(import.meta.filename)} <node_modules 目录>`);
  console.error(`  （该目录是 @deepseek-ai/dsh 安装后的 node_modules 根）`);
  process.exit(2);
}

// ---- 1. 全部包名（含各 scope），用于撞名与 inject 悬挂引用检查 ----
const packages = new Set();
function scanDir(dir, scoped) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '.bin' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (!scoped && entry.name.startsWith('@')) {
      scanDir(full, true);
      continue;
    }
    if (existsSync(join(full, 'package.json'))) {
      try {
        const manifest = JSON.parse(readFileSync(join(full, 'package.json'), 'utf8'));
        if (typeof manifest.name === 'string') packages.add(manifest.name);
        else if (scoped) packages.add(`${dir.split('\\').pop().split('/').pop()}/${entry.name}`);
      } catch {
        if (scoped) {
          const scope = basename(dirname(full));
          packages.add(`${scope}/${entry.name}`);
        }
      }
    } else if (scoped) {
      packages.add(`${basename(dir)}/${entry.name}`);
    }
  }
}
scanDir(root, false);

// 顶层目录名也补进去：pnpm hoisted 布局下有些包只有目录、package.json 解析失败
const kernelVersion = (() => {
  try {
    return JSON.parse(readFileSync(join(root, '@deepseek-ai', 'dsh', 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
})();

// ---- 2. 内核自带的所有 cordis loader id ----
const ids = new Map(); // id -> 首次出现的来源文件（相对路径）
function findCordisFiles(dir, depth = 0, out = []) {
  if (depth > 3 || !existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '.bin' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    for (const cand of ['cordis.yml', 'cordis.patch.yml']) {
      const f = join(full, cand);
      if (existsSync(f)) out.push(f);
    }
    // @scope/ 目录下一层再找
    if (entry.name.startsWith('@')) findCordisFiles(full, depth, out);
    if (existsSync(join(full, 'node_modules'))) findCordisFiles(join(full, 'node_modules'), depth + 1, out);
  }
  return out;
}

// 只取每个包目录自己的 cordis*.yml（不递归进它的 node_modules，避免重复计入同一传递包）
const bundleRoots = [];
for (const scopeDir of readdirSync(root)) {
  const abs = join(root, scopeDir);
  if (scopeDir.startsWith('@')) {
    if (!existsSync(abs)) continue;
    for (const pkg of readdirSync(abs)) bundleRoots.push(join(abs, pkg));
  } else if (existsSync(abs)) {
    bundleRoots.push(abs);
  }
}

for (const pkgDir of bundleRoots) {
  for (const cand of ['cordis.yml', 'cordis.patch.yml']) {
    const f = join(pkgDir, cand);
    if (!existsSync(f)) continue;
    let text;
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    const rel = f.slice(root.length + 1).replace(/\\/g, '/');
    // 不依赖 YAML 解析器：id 总是行首 `- id: X` 或 `    - id: X` 形态
    for (const m of text.matchAll(/^\s*-?\s*id:\s*(['"]?)([^'"\s#][^'"\s#]*)\1\s*$/gm)) {
      if (!ids.has(m[2])) ids.set(m[2], rel);
    }
  }
}

// dsh 包自身 lib/ 里也可能有内联 entry 列表
const dshLib = join(root, '@deepseek-ai', 'dsh', 'lib');
if (existsSync(dshLib)) {
  for (const f of readdirSync(dshLib)) {
    if (!f.endsWith('.yml')) continue;
    try {
      const text = readFileSync(join(dshLib, f), 'utf8');
      for (const m of text.matchAll(/^\s*-?\s*id:\s*(['"]?)([^'"\s#][^'"\s#]*)\1\s*$/gm)) {
        if (!ids.has(m[2])) ids.set(m[2], `@deepseek-ai/dsh/lib/${f}`);
      }
    } catch {}
  }
}

const sortedPackages = [...packages].sort();
const sortedIds = [...ids.keys()].sort();

writeFileSync(
  join(OUT_DIR, 'kernel-packages.json'),
  JSON.stringify({ _meta: '由 extract-kernel-snapshots.mjs 生成，勿手改', kernelVersion, count: sortedPackages.length, packages: sortedPackages }, null, 2) + '\n'
);
writeFileSync(
  join(OUT_DIR, 'kernel-entry-ids.json'),
  JSON.stringify({ _meta: '由 extract-kernel-snapshots.mjs 生成，勿手改', kernelVersion, count: sortedIds.length, ids: sortedIds }, null, 2) + '\n'
);

console.log(`内核版本: ${kernelVersion ?? '(未知)'}`);
console.log(`包名快照: ${sortedPackages.length} -> tools/audit/kernel-packages.json`);
console.log(`id 快照 : ${sortedIds.length} -> tools/audit/kernel-entry-ids.json`);
console.log(`其中 @deepseek-ai/* : ${sortedPackages.filter((n) => n.startsWith('@deepseek-ai/')).length}`);
