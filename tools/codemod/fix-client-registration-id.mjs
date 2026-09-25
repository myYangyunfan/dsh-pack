#!/usr/bin/env node
/**
 * 校正客户端 bundle 的 __ModuleLoader__.load({ id }) 注册名。
 *
 * 为什么要它：内核 `@deepseek-ai/dsh-client-modules` 的 boot graph 行以**包名**为 id，
 * `arrive(row)` 载完 bundle 后检查 `factories.has(row.id)`；而 `register()` 的键是
 * `stripClientSuffix(registration.id)`。所以 bundle 里注册裸名（`'dsh-input-fold'`）
 * 或旧 scope 名（`'@dsh-external/dsh-vision'`）时，那一行永远等不到，报
 *   client-modules: bundle … loaded without registering "@dsh-pack/x"
 * 该插件的 client 半边静默不挂载（不崩，只是没反应）。
 *
 * 只改 `exports["./client"]` 指向的那个文件：它才是内核为之下 graph 行的那一份。
 * 包里的其它 `__ModuleLoader__.load` 站点（例如 rolldown 编出来的
 * `lib/client-registry.js`，注册名由 `dsh.plugin.json` 那套旧打包方案决定）不在
 * boot graph 上，动它们只会把两个模块搞成同 id 的「duplicate factory registration」。
 *
 * 用法：
 *   node tools/codemod/fix-client-registration-id.mjs          # 只报告
 *   node tools/codemod/fix-client-registration-id.mjs --apply  # 改写
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const pkgsDir = join(root, 'packages');
const apply = process.argv.includes('--apply');

/** `window.__ModuleLoader__.load({ … id: 'x' … })` —— 取 load 之后第一个 id 字面量。 */
const LOAD_RE = /(__ModuleLoader__\.load\s*\(\s*\{[\s\S]{0,400}?id\s*:\s*)(['"])([^'"]+)\2/;

function clientFileOf(pkg) {
  const exp = (pkg.exports || {})['./client'];
  if (!exp) return null;
  const rel = typeof exp === 'string' ? exp : exp.default || exp.browser || null;
  return rel ? rel.replace(/^\.\//, '') : null;
}

const rows = [];
for (const dir of readdirSync(pkgsDir).sort()) {
  const manifest = join(pkgsDir, dir, 'package.json');
  if (!existsSync(manifest)) continue;
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  if (!pkg.name?.startsWith('@dsh-pack/')) continue;
  const rel = clientFileOf(pkg);
  if (!rel) continue;

  const abs = resolve(pkgsDir, dir, rel);
  const entry = { dir, rel, expected: pkg.name };
  if (!existsSync(abs)) {
    rows.push({ ...entry, bad: true, note: 'exports["./client"] 指向的文件不存在' });
    continue;
  }
  const m = readFileSync(abs, 'utf8').match(LOAD_RE);
  if (!m) {
    rows.push({ ...entry, bad: true, note: '文件里没有 __ModuleLoader__.load 注册' });
    continue;
  }
  const raw = m[3];
  const ok = raw === pkg.name || raw === `${pkg.name}/client`;
  rows.push({ ...entry, raw, ok, bad: !ok, prefix: m[1], quote: m[2], abs });
}

for (const r of rows) {
  if (!r.bad) console.log(`  ok   ${r.dir.padEnd(26)} ${r.rel.padEnd(20)} id="${r.raw}"`);
  else if (r.raw === undefined) console.log(`  MISS ${r.dir.padEnd(26)} ${r.rel.padEnd(20)} ${r.note}`);
  else console.log(`  BAD  ${r.dir.padEnd(26)} ${r.rel.padEnd(20)} id="${r.raw}" 应为 "${r.expected}"`);
}

const bad = rows.filter((r) => r.bad);
console.log(`\n声明 ./client 的包 ${rows.length} 个，注册名不符 ${bad.length} 个。`);

if (!apply) {
  console.log('（只报告；加 --apply 改写）');
  process.exit(0);
}

let rewritten = 0;
for (const r of bad) {
  if (r.raw === undefined) continue;
  const src = readFileSync(r.abs, 'utf8');
  const next = src.replace(LOAD_RE, (whole, pre, q, id) => `${pre}${q}${r.expected}${q}`);
  if (next === src) continue;
  writeFileSync(r.abs, next);
  rewritten += 1;
  console.log(`  改写 ${r.rel}: "${r.raw}" → "${r.expected}"  (${r.dir})`);
}
console.log(`\n--apply 完成：改写 ${rewritten} 个文件。`);
