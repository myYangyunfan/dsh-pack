#!/usr/bin/env node
/**
 * 把页内 bundle 里带尺寸后缀的图标成员访问改成内核真实导出名。
 *
 * 起因：官方客户端控制台反复报
 *   slot entry crashed in 'sidebar.footer.action': Minified React error #130
 *   slot entry crashed in 'shell.overlay':        Minified React error #130
 * #130 = 「渲染的元素类型是 undefined」。dsh-community-market 的 MarketLauncher 传
 * `icon: jsx(primitives.IconCordisPluginOutline14)`，而当前内核没有这个导出 ⇒ 成员恒
 * undefined，primitives 拿它当组件渲染就崩，整条 slot 退位（侧栏按钮/浮层直接消失）。
 *
 * 内核的真实命名（tools/audit/kernel-primitives-icons.json，取自 primitives 的
 * `export { … }` 清单）不带尺寸后缀，而是按**描边粗细**分变体：
 *   IconSearchOutline16  →  IconSearchOutlineRegular / IconSearchOutlineMedium
 * 实际像素尺寸本来就由 `size:` 属性给，所以选哪个变体只影响线条粗细。
 * 这里统一取 `Regular`（细），拿不到再退 `Medium`。
 *
 * ⚠ 这脚本自伤过两次，都写进判据里防住：
 *   1) 替换串写 '$1$3' 而正则只有 2 个组 ⇒ 字面量 `$3` 被写进产物。现在用回调拼接。
 *   2) 只把 `14/16` 去掉、留下裸名 IconSearchOutline ⇒ 内核根本没有裸名，等于没修，
 *      而当时门禁因为快照取的是「文件里任何大写标识符」而判它"存在"，放了绿。
 *      现在：目标名必须逐个命中快照，且**快照本身只认 export 清单**；
 *      有任何一个对不上就拒绝落盘。
 *
 * 用法：node tools/codemod/fix-icon-size-suffix.mjs [--apply]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PKGS = join(REPO, 'packages');
const APPLY = process.argv.includes('--apply');

const SNAP = join(REPO, 'tools', 'audit', 'kernel-primitives-icons.json');
if (!existsSync(SNAP)) {
  console.error('✗ 缺 tools/audit/kernel-primitives-icons.json，先跑 node tools/audit/extract-kernel-snapshots.mjs node_modules');
  process.exit(2);
}
const snapshot = JSON.parse(readFileSync(SNAP, 'utf8'));
const ICONS = new Set(snapshot.icons || []);
if (ICONS.size < 100) {
  console.error(`✗ 图标快照只有 ${ICONS.size} 个名字，不可信，中止`);
  process.exit(2);
}
// 防裸名再次溜进去：快照里不该有任何「既不以 Regular/Medium/Artwork 结尾、又能被当成图标」的名字。
const bare = [...ICONS].filter((n) => !/(Regular|Medium|Artwork)$/.test(n));
if (bare.length) console.warn(`△ 快照含 ${bare.length} 个无变体后缀的名字（可能合法，如 IconSparkle）：${bare.slice(0, 5).join(', ')}`);

/** `.Icon<名>14|16` —— 只吃成员访问。 */
const STALE = /\.Icon[A-Za-z0-9]+?1[46]\b/g;

/** 选一个内核真实存在的变体；都不存在返回 null（调用方据此拒绝落盘）。 */
function targetFor(staleMember) {
  const base = staleMember.slice(1).replace(/1[46]$/, ''); // 去掉前导点与尺寸后缀
  for (const candidate of [`${base}Regular`, `${base}Medium`, `${base}Artwork`, base]) {
    if (ICONS.has(candidate)) return `.${candidate}`;
  }
  return null;
}

const planned = [];
const unresolved = [];
let total = 0;

for (const dir of readdirSync(PKGS).sort()) {
  const pdir = join(PKGS, dir);
  const files = new Set();
  for (const sub of ['lib', 'client', '.']) {
    const d = join(pdir, sub);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) if (f.endsWith('.js')) files.add(join(d, f));
  }
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const stale = [...new Set([...src.matchAll(STALE)].map((m) => m[0]))];
    if (!stale.length) continue;
    const map = new Map();
    for (const s of stale) {
      const t = targetFor(s);
      if (t === null) { unresolved.push(`${dir}/${file.slice(pdir.length + 1)}: ${s} 在内核快照里找不到任何变体`); continue; }
      map.set(s, t);
    }
    if (map.size !== stale.length) continue; // 该文件有解不出的名字 ⇒ 整个文件不动
    const next = src.replace(STALE, (whole) => map.get(whole));
    // 复核：改完不该再有后缀形态，也不该引入快照里没有的 Icon 成员
    if (STALE.test(next)) { STALE.lastIndex = 0; unresolved.push(`${dir}: 替换后仍有残留`); continue; }
    STALE.lastIndex = 0;
    const bad = [...next.matchAll(/\.Icon([A-Za-z0-9]+)\b/g)].map((m) => `Icon${m[1]}`).filter((n) => !ICONS.has(n));
    if (bad.length) { unresolved.push(`${dir}: 替换后仍不存在于快照 → ${[...new Set(bad)].slice(0, 4).join(', ')}`); continue; }
    const rel = file.slice(REPO.length + 1).replace(/\\/g, '/');
    const count = (src.match(STALE) || []).length;
    STALE.lastIndex = 0;
    total += count;
    planned.push({ file, src: next, rel, count });
  }
}

for (const p of planned) console.log(`  ${p.rel}: ${p.count} 处`);
console.log(`\n共 ${planned.length} 个文件、${total} 处。`);

if (unresolved.length) {
  console.error('\n✗ 拒绝落盘，以下名字解析不出内核真实变体：');
  for (const u of unresolved) console.error(`  · ${u}`);
  process.exit(1);
}
if (APPLY) {
  for (const p of planned) writeFileSync(p.file, p.src);
  console.log('--apply 已落盘（每个目标名都已逐个命中内核 export 快照）。');
} else {
  console.log('（校验全部通过，但未落盘；加 --apply）');
}
