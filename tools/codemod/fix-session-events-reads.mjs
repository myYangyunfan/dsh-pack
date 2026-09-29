#!/usr/bin/env node
/**
 * 把 `…session.events` 的同步读取迁到内核现存的读取口。
 *
 * 为什么要它：内核 0.1.7-rc.1 的 `Session` **没有 `events` 数组了**（`session.meta`
 * 也在同一轮消失），迭代期事件只经 `ctx.on("session/event")` 推送。留存物是
 * `session.eventAt(seq)` / `session.snapshotEvents(from?, toExcl?)` / `session.ownEvents()`，
 * 三个都标了 @deprecated 但实现仍在（见 `@deepseek-ai/dsh-session/README.zh.md` 第 62 行）。
 * 老写法 `session.events` 读出来是 `undefined`：
 *   - `.some()` / `for…of` 直接抛 → 挂在该钩子上的**每个回合都失败**
 *     （真机取证：billion-context 的 agent/pre-step，2026-09-26）；
 *   - `?? []` / `Array.isArray()` 兜底则**静默什么都不做**（synapse 投影、graph-memory 回填）。
 * 两种都不报错，用户只看到功能没了或用不了。
 *
 * 变换：`session.events` → `sessionEvents(session)`，
 *       `agent.session.events` → `sessionEvents(agent.session)`（接收者不是定名 `session` 也要对），
 * 并在每个文件里插一份 5 行兼容口（snapshotEvents 优先、老宿主退回旧数组）。
 * 回退分支写成 `session["events"]` 下标读取，好让审计门禁按 `session.events` 字面量
 * 干净地拦住新写的旧 API 调用。
 *
 * 幂等：已插过兼容口（存在 `function sessionEvents(`）就只做替换；两者都无则报 0 处。
 *
 * 用法：
 *   node tools/codemod/fix-session-events-reads.mjs          # 只报告
 *   node tools/codemod/fix-session-events-reads.mjs --apply  # 改写
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// 复用审计那套「等长空白替换」的注释屏蔽：它能保住偏移量，于是匹配可以打在
// 屏蔽串上、替换落在原文上 —— 注释里的 `session.events`（解释性文字）不会被改写。
const { stripComments } = createRequire(import.meta.url)('../audit/dep-closure.js');

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const apply = process.argv.includes('--apply');

/**
 * 每个目标一条：anchor 必须是**顶层**语句的整行原文（兼容口插在它前面）。
 * unit 是该文件函数体的缩进单位。
 */
const TARGETS = [
  { file: 'packages/billion-context-dsh/dist/index.js', anchor: 'function surfaceEventsOf(session) {', unit: '  ' },
  // better-sidebar 的 boundaryDelivered 上方自带 JSDoc，插在它前面会把注释抢走，
  // 所以改成「import 区之后」插入。
  { file: 'packages/dsh-better-sidebar/lib/index.js', anchor: 'import { snapshotSubagentDescriptor } from "@deepseek-ai/dsh-subagent";', unit: '\t', mode: 'after' },
  { file: 'packages/dsh-synapse/index.js', anchor: "export const name = 'synapse'", unit: '  ' },
  { file: 'packages/graph-memory/dist/dsh.js', anchor: 'const HOST = "dsh";', unit: '    ' },
];

/** `session.events` / `agent.session.events` —— 捕获接收者所在的整个成员链。 */
const TOKEN_RE = /(?<![\w$])((?:[A-Za-z_$][\w$]*\.)*session)\.events\b/g;

function helper(unit, eol) {
  const i = (n) => unit.repeat(n);
  return [
    '/**',
    ' * 内核 0.1.7-rc.1 移除了 Session.events 数组（session.meta 同时消失），迭代期事件',
    ' * 改由 ctx.on("session/event") 推送。这里留同步读整份日志的兼容口：snapshotEvents()',
    ' * 仍在（标弃用但可用），老宿主退回旧数组。回退分支刻意用下标读取 —— 审计门禁按',
    ' * `session.events` 字面量拦旧 API，这里正是要保留的那一个口子。',
    ' */',
    `function sessionEvents(session) {`,
    `${i(1)}if (!session) return [];`,
    `${i(1)}if (typeof session.snapshotEvents === "function") return session.snapshotEvents();`,
    `${i(1)}const legacy = session["events"];`,
    `${i(1)}return Array.isArray(legacy) ? legacy : [];`,
    '}',
    '',
  ].join(eol);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 注释屏蔽串上的匹配（偏移量与原文一一对应）。 */
function findHits(raw) {
  const masked = stripComments(raw);
  const re = new RegExp(TOKEN_RE.source, 'g');
  const hits = [];
  let m;
  while ((m = re.exec(masked)) !== null) {
    hits.push({ index: m.index, length: m[0].length, receiver: m[1] });
    if (re.lastIndex === m.index) re.lastIndex += 1;
  }
  return hits;
}

function applyHits(raw, hits) {
  let out = '';
  let cursor = 0;
  for (const h of hits) {
    out += raw.slice(cursor, h.index) + `sessionEvents(${h.receiver})`;
    cursor = h.index + h.length;
  }
  return out + raw.slice(cursor);
}

const rows = [];
for (const t of TARGETS) {
  const abs = join(root, t.file);
  if (!existsSync(abs)) {
    rows.push({ ...t, abs, bad: true, note: '文件不存在' });
    continue;
  }
  const raw = readFileSync(abs, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const hits = findHits(raw);
  const hasHelper = /function sessionEvents\s*\(/.test(raw);
  const anchorRe = new RegExp(`^${escapeRe(t.anchor)}\\r?$`, 'm');
  const anchor = hasHelper ? null : anchorRe.exec(raw);
  const receivers = [...new Set(hits.map((h) => h.receiver))];
  const row = { ...t, abs, hits, hasHelper, receivers, eol, bad: false };
  rows.push(row);

  let next = applyHits(raw, hits);
  if (!hasHelper) {
    if (anchor === null) {
      row.bad = true;
      row.note = '锚点行找不到（文件结构变了，先人工对一遍）';
      continue;
    }
    // 逐字节保留原文（含 CRLF）：只在锚点行前/后插入，不重排其它行。
    const at = t.mode === 'after' ? anchor.index + anchor[0].length + eol.length : anchor.index;
    const body = t.mode === 'after' ? eol + helper(t.unit, eol) : helper(t.unit, eol) + eol;
    next = next.slice(0, at) + body + next.slice(at);
  }
  row.next = next;
  row.changed = next !== raw;
}

for (const r of rows) {
  const tag = r.bad ? 'BAD ' : r.changed ? 'EDIT' : 'ok  ';
  console.log(
    `${tag} ${r.file.padEnd(44)} 替换=${String(r.hits ? r.hits.length : 0).padStart(3)} 兼容口=${r.hasHelper ? '已有' : '待插'}${r.receivers && r.receivers.length ? '  接收者=' + r.receivers.join(',') : ''}`
  );
  if (r.note) console.log(`      ↳ ${r.note}`);
}

const bad = rows.filter((r) => r.bad);
const changed = rows.filter((r) => r.changed);
if (bad.length) {
  console.error(`\n${bad.length} 个目标无法安全处理，未写任何文件。`);
  process.exitCode = 1;
} else if (apply) {
  for (const r of changed) writeFileSync(r.abs, r.next);
  console.log(`\n已改写 ${changed.length} 个文件。`);
} else {
  console.log(`\n（只报告）将改写 ${changed.length} 个文件，加 --apply 落地。`);
}
