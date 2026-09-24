// 阶段 1.1 codemod：清掉引用了「官方内核里根本不存在的包」的 inject/external/peer 条目。
//
// 为什么必须清：dsh.client.inject 引用一个不存在的包不会在组合期响亮失败，
// 它会产出一个永不挂载的 client 半边，只在 Web boot audit 里以逐行 import 失败的形式出现。
// 实测（tools/audit/kernel-packages.json，取自官方 0.1.7-rc.1 闭包 277 个 @deepseek-ai 包）：
//   @deepseek-ai/dsh-client-runtime      —— 不存在
//   @deepseek-ai/dsh-client-web-react    —— 不存在
// 而 @deepseek-ai/dsh-client-locale / -ui-layout / -ui-sidebar / -api-remotes 等都在。
//
// 只删这两个名字，其余条目原样保留。跑完打印命中数（本仓库约定：批量改动必须打印命中数）。

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PHANTOM = new Set(['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-web-react']);
const ROOTS = [join(REPO, 'dsh-desktop', 'assets', 'plugins'), join(REPO, 'packages')].filter(existsSync);

let touched = 0;
const report = [];

for (const root of ROOTS) {
  for (const dir of readdirSync(root).sort()) {
    const pj = join(root, dir, 'package.json');
    if (!existsSync(pj)) continue;
    const original = readFileSync(pj, 'utf8');
    let manifest;
    try {
      manifest = JSON.parse(original);
    } catch {
      console.error(`跳过（package.json 解析失败）: ${dir}`);
      continue;
    }
    const removed = [];
    const scrub = (obj, field, where) => {
      if (!obj || !Array.isArray(obj[field])) return;
      const kept = obj[field].filter((entry) => {
        const base = String(entry).split('/')[0].startsWith('@')
          ? String(entry).split('/').slice(0, 2).join('/')
          : String(entry).split('/')[0];
        if (PHANTOM.has(String(entry)) || PHANTOM.has(base)) {
          removed.push(`${where}.${field}: ${entry}`);
          return false;
        }
        return true;
      });
      if (kept.length) obj[field] = kept;
      else if (obj[field].length === 0) delete obj[field];
    };

    // peerDependencies / devDependencies 都是映射不是数组，单独处理。
    // devDependencies 也要扫：stage-1.1 最初只清了 inject/external/peer，
    // 结果 dsh-prompt-optimizer 的 devDependencies 里至今留着
    // @deepseek-ai/dsh-client-runtime 与 -client-web-react 两个幽灵名。
    for (const field of ['peerDependencies', 'devDependencies']) {
      if (manifest[field] && typeof manifest[field] === 'object') {
        for (const name of Object.keys(manifest[field])) {
          if (PHANTOM.has(name)) {
            removed.push(`${field}: ${name}`);
            delete manifest[field][name];
          }
        }
        if (Object.keys(manifest[field]).length === 0) delete manifest[field];
      }
    }
    if (manifest.dsh?.client) {
      scrub(manifest.dsh.client, 'inject', 'dsh.client');
      scrub(manifest.dsh.client, 'external', 'dsh.client');
      if (manifest.dsh.client.inject === undefined && manifest.dsh.client.external === undefined) {
        // 只剩 platform/immediately 也算合法的 client 声明，保持原样
      }
    }

    if (!removed.length) continue;
    const next = JSON.stringify(manifest, null, 2) + '\n';
    if (next === original) continue;
    writeFileSync(pj, next);
    touched += 1;
    report.push({ dir, removed });
  }
}

for (const r of report) {
  console.log(`${r.dir}: 删除 ${r.removed.length} 条悬挂引用`);
  for (const line of r.removed) console.log(`    ${line}`);
}
console.log(`\n合计：改动 ${touched} 个 package.json，删除 ${report.reduce((a, r) => a + r.removed.length, 0)} 条悬挂引用`);
