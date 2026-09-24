// 临时排查：把 dep-closure 报的几条 specifier 在源码里的**上下文原样打出来**，
// 用来判断是「包真缺声明」还是「扫描器把非说明符当成了说明符」。
import { readFileSync } from 'node:fs';

const targets = [
  ['packages/dsh-cardian/src/index.js', '<pkg>/package.json'],
  ['packages/dsh-super-injector/lib/index.js', 'tsdown'],
  ['packages/dsh-super-injector/lib/index.js', '@standard-schema/spec'],
  ['packages/dsh-super-injector/lib/index.js', '@deepseek-ai/dsh-llm'],
];

for (const [file, needle] of targets) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    console.log(`${file}: 读不到`);
    continue;
  }
  const lines = text.split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    if (line.includes(needle)) hits.push({ n: i + 1, line: line.trim().slice(0, 150) });
  });
  console.log(`\n### ${file}  找 "${needle}"  → ${hits.length} 处`);
  for (const h of hits.slice(0, 4)) console.log(`  L${h.n}: ${h.line}`);
  if (!hits.length) console.log('  （没有字面命中 —— 说明它在被剥离/规范化之后的形态里）');
}
