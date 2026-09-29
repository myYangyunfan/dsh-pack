'use strict';

// ---------------------------------------------------------------------------
// session-api —— 拦「按已移除的内核 Session 形状读数据」。
//
// 内核 0.1.7-rc.1 的 `Session` **没有 `events` 数组**了，`session.meta` 也在同一轮
// 消失（`@deepseek-ai/dsh-session/README.zh.md` 第 62 行：只留 `eventAt()` /
// `snapshotEvents()` / `ownEvents()`，三个都标弃用；`.agents/notes/.../2026-09-09
// -deprecate-synchronous-session-event-reads.md`）。同步读残留仍可用，迭代期事件
// 的官方姿势是 `ctx.on("session/event", (session, event) => …)` + 自己按会话过滤。
//
// 为什么单独立一条：读错这处的失败形态**两种都是静默的**，而 `--dump-config`
// 那类只验组合的门禁一概看不见（AGENTS.md 契约 12）：
//   · 当数组用（`.some()` / `for…of` / `[seq]`）→ 抛 TypeError ⇒ 挂在这个钩子上的
//     **每个回合都失败**。真机取证：billion-context-dsh 的 agent/pre-step 读了
//     `session.events.some(...)`，整条对话不可用（2026-09-26）；
//   · 用 `?? []` / `Array.isArray()` 兜底 → **静默什么都不做**。真机取证：synapse
//     的投影与 graph-memory 的回填都成了空转。
// 页内侧还有第三种：`binding.session.events` 存在但是 SessionEventStream（异步日志
// 流，有 prepend()/open()），`Array.isArray` 恒假 ⇒ 整块功能被守卫吞掉
// （dsh-subagent-lens 的子代理活动明细，2026-09-26）。
//
// 判据：我们自己的**非测试**源码里出现 `session.events` / `session.meta` 字面量即 error。
// 兼容口（要同时活过新老宿主）请写成下标读取 `session["events"]` 并注明缘由 ——
// 那是刻意的痕迹，不是白名单：本文件不做任何 allowlist，例外一律靠改写法。
// 主机侧迁移脚本：node tools/codemod/fix-session-events-reads.mjs
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');

const { detectPackRoot, finding } = require('./shared');
const { stripComments } = require('./dep-closure');
const { collectJsFiles } = require('./syntax');

const CHECK = 'session-api';

/** 旧 Session 形状的字面量读取（下标读取 session["events"] 刻意不匹配）。 */
const LEGACY_READS = [
  {
    re: /(?<![\w$])session\.events\b/g,
    what: 'session.events',
    fix:
      '宿主侧往 `sessionEvents(session)` 收口（snapshotEvents() 优先，老宿主退回下标读取），' +
      '或用 node tools/codemod/fix-session-events-reads.mjs；页内侧读 binding.eventSource ' +
      '的窗口（getSnapshot().entries[i].event）',
  },
  {
    re: /(?<![\w$])session\.meta\b/g,
    what: 'session.meta',
    fix: 'cwd 等创建元数据在 `session.header` 上（持久化 list() 的条目则是 { header, revision }）',
  },
];

/** 测试与夹具不在本文范围内：mock 允许造旧形状，这正是「真机形状守卫」用例的素材。 */
const TEST_PATH_RE = /(^|\/)(test|tests|__tests__|fixtures?)\//i;
const TEST_FILE_RE = /\.(?:test|spec)\.(?:js|cjs|mjs)$/i;

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function run(ctx = {}) {
  const pack = ctx.pack || detectPackRoot();
  const findings = [];
  if (!pack.exists) {
    findings.push(finding(CHECK, 'error', '未找到插件包根，Session 形状核对没有检查对象'));
    return findings;
  }
  if (!Array.isArray(pack.packages) || pack.packages.length === 0) {
    findings.push(finding(CHECK, 'error', `包根 ${pack.root} 下没有任何含 package.json 的目录`));
    return findings;
  }

  for (const pkg of pack.packages) {
    const label = pkg.label;
    for (const file of collectJsFiles(pkg.dir)) {
      if (TEST_PATH_RE.test(file.relPath) || TEST_FILE_RE.test(file.relPath)) continue;
      let text;
      try {
        text = fs.readFileSync(file.abs, 'utf8');
      } catch {
        findings.push(finding(CHECK, 'error', `读不到文件：${file.relPath}`, label));
        continue;
      }
      // 注释屏蔽（等长空白替换）后匹配，偏移量与原文一一对应：解释性文字不算违规，
      // 否则本文件自己的说明、以及各包「为什么不再这么读」的注释都会被打成 error。
      const masked = stripComments(text);
      for (const { re, what, fix } of LEGACY_READS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(masked)) !== null) {
          const line = lineOf(text, m.index);
          findings.push(
            finding(
              CHECK,
              'error',
              `读了已移除的 ${what}（${file.relPath}:${line}）：内核 0.1.7-rc.1 的 Session 没有这个字段，` +
                `当数组用会抛 TypeError 打断整个回合、兜底则会静默空转，两种都不报错。${fix}`,
              label
            )
          );
          if (re.lastIndex === m.index) re.lastIndex += 1;
        }
      }
    }
  }
  return findings;
}

module.exports = { CHECK, run, LEGACY_READS };
