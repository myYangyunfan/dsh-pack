// 页内 bundle 接真实 settings API：插 bindSettingsScope、换掉不存在的 settingsScope.bind、
// 把 inject 里的 settingsScope 换成 remote。
//
// 每一步都断言命中数并做收尾校验 —— 前两次 codemod「报告成功但实际没改」，
// 这一版改完立刻由 tools/audit/settings-api.js 与 J4 交叉验证。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_SNIPPET } from '../snippets/settings-scope-client.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APPLY = process.argv.includes('--apply');

// entryId 来自各包 cordis.patch.yml 的 `- id:`：settings.describe() 的 ns 就是它。
const SPEC = [
  { dir: 'dsh-quest-ui', entryId: 'quest-ui' },
  { dir: 'dsh-vision', entryId: 'dsh-vision' },
  { dir: 'dsh-prompt-custom', entryId: 'prompt-custom' },
  { dir: 'dsh-subagent-lens', entryId: 'dsh-subagent-lens' },
  { dir: 'dsh-openclaw-bridge', entryId: 'openclaw-bridge' },
];

const staged = [];
for (const spec of SPEC) {
  const file = join(REPO, 'packages', spec.dir, 'lib', 'client.js');
  let src = readFileSync(file, 'utf8');
  const notes = [];

  // 1) 锚点：NS 常量那行（真代码、唯一、在 factory 作用域内、且在 apply 之前）。
  //    不能用 `^function apply(` —— 注释里的示例代码会抢匹配（better-sidebar 就这么坏过）。
  const nsLine = src.split(/\r?\n/).find((l) => /^\s*(?:const|let|var)\s+NS\s*=\s*["'][^"']+["'];?\s*$/.test(l));
  if (!nsLine) throw new Error(`${spec.dir}: 找不到 NS 常量行，无法定位插入点`);
  if (!src.includes('<<BEGIN settings-scope')) {
    const eol = src.includes('\r\n') ? '\r\n' : '\n';
    const anchor = `${nsLine}${eol}`;
    const injected = `${anchor}${eol}// settings.describe()/mutate 的 ns 是 **profile 条目 id**，不是包名也不是旧 NS。${eol}// ${CLIENT_SNIPPET.split('\n').join(eol + '')}${eol}`;
    src = src.replace(anchor, injected);
    notes.push('插入适配器');
  }

  // 2) 换掉幽灵服务的调用
  const before = src;
  src = src.replace(/ctx\.settingsScope\.bind\(\{\s*namespace:\s*NS\s*\}\)/g,
    'bindSettingsScope(ctx, SETTINGS_ENTRY_ID)');
  const binds = (before.match(/ctx\.settingsScope\.bind\(/g) || []).length;
  if (binds < 1) throw new Error(`${spec.dir}: 没有 settingsScope.bind 可换`);
  if (src === before) throw new Error(`${spec.dir}: bind 调用替换未生效`);
  notes.push(`换掉 ${binds} 处 bind`);

  // 3) 守卫条件本身：settingsScope 恒 undefined ⇒ 恒假 ⇒ 新代码永远跑不到
  src = src.replace(/if \(\s*ctx\.settingsScope\s*&&\s*typeof ctx\.settingsScope\.bind\s*===\s*["']function["']\s*\)/g,
    'if (ctx.remote && ctx.remote.settings)');

  // 4) 补上 entry id 常量（紧挨 NS 常量之后，NS 可能还被别处当标签用）
  if (!src.includes('const SETTINGS_ENTRY_ID')) {
    src = src.replace(nsLine, `${nsLine}\n${nsLine.match(/^\s*/)[0]}const SETTINGS_ENTRY_ID = ${JSON.stringify(spec.entryId)};`);
    notes.push(`加 SETTINGS_ENTRY_ID=${spec.entryId}`);
  }

  // 5) inject 名单：settingsScope → remote
  src = src.replace(/(\binject\s*=\s*\[[^\]]*\])/g, (block) =>
    (/settingsScope/.test(block) ? block.replace(/(["'])settingsScope\1/, '$1remote$1') : block));

  // 收尾校验：非注释代码里不得再出现 settingsScope
  const codeOnly = src.split('\n').filter((l) => !/^\s*(\/\/|\*|#)/.test(l)).join('\n');
  if (/settingsScope/.test(codeOnly)) throw new Error(`${spec.dir}: 代码里仍残留 settingsScope`);
  if (!/function bindSettingsScope/.test(src)) throw new Error(`${spec.dir}: 适配器没进去`);
  if (!/SETTINGS_ENTRY_ID/.test(src)) throw new Error(`${spec.dir}: 缺 entry id 常量`);

  console.log(`✓ ${spec.dir}: ${notes.join('，')}`);
  staged.push({ file, src });
}

if (!APPLY) {
  console.log('\n（校验通过但未落盘；加 --apply）');
  process.exit(0);
}
for (const s of staged) writeFileSync(s.file, s.src);
console.log('\n--apply 已落盘。');
