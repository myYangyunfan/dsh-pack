// 宿主半边接真实 settings API：插适配器 + 换掉不存在的 register 调用。
// 每一步都断言命中数，不成立就中止并回滚 —— 上一版 codemod 静默没改成功，
// 却只被我 grep 了 ⚠ 行，于是「看起来改完了」，这是假绿。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOST_SNIPPET } from '../snippets/settings-scope-host.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APPLY = process.argv.includes('--apply');

// entryId 必须是 cordis.patch.yml 里那条 `- id:`，因为 settings.describe() 的 ns 就是它。
const SPEC = [
  { dir: 'dsh-vision', entryId: 'dsh-vision' },
  { dir: 'dsh-prompt-custom', entryId: 'prompt-custom' },
  { dir: 'dsh-subagent-lens', entryId: 'dsh-subagent-lens' },
  { dir: 'dsh-openclaw-bridge', entryId: 'openclaw-bridge' },
  { dir: 'dsh-better-sidebar', entryId: 'better-sidebar' },
];

/** 在**最后一条顶层 import** 之后插入（不能用 `^function apply` 当锚点：注释里的示例会抢匹配）。 */
function insertAfterImports(src, snippet) {
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const lines = src.split(/\r?\n/);
  let last = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^import\s.+?;$/.test(lines[i])) last = i;
  }
  if (last < 0) throw new Error('找不到顶层 import 行');
  const out = [...lines.slice(0, last + 1), '', ...snippet.split('\n'), ...lines.slice(last + 1)];
  return out.join(eol);
}

/** 按花括号配平吃掉整个调用（含结尾的 `)`），返回替换后的文本与命中数。 */
function replaceRegister(src, replacement) {
  const re = /ctx\.settings\.register\(|sctx\.settings\.register\(/g;
  let out = '';
  let i = 0;
  let hits = 0;
  let m;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let j = open; j < src.length; j += 1) {
      if (src[j] === '(') depth += 1;
      else if (src[j] === ')') {
        depth -= 1;
        if (depth === 0) { end = j + 1; break; }
      }
    }
    if (end < 0) throw new Error('register 调用括号不配平');
    out += src.slice(i, m.index) + replacement;
    i = end;
    re.lastIndex = end;
    hits += 1;
  }
  return { src: out + src.slice(i), hits };
}

const staged = [];
for (const spec of SPEC) {
  const file = join(REPO, 'packages', spec.dir, 'lib', 'index.js');
  let src = readFileSync(file, 'utf8');
  const before = src;

  if (spec.dir === 'dsh-better-sidebar') {
    // 它的 ns 写成包名了，先修成条目 id，否则 describe().find() 永不命中
    const oldNs = 'const SIDEBAR_PREFS_NS = "dsh-better-sidebar";';
    if (!src.includes(oldNs)) throw new Error(`${spec.dir}: 找不到旧 ns 字面量`);
    src = src.replace(oldNs,
      '// settings.describe()/update() 的 ns 是 **profile 条目 id**（cordis.patch.yml 的 `- id: better-sidebar`），\n'
      + '// 不是 npm 包名。写成 "dsh-better-sidebar" 时 find 永不命中 ⇒ 偏好静默为 undefined。\n'
      + 'const SIDEBAR_PREFS_NS = "better-sidebar";');
  }

  const anchor = spec.dir === 'dsh-better-sidebar' ? 'sctx' : 'ctx';
  const { src: replaced, hits } = replaceRegister(
    src,
    `mountSettingsScope(${anchor}, config, ${JSON.stringify(spec.entryId)})`
  );
  if (hits < 1) throw new Error(`${spec.dir}: 一处 settings.register 都没匹配到`);
  src = replaced;

  if (!src.includes('<<BEGIN settings-host')) src = insertAfterImports(src, HOST_SNIPPET);

  const leftover = (src.match(/settings\.register\(/g) || []).length;
  if (leftover > 0) throw new Error(`${spec.dir}: 还剩 ${leftover} 处 settings.register(`);
  if (!src.includes('function mountSettingsScope')) throw new Error(`${spec.dir}: 适配器没进去`);

  console.log(`✓ ${spec.dir}: 替换 ${hits} 处 register，适配器已插入（entryId=${spec.entryId}）`);
  staged.push({ file, src, before });
}

if (!APPLY) {
  console.log('\n（校验通过但未落盘；加 --apply）');
  process.exit(0);
}
for (const s of staged) writeFileSync(s.file, s.src);
console.log('\n--apply 已落盘。');
