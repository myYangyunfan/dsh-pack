#!/usr/bin/env node
// 扫出「实际会发布出去」的东西：每个包的许可、署名人、以及它自带多少 vendored 依赖。
// 给 THIRD_PARTY_NOTICES.md 提供数据源，避免像以前那样从 772 包的旧壳依赖树生成，
// 结果清单里还留着 electron / koffi 这些早就不发的东西。
//
// 用法：node tools/codemod/scan-licenses.mjs [--markdown]
//   --markdown 直接吐 THIRD_PARTY_NOTICES.md 里那张表（避免手抄出错）

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PKGS = join(REPO, 'packages');
const LIC_FILES = ['LICENSE', 'LICENSE.md', 'license', 'license.md', 'LICENCE'];

function repoUrl(j) {
  const r = j.repository;
  if (typeof r === 'string') return r;
  if (r && typeof r.url === 'string') return r.url;
  return '';
}

function copyrightHolder(text) {
  const m = text.match(/Copyright\s*(?:\(c\)\s*)?(\d{4})?[,\s]*([^\n]{1,70})/i);
  if (!m) return '';
  return (m[1] ? m[1] + ' ' : '') + m[2].trim();
}

const rows = [];
for (const dir of readdirSync(PKGS).sort()) {
  const pj = join(PKGS, dir, 'package.json');
  if (!existsSync(pj)) continue;
  let j;
  try {
    j = JSON.parse(readFileSync(pj, 'utf8'));
  } catch {
    rows.push({ dir, name: '(package.json 解析失败)', ver: '', lic: '★坏', holder: '', repo: '', vend: 0, licFile: false });
    continue;
  }
  const licFile = LIC_FILES.find((f) => existsSync(join(PKGS, dir, f))) || '';
  let holder = '';
  if (licFile) {
    try {
      holder = copyrightHolder(readFileSync(join(PKGS, dir, licFile), 'utf8'));
    } catch {}
  }
  let vend = 0;
  const nm = join(PKGS, dir, 'node_modules');
  if (existsSync(nm)) {
    for (const s of readdirSync(nm)) {
      if (s === '.bin' || s.startsWith('.')) continue;
      const abs = join(nm, s);
      if (s.startsWith('@') && statSync(abs).isDirectory()) vend += readdirSync(abs).length;
      else vend += 1;
    }
  }
  rows.push({
    dir,
    name: j.name || '(无 name)',
    ver: j.version || '',
    lic: j.license || (licFile ? '(仅 LICENSE 文件)' : '★缺 license 字段'),
    holder,
    repo: repoUrl(j),
    vend,
    licFile: Boolean(licFile),
  });
}

if (process.argv.includes('--markdown')) {
  console.log('| 包 | 版本 | license | LICENSE 文件 | 署名 / 上游 | 自带 vendored |');
  console.log('| --- | --- | --- | :---: | --- | ---: |');
  for (const r of rows) {
    const who = r.holder || r.repo || '-';
    console.log(
      `| \`${r.name}\` | ${r.ver} | ${r.lic.startsWith('★') ? '**' + r.lic + '**' : r.lic} | ` +
        `${r.licFile ? '✓' : '**✗**'} | ${who} | ${r.vend || '-'} |`
    );
  }
  process.exit(0);
}

console.log(`包数：${rows.length}\n`);
for (const r of rows) {
  const flags = [];
  if (!r.licFile) flags.push('无 LICENSE 文件');
  if (!r.holder && r.licFile) flags.push('LICENSE 无署名行');
  if (r.repo.includes('deepseek-ai/deepseek-harness')) flags.push('⚠ 指向上游内核仓库');
  console.log(`${r.name.padEnd(34)} ${r.ver.padEnd(14)} ${String(r.lic).padEnd(16)} vendored=${String(r.vend).padEnd(5)} ${flags.length ? '← ' + flags.join('; ') : ''}`);
  if (r.holder) console.log(`${''.padEnd(34)} 署名: ${r.holder}`);
}

const missing = rows.filter((r) => !r.licFile);
const noLic = rows.filter((r) => !r.lic.startsWith('(') && r.lic.startsWith('★'));
const vendored = rows.filter((r) => r.vend > 0);
const copyleft = rows.filter((r) => /GPL|AGPL/i.test(r.lic));
console.log(`\n== 汇总 ==`);
console.log(`  无 LICENSE 文件: ${missing.length} → ${missing.map((r) => r.dir).join(', ') || '无'}`);
console.log(`  缺 license 字段: ${noLic.length} → ${noLic.map((r) => r.dir).join(', ') || '无'}`);
console.log(`  自带 vendored 依赖的包: ${vendored.length} → ${vendored.map((r) => `${r.dir}(${r.vend})`).join(', ') || '无'}`);
console.log(`  copyleft 许可: ${copyleft.length} → ${copyleft.map((r) => `${r.dir}[${r.lic}]`).join(', ') || '无'}`);
