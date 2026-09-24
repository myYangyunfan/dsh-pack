#!/usr/bin/env node
// 找「改名遗留的自身引用」：包内代码用旧的 @deepseek-ai/* 名字自称，
// 而补丁行 name 与 package.json 已经是 @dsh-pack/*。
//
// 为什么这是静默故障而不是洁癖：
//   · client bundle 用 window.__ModuleLoader__.load({ id }) 注册自己，
//     浏览器模块系统按行 name 去要模块；id 对不上 → 页内半边**根本不加载**，不报错。
//   · cordis 插件导出的 name 与行 name 不一致同样会让按名寻址的逻辑落空。
// 现在 dep-closure 只查裸说明符可否解析，不查「自身标识是否一致」，所以单独扫。
//
// 用法：node tools/codemod/scan-self-name-mismatch.mjs

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOTS = [join(REPO, 'packages')].filter(existsSync);

function jsFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) jsFiles(abs, out);
    else if (/\.(js|cjs|mjs)$/.test(e.name)) out.push(abs);
  }
  return out;
}

let problems = 0;
for (const root of ROOTS) {
  for (const dir of readdirSync(root).sort()) {
    const pkgDir = join(root, dir);
    if (!existsSync(join(pkgDir, 'package.json'))) continue;
    let st;
    try {
      st = statSync(pkgDir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    const self = manifest.name;
    if (!self) continue;
    // 该包用旧 scope 自称的地方
    const legacy = self.replace(/^@dsh-pack\//, '@deepseek-ai/');
    const hits = [];
    for (const f of jsFiles(pkgDir)) {
      let text;
      try {
        text = readFileSync(f, 'utf8');
      } catch {
        continue;
      }
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        // 只看**功能性**位置：id: / const name = / name: ；文件头注释与说明文字不算
        if (/^\s*\/?\*|^\s*\/\//.test(line)) return;
        if (!line.includes(legacy)) return;
        if (/^\s*(\/\/|\*)/.test(line)) return;
        if (/(id|name)\s*[:=]\s*["']/.test(line) || /__ModuleLoader__/.test(line)) {
          hits.push({ rel: f.slice(pkgDir.length + 1).replace(/\\/g, '/'), n: i + 1, t: line.trim().slice(0, 110) });
        }
      });
    }
    if (hits.length) {
      problems += hits.length;
      console.log(`${dir}  （自称应为 ${self}）`);
      for (const h of hits) console.log(`   ${h.rel}:${h.n}  ${h.t}`);
    }
  }
}
console.log(problems ? `\n★ 共 ${problems} 处改名遗留的自身引用` : '\n✅ 未发现自身引用不一致');
process.exitCode = problems ? 1 : 0;
