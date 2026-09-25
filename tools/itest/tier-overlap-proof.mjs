#!/usr/bin/env node
/**
 * 取证：两个分层元包同时安装时，内核组合出来的条目清单里会不会有重复行。
 *
 * 为什么怀疑这个：官方客户端真机报过
 *   7 entries did not activate
 *   file-changes (@dsh-pack/dsh-file-changes): webserver: duplicate exact route "/api/dsh-files/list"
 *   file-drop    (@dsh-pack/dsh-file-drop):    webserver: duplicate exact route "/dsh-file-drop/read-image"
 *   easyrewrite  (@dsh-pack/dsh-easyrewrite):  webserver: duplicate exact route "/bubble/log"
 * 而仓库里这三条路由各自只注册一次（枚举过全部 webServer.register），
 * profile 自己的补丁层也没有我们的行。剩下唯一能同时解释三条的形状是：
 * **同一个 host 半边被装配了两次**，第二次 register 撞墙。
 *
 * 内核 dsh-app-boot 的 applyEntryPatches 对 `insert` 的处理是
 * `data.push(...insert)`，只把新行塞进查找表，**不按 id 去重**；
 * composeEntries 就是「以空根 + 所有层的 insert 依次追加」，且注释明确说
 * 「flag 推导与 config dump 看到的就是真正挂载的那份」。
 * 所以若两个元包都插了 id: file-changes，组合结果里就该有两行。
 *
 * 这里直接调内核导出的 composeEntries，不自己重写判据。
 *
 *   node tools/itest/tier-overlap-proof.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const YAML = require('yaml');
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

let composeEntries;
try {
  ({ composeEntries } = require('@deepseek-ai/dsh-app-boot'));
} catch (error) {
  console.error(`跳过：需要 node_modules 里装着 @deepseek-ai/dsh-app-boot（${error.message}）`);
  process.exit(2);
}

function layerOf(tier) {
  const file = join(root, 'packages', `meta-${tier}`, 'cordis.patch.yml');
  if (!existsSync(file)) throw new Error(`缺 ${file}`);
  return YAML.parse(readFileSync(file, 'utf8'));
}

function ids(entries) {
  return entries.map((e) => String(e.id));
}

function duplicates(entries) {
  const seen = new Map();
  for (const id of ids(entries)) seen.set(id, (seen.get(id) || 0) + 1);
  return [...seen].filter(([, n]) => n > 1);
}

// ---- 1) 最小合成用例：先确认机制本身 ----
const synth = composeEntries([
  [{ insert: [{ id: 'x', name: '@dsh-pack/a' }] }],
  [{ insert: [{ id: 'x', name: '@dsh-pack/a' }] }],
]);
console.log(`合成用例：两层各插 1 行同 id → 组合后 ${synth.length} 行，重复 ${duplicates(synth).length} 个`);
if (synth.length === 1) {
  console.log('结论：内核按 id 去重了 —— duplicate route 不是这个原因，本取证到此为止。');
  process.exit(0);
}

// ---- 2) 真实元包：core ∪ all、plus ∪ all、core ∪ plus ----
const TIERS = ['core', 'plus', 'knowledge', 'tools', 'pocket', 'ui', 'all'];
const layers = {};
for (const t of TIERS) {
  const file = join(root, 'packages', `meta-${t}`, 'cordis.patch.yml');
  if (existsSync(file)) layers[t] = layerOf(t);
}

const membersOf = (t) => new Set(ids(layers[t].flatMap((p) => p.insert || [])));
const overlap = (a, b) => [...membersOf(a)].filter((id) => membersOf(b).has(id));

for (const a of Object.keys(layers)) {
  for (const b of Object.keys(layers)) {
    if (a >= b) continue;
    const shared = overlap(a, b);
    if (!shared.length) continue;
    const composed = composeEntries([layers[a], layers[b]]);
    const dup = duplicates(composed);
    console.log(
      `meta-${a} + meta-${b}: 共有成员 ${String(shared.length).padStart(2)} 个 → ` +
        `组合 ${String(composed.length).padStart(2)} 行，重复 id ${String(dup.length).padStart(2)} 个 ` +
        `${dup.length ? '★ 会双装配' : ''}`
    );
  }
}

// ---- 3) 重复行落在哪些包上：对照真机报的那三条路由 ----
const composed = composeEntries([layers.core, layers.all]);
const dup = duplicates(composed);
if (dup.length) {
  console.log(`\n其中带 host 半边（自己 register 路由）的重复成员，就是真机那批 duplicate route：`);
  for (const [id] of dup) console.log(`  - id: ${id}`);
}
