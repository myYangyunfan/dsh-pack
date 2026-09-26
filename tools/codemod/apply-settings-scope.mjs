#!/usr/bin/env node
/**
 * 把 settings 适配器盖进各包（单一事实源 = tools/snippets/settings-scope-*.mjs）。
 *
 * 做三件事，逐包打印改了什么：
 *   页内 bundle：插 bindSettingsScope → 把 ctx.settingsScope.bind({namespace:NS}) 换成
 *                bindSettingsScope(ctx, 条目id) → exports.inject 里 settingsScope 换 remote。
 *   宿主半边：  插 mountSettingsScope → 把 ctx.settings.register(...) 换成它；
 *                纯仪式调用（返回值没人用）的包直接删掉整段 try/catch。
 *
 * ⚠ 不碰 Config 的 `.volatile()` 标注 —— 那是逐包 schema 的判断，标错会让设置页
 *   生成不出表单，必须人改并由 tools/audit/settings-api.js 校验。
 *
 * 用法：node tools/codemod/apply-settings-scope.mjs [--apply]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_SNIPPET } from '../snippets/settings-scope-client.mjs';
import { HOST_SNIPPET } from '../snippets/settings-scope-host.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PKGS = join(REPO, 'packages');
const APPLY = process.argv.includes('--apply');

// entryId 取自各包 cordis.patch.yml 的 `- id:`（describe() 的 ns 就是这个）。
const SPEC = [
  { dir: 'dsh-quest-ui', entryId: 'quest-ui', host: 'ceremony' },
  { dir: 'dsh-vision', entryId: 'dsh-vision', host: 'live' },
  { dir: 'dsh-prompt-custom', entryId: 'prompt-custom', host: 'live' },
  { dir: 'dsh-subagent-lens', entryId: 'dsh-subagent-lens', host: 'ceremony' },
  { dir: 'dsh-openclaw-bridge', entryId: 'openclaw-bridge', host: 'live' },
];

const CLIENT_OLD = /ctx\.settingsScope\.bind\(\{\s*namespace:\s*NS\s*\}\)/g;
/**
 * `ctx.settings.register(NS, Config, { base: config || {} })` —— 第三参里带嵌套 `}`，
 * 所以不能用 `[^}]*`。按花括号配平吃整段。
 */
