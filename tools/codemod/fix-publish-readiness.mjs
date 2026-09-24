#!/usr/bin/env node
// Stage 1.4 剩余项：去掉 private:true，补 files 允许清单。
//
// 为什么必须补 files 而不是「能发出去就行」：npm 在没有 files 字段时会打整个目录，
// 于是 src/、test/、以及**内嵌了完整上游 TypeScript 的 .map** 都会进 tarball
// （dsh-community-market/lib/index.js.map 就是实例），体积也会失控
// （dsh-better-sidebar 目录下有 473MB 未跟踪的 node_modules）。
//
// 清单是**从磁盘实际布局推导**的，不硬编码包名表：
//   · 产物目录：lib/ dist/ client/ core/ assets/ bin/ 中真实存在的那些
//   · main / exports 指到 src/ 时，src/ 必须一并带上（否则装上去解析不到入口）
//   · 必带元数据：package.json、README*、LICENSE*、cordis.patch.yml
// 做完由 J2（npm pack 真打 tarball）验收——路径安装掩盖 files 错误，tarball 不会。
//
// 用法：node tools/codemod/fix-publish-readiness.mjs [--apply]

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APPLY = process.argv.includes('--apply');
const ROOTS = [join(REPO, 'packages'), join(REPO, 'dsh-desktop', 'assets', 'plugins')].filter(existsSync);

const ARTIFACT_DIRS = ['lib', 'dist', 'client', 'core', 'bin', 'assets', 'public', 'static'];

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// 从 main / exports 里把所有相对路径抠出来，判断有没有指向 src/
function referencedDirs(manifest) {
  const paths = new Set();
  const walk = (v) => {
    if (typeof v === 'string') paths.add(v);
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  walk(manifest.main);
  walk(manifest.bin);
  walk(manifest.exports);
  for (const p of paths) {
    const top = String(p).replace(/^\.\//, '').split('/')[0];
    if (ARTIFACT_DIRS.includes(top) || top === 'src') return true;
  }
  return false;
}

function needsSrc(manifest) {
  const hay = JSON.stringify({ main: manifest.main, bin: manifest.bin, exports: manifest.exports });
  return /(^|["'\s(]\.?\/?)src\//.test(hay);
}

let touched = 0;
const report = [];
const seen = new Set();

for (const root of ROOTS) {
  for (const dir of readdirSync(root).sort()) {
    const pkgDir = join(root, dir);
    const pjPath = join(pkgDir, 'package.json');
    if (!existsSync(pjPath)) continue;
    const key = `${root}|${dir}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let manifest;
    try {
      manifest = JSON.parse(readFileSync(pjPath, 'utf8'));
    } catch {
      report.push({ dir, note: 'package.json 解析失败，跳过' });
      continue;
    }
    // 只处理我们自己会发布的包；工作区根没有 name 的不算
    if (!manifest.name) continue;

    const changes = [];
    if (manifest.private === true) {
      delete manifest.private;
      changes.push('去掉 private:true');
    }
    if (!manifest.files || !Array.isArray(manifest.files) || manifest.files.length === 0) {
      const present = ARTIFACT_DIRS.filter((d) => isDir(join(pkgDir, d)));
      const files = [...present];
      if (needsSrc(manifest) && isDir(join(pkgDir, 'src')) && !files.includes('src')) files.push('src');
      for (const meta of readdirSync(pkgDir)) {
        if (isDir(join(pkgDir, meta))) continue;
        if (/^readme(\.|$)/i.test(meta) || /^licen[cs]e(\.|$)/i.test(meta) || meta === 'cordis.patch.yml' || meta === 'CHANGELOG.md') {
          files.push(meta);
        }
      }
      // npm 自带 package.json，不必列
      manifest.files = [...new Set(files)].sort();
      changes.push(`补 files（${manifest.files.length} 项：${manifest.files.join(' ')}）`);
    }

    if (!changes.length) continue;
    touched += 1;
    report.push({ dir: `${basename(root)}/${dir}`, changes });
    if (APPLY) {
      const original = readFileSync(pjPath, 'utf8');
      const indent = original.includes('\n  "') ? 2 : 4;
      writeFileSync(pjPath, JSON.stringify(manifest, null, indent) + '\n');
    }
  }
}

for (const r of report) {
  if (r.note) {
    console.log(`  · ${r.dir}: ${r.note}`);
    continue;
  }
  console.log(`  ${r.dir}`);
  for (const c of r.changes) console.log(`      - ${c}`);
}
console.log(`\n合计：${APPLY ? '已改' : '可改'} ${touched} 个 package.json，另跳过/异常 ${report.filter((r) => r.note).length} 个`);
if (!APPLY) console.log('（dry-run；确认无误后加 --apply）');
