#!/usr/bin/env node
// 给**我们第一方**的插件包补 LICENSE 文件。
//
// 为什么不是「缺就一律复制根 LICENSE」：对第三方 vendored 包盖我们的版权声明，
// 是把许可信息写错——比缺文件更糟。所以这里有一份**按出处排除**的名单，
// 出处依据 docs/attributions.md 与 COMPANION_PLUGINS 的上游注释。
//
// 用法：node tools/codemod/add-first-party-license.mjs [--apply]

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APPLY = process.argv.includes('--apply');

// 明确第三方的包：不许盖我们的版权 LICENSE，需要各自的原文与署名人。
const EXCLUDED = {
  'dsh-super-injector': '声明 BSD-3-Clause。BSD-3 要求随包分发原始版权声明与免责条款，必须取上游原文，不能换成我们的 MIT。',
  'dsh-side-session': '原以 @dsh-external scope 分发、无 repository 字段，出处未核实。署名前先确认作者。',
  'graph-memory': '上游 adoresever/graph-memory（磁盘上已有 MIT 的 LICENSE，© 2026 adoresever）。只缺 package.json 的 license 字段，不要动文件。',
  'dsh-better-sidebar': '上游 omdsh-dev/DSH-better-sidebar（MIT），已有自己的 LICENSE。',
  'harness-pet': '上游 cakeni/harness-pet（MIT），已有自己的 LICENSE。',
  'dsh-community-market': '上游 anywhere-labs/deepseek-harness-desktop（MIT），已有自己的 LICENSE。',
  'dsh-pocket': 'GPL-2.0 上游包，许可文本必须是 GPL 而不是 MIT。',
  'billion-context-dsh': '含 vendored acp-kernel，许可需按上游核对。',
  'dsh-cardian': '出处需先核对（COMPANION_PLUGINS 未标上游）。',
  'dsh-vision': '声明 BSD-3-Clause 且无 LICENSE 文件——同 dsh-super-injector，必须取上游原文。',
  'dsh-easyrewrite': '发布在 npm 上（自更新走 registry.npmjs.org/dsh-easyrewrite），许可需与发布者确认。',
  'dsh-openclaw-bridge': '与仓库根 openclaw-dsh-bridge/ 有双副本（0.8.0 vs 0.7.1），出处先对齐。',
};

const roots = [join(REPO, 'packages'), join(REPO, 'dsh-desktop', 'assets', 'plugins')].filter(existsSync);
const template = readFileSync(join(REPO, 'LICENSE'), 'utf8');

let added = 0;
const skipped = [];
const seen = new Set();

for (const root of roots) {
  for (const dir of readdirSync(root).sort()) {
    const pkgDir = join(root, dir);
    if (!existsSync(join(pkgDir, 'package.json'))) continue;
    const bare = dir.replace(/^meta-/, '');
    if (seen.has(dir)) continue;
    seen.add(dir);

    if (EXCLUDED[bare] || EXCLUDED[dir]) {
      skipped.push(`${dir} —— ${EXCLUDED[bare] || EXCLUDED[dir]}`);
      continue;
    }
    if (readdirSync(pkgDir).some((f) => /^licen[cs]e(\.|$)/i.test(f))) continue;

    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    const lic = manifest.license?.license || manifest.license;
    if (lic && lic !== 'MIT') {
      skipped.push(`${dir} —— license 字段是 ${lic}，不自动补 MIT`);
      continue;
    }
    if (APPLY) writeFileSync(join(pkgDir, 'LICENSE'), template);
    added += 1;
    console.log(`  ${APPLY ? '写入' : '将写入'} ${root.replace(REPO + '/', '')}/${dir}/LICENSE`);
  }
}

console.log(`\n合计：${APPLY ? '已写入' : '可写入'} ${added} 个 LICENSE（模板=仓库根 MIT，逐字复制）`);
console.log(`按出处排除 ${skipped.length} 个：`);
for (const s of skipped) console.log('   · ' + s);
if (!APPLY) console.log('\n（dry-run；确认无误后加 --apply）');