const HOST_REGISTER = /ctx\.settings\.register\(\s*NS\s*,\s*Config\s*,\s*\{/g;
function replaceRegisterCalls(src, replacement) {
  let out = '';
  let i = 0;
  let hits = 0;
  HOST_REGISTER.lastIndex = 0;
  let m;
  while ((m = HOST_REGISTER.exec(src))) {
    const argStart = m.index + m[0].length - 1; // 指向第三个参数的 "{"
    let depth = 0;
    let end = -1;
    for (let j = argStart; j < src.length; j += 1) {
      if (src[j] === '{') depth += 1;
      else if (src[j] === '}') {
        depth -= 1;
        if (depth === 0) { end = j + 1; break; }
      }
    }
    if (end < 0) break;
    // 第三个参数的 `}` 之后还有调用自身的 `)`，必须一起吃掉，否则替换后括号失配。
    let tail = end;
    while (tail < src.length && /\s/.test(src[tail])) tail += 1;
    if (src[tail] !== ')') break;
    tail += 1;
    out += src.slice(i, m.index) + replacement;
    i = tail;
    hits += 1;
    HOST_REGISTER.lastIndex = tail;
  }
  return { src: out + src.slice(i), hits };
}
/**
 * subagent-lens 形如 `if (ctx.settingsScope && typeof ctx.settingsScope.bind === "function")`
 * 的守卫：绑定点换掉后，这个条件会因为 settingsScope 永远 undefined 而**永假**，
 * 于是新写的 bindSettingsScope 根本不会被调用 —— 必须把守卫条件本身换成真实依赖。
 */
function collapseScopeGuard(src, entryId) {
  return src.replace(
    /if \(\s*ctx\.settingsScope\s*&&\s*typeof ctx\.settingsScope\.bind\s*===\s*["']function["']\s*\)/g,
    'if (ctx.remote && ctx.remote.settings)'
  );
}
const APPLY_ANCHOR = /^([ \t]*)(?:export\s+)?function apply\(/m;

/**
 * 插入点：最后一条顶层 import 之后。
 *
 * ⚠ 不能用 `^function apply(` 当锚点 —— better-sidebar 的 JSDoc 里就有一行
 *   `function apply(ctx, config) {` 的示例代码，`/m` 的 `^` 会先匹配到它，
 *   于是适配器被插进块注释**中间**，`*/` 反过来去闭合我插入的注释，
 *   原 JSDoc 正文变成代码 —— 表现是 "failed to import"。
 */
function insertAfterImports(src, snippet) {
  if (src.includes('<<BEGIN settings-scope') || src.includes('<<BEGIN settings-host')) {
    return { src, inserted: false, skipped: '已存在' };
  }
  const lines = src.split(/\r?\n/);
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  let last = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^import\s.+?;$/.test(lines[i])) last = i;
    else if (last >= 0 && lines[i].trim() !== '' && !/^import\s/.test(lines[i])) break;
  }
  if (last < 0) return { src, inserted: false, skipped: '找不到顶层 import 行' };
  const out = [...lines.slice(0, last + 1), '', ...snippet.split('\n'), ...lines.slice(last + 1)];
  return { src: out.join(eol), inserted: true };
}

/** 把 inject 数组里的 settingsScope 换成 remote（保持原有引号风格）。 */
function swapInject(src) {
  return src.replace(/(\b(?:exports\.inject|const inject)\s*=\s*\[[^\]]*\])/, (block) =>
    (/\["settingsScope"\]|"settingsScope"|'settingsScope'/.test(block)
      ? block.replace(/([\"'])settingsScope\1/, '$1remote$1')
      : block));
}

const report = [];
for (const spec of SPEC) {
  const lines = [`[${spec.dir}] entryId=${spec.entryId}`];
  const clientFile = join(PKGS, spec.dir, 'lib', 'client.js');
  const hostFile = join(PKGS, spec.dir, 'lib', 'index.js');

  // ---- 页内半边 ----
  if (existsSync(clientFile)) {
    let src = readFileSync(clientFile, 'utf8');
    const before = src;
    const bindHits = (src.match(CLIENT_OLD) || []).length;
    src = src.replace(CLIENT_OLD, `bindSettingsScope(ctx, ${JSON.stringify(spec.entryId)})`);
    if (bindHits) lines.push(`  client: 替换 settingsScope.bind ×${bindHits}`);
    const guarded = collapseScopeGuard(src, spec.entryId);
    if (guarded !== src) { src = guarded; lines.push('  client: typeof 守卫已收成直连'); }
    const ins = insertAfterImports(src, CLIENT_SNIPPET);
    src = ins.src;
    lines.push(ins.inserted ? '  client: 已插入 bindSettingsScope' : `  client: 未插入（${ins.skipped || '已存在或无 bind 调用'}）`);
    const swapped = swapInject(src);
    if (swapped !== src) { src = swapped; lines.push('  client: inject settingsScope → remote'); }
    if (src !== before && APPLY) writeFileSync(clientFile, src);
    if (/settingsScope/.test(src.split('\n').filter((l) => !/^\s*(\/\/|\*|#)/.test(l)).join('\n'))) {
      lines.push('  ⚠ client 代码里仍有 settingsScope');
    }
  } else lines.push('  ⚠ 找不到 lib/client.js');

  // ---- 宿主半边 ----
  if (existsSync(hostFile)) {
    let src = readFileSync(hostFile, 'utf8');
    const before = src;
    if (spec.host === 'live') {
      const ins = insertAfterImports(src, HOST_SNIPPET);
      src = ins.src;
      lines.push(ins.inserted ? '  host: 已插入 mountSettingsScope' : `  host: 未插入（${ins.skipped || '已存在'}）`);
      const r = replaceRegisterCalls(src, `mountSettingsScope(ctx, config, ${JSON.stringify(spec.entryId)})`);
      src = r.src;
      if (r.hits) lines.push(`  host: settings.register(...) → mountSettingsScope(...) ×${r.hits}`);
      else lines.push('  ⚠ host 没匹配到 settings.register 调用');
    } else {
      const r = replaceRegisterCalls(src, 'void 0');
      src = r.src;
      if (r.hits) lines.push(`  host: 纯仪式调用 ×${r.hits} 已置 void 0（待人工清 try/catch 与 inject）`);
      else lines.push('  ⚠ host 没匹配到 settings.register 调用');
    }
    if (src !== before && APPLY) writeFileSync(hostFile, src);
  } else lines.push('  ⚠ 找不到 lib/index.js');

  report.push(lines.join('\n'));
}
console.log(report.join('\n'));
console.log(APPLY ? '\n--apply 已落盘。' : '\n（只报告；加 --apply 落盘）');
