// src/client/host-faces.ts
function legacyQueryFace(connection) {
  return connection?.api;
}
function sessionEventEntries(sessions, sessionId) {
  const binding = sessions?.binding?.(sessionId);
  const window = binding?.eventSource?.getSnapshot();
  return window?.entries;
}

// src/prompt.ts
var MARKERS = {
  analysis: "<<<ANALYSIS>>>",
  optimized: "<<<OPTIMIZED>>>",
  end: "<<<END>>>"
};
var FORMAT_FULL_ZH = `# \u8F93\u51FA\u683C\u5F0F(\u4E25\u683C\u9075\u5B88,\u6807\u8BB0\u884C\u5355\u72EC\u6210\u884C)
${MARKERS.optimized}
\u8F93\u51FA\u4F18\u5316\u540E\u7684\u5B8C\u6574\u63D0\u793A\u8BCD\u5168\u6587
${MARKERS.analysis}
\u6309\u7EF4\u5EA6\u9010\u6761\u8F93\u51FA\u8BCA\u65AD,\u6BCF\u6761\u4E00\u884C,\u683C\u5F0F:\u300C\u7EF4\u5EA6 | \u95EE\u9898 | \u5EFA\u8BAE\u300D\u3002\u67D0\u7EF4\u5EA6\u65E0\u660E\u663E\u95EE\u9898\u65F6\u5199:\u300C\u7EF4\u5EA6 | \u65E0\u660E\u663E\u95EE\u9898 | -\u300D\u3002
${MARKERS.end}

\u9664\u4E0A\u8FF0\u6807\u8BB0\u5305\u88F9\u7684\u5185\u5BB9\u5916,\u4E0D\u8981\u8F93\u51FA\u4EFB\u4F55\u5176\u4ED6\u6587\u5B57\u3002`;
var FORMAT_FULL_EN = `# Output format (strictly follow; markers on their own lines)
${MARKERS.optimized}
The full optimized prompt text
${MARKERS.analysis}
One finding per line: "dimension | issue | suggestion". If a dimension is fine: "dimension | no issue | -".
${MARKERS.end}

Do not output anything outside these markers.`;
var FORMAT_FAST_ZH = `# \u8F93\u51FA\u683C\u5F0F(\u4E25\u683C\u9075\u5B88,\u6807\u8BB0\u884C\u5355\u72EC\u6210\u884C)
${MARKERS.optimized}
\u8F93\u51FA\u4F18\u5316\u540E\u7684\u5B8C\u6574\u63D0\u793A\u8BCD\u5168\u6587
${MARKERS.end}

\u9664\u4E0A\u8FF0\u6807\u8BB0\u5305\u88F9\u7684\u5185\u5BB9\u5916,\u4E0D\u8981\u8F93\u51FA\u4EFB\u4F55\u5176\u4ED6\u6587\u5B57\u3002`;
var FORMAT_FAST_EN = `# Output format (strictly follow; markers on their own lines)
${MARKERS.optimized}
The full optimized prompt text
${MARKERS.end}

Do not output anything outside these markers.`;
var CONTEXT_MAX_TURNS = 8;
var CONTEXT_MAX_CHARS = 1600;
var CONTEXT_TURN_MAX_CHARS = 600;
var CONTEXT_MIN_USER_TURNS = 1;
var CONTEXT_USER_BUDGET = 800;
function capConversationContext(turns) {
  const recent = turns.filter((t) => t.text.trim()).slice(-CONTEXT_MAX_TURNS).map((t) => ({
    role: t.role,
    text: t.text.trim().length > CONTEXT_TURN_MAX_CHARS ? `${t.text.trim().slice(0, CONTEXT_TURN_MAX_CHARS)}\u2026` : t.text.trim()
  }));
  if (recent.length === 0) return [];
  const indexed = recent.map((turn, index) => ({ turn, index }));
  const kept = /* @__PURE__ */ new Map();
  let budget = CONTEXT_MAX_CHARS;
  const users = indexed.filter((x) => x.turn.role === "user");
  let userBudget = Math.min(CONTEXT_USER_BUDGET, budget);
  for (let i = users.length - 1; i >= 0; i--) {
    const { turn, index } = users[i];
    const keptUsers = users.length - i;
    const mustKeep = keptUsers <= CONTEXT_MIN_USER_TURNS && ![...kept.values()].some((t) => t.role === "user");
    if (turn.text.length <= userBudget) {
      kept.set(index, turn);
      userBudget -= turn.text.length;
      budget -= turn.text.length;
    } else if (mustKeep) {
      const slice = userBudget > 16 ? userBudget : Math.min(16, budget);
      if (slice > 0) {
        kept.set(index, { role: turn.role, text: `${turn.text.slice(0, slice)}\u2026` });
        userBudget -= slice;
        budget -= slice;
      }
    }
  }
  const assistants = indexed.filter((x) => x.turn.role === "assistant");
  for (let i = assistants.length - 1; i >= 0; i--) {
    const { turn, index } = assistants[i];
    if (turn.text.length > budget) continue;
    kept.set(index, turn);
    budget -= turn.text.length;
  }
  return [...kept.entries()].sort(([a], [b]) => a - b).map(([, turn]) => turn);
}
function findMarker(text, word, fromIndex = 0) {
  const re = new RegExp(`<<<\\s*${word}\\s*>>>`, "g");
  re.lastIndex = fromIndex;
  const match = re.exec(text);
  return match ? { index: match.index, length: match[0].length } : null;
}
function findLastMarker(text, word, beforeIndex = text.length) {
  const re = new RegExp(`<<<\\s*${word}\\s*>>>`, "g");
  let last = null;
  for (const match of text.matchAll(re)) {
    if (match.index >= beforeIndex) break;
    last = { index: match.index, length: match[0].length };
  }
  return last;
}
function findNextMarker(text, fromIndex) {
  const re = /<<<\s*(?:ANALYSIS|OPTIMIZED|END)\s*>>>/g;
  re.lastIndex = fromIndex;
  const match = re.exec(text);
  return match ? { index: match.index, length: match[0].length } : null;
}
function segmentAfter(text, marker) {
  const firstEnd = findMarker(text, "END");
  if (firstEnd && marker.index > firstEnd.index) return "";
  const start = marker.index + marker.length;
  const next = findNextMarker(text, start);
  let end = next ? next.index : text.length;
  if (firstEnd && firstEnd.index > start && firstEnd.index < end) end = firstEnd.index;
  return text.slice(start, end).trim();
}
var THINK_OPEN = "<think>";
var THINK_CLOSE = "</think>";
function stripThinkBlocks(text) {
  let out = "";
  let rest = text;
  for (; ; ) {
    const open = rest.indexOf(THINK_OPEN);
    if (open === -1) return out + rest;
    out += rest.slice(0, open);
    const close = rest.indexOf(THINK_CLOSE, open + THINK_OPEN.length);
    if (close === -1) return out;
    rest = rest.slice(close + THINK_CLOSE.length);
  }
}
function parsePartialOptimizerOutput(raw) {
  const text = stripThinkBlocks(raw);
  const o = findLastMarker(text, "OPTIMIZED");
  const a = findLastMarker(text, "ANALYSIS");
  return {
    analysis: a ? segmentAfter(text, a) : "",
    optimized: o ? segmentAfter(text, o) : ""
  };
}
function compactPartialBuffer(raw) {
  const o = findLastMarker(raw, "OPTIMIZED");
  const a = findLastMarker(raw, "ANALYSIS");
  if (o && a && o.index < a.index) {
    return {
      compacted: `${MARKERS.analysis}
${raw.slice(a.index + a.length)}`,
      analysis: "",
      optimized: raw.slice(o.index + o.length, a.index).trim()
    };
  }
  if (o) {
    const analysis = a && a.index < o.index ? raw.slice(a.index + a.length, o.index).trim() : "";
    return { compacted: `${MARKERS.optimized}
${raw.slice(o.index + o.length)}`, analysis, optimized: "" };
  }
  return { compacted: null, analysis: "", optimized: "" };
}

// src/client/controller.ts
var ROUTE = "/dsh-prompt-optimizer/optimize";
var INITIAL = { open: false, status: "idle", error: null, result: null, live: null, last: null, applied: null };
function splitCommandPrefix(text) {
  const trimmed = text.trim();
  const match = /^(\/[A-Za-z][\w-]*)(?:\s+([\s\S]+))?$/.exec(trimmed);
  if (!match) return { body: trimmed };
  if (!match[2] || !match[2].trim()) return { body: trimmed, commandOnly: true };
  return { prefix: match[1], body: match[2].trim() };
}
function joinLast(last) {
  return last.prefix ? `${last.prefix} ${last.text}` : last.text;
}
function shouldAutoClose(input) {
  if (!input.open || input.status === "loading") return false;
  return !input.draft.trim() || !input.prevRunning && input.running || input.queued > input.prevQueued;
}
function flattenText(content) {
  if (!Array.isArray(content)) return "";
  return content.map(
    (block) => block && typeof block === "object" && block.type === "text" ? String(block.text ?? "") : ""
  ).filter(Boolean).join("\n").trim();
}
function sampleContextTurns(turns) {
  const users = turns.map((t, i) => ({ t, i })).filter((x) => x.t.role === "user").slice(-4);
  const assistants = turns.map((t, i) => ({ t, i })).filter((x) => x.t.role === "assistant").slice(-4);
  const merged = [...users, ...assistants].sort((a, b) => a.i - b.i).map((x) => x.t);
  return capConversationContext(merged);
}
function extractContextTurns(entries) {
  const turns = [];
  for (const entry of entries) {
    const event = entry?.event;
    if (!event || typeof event !== "object") continue;
    if (event.type === "user/message") {
      const data = event.data;
      if (data?.source?.kind !== "user") continue;
      const text = flattenText(data.content);
      if (text) turns.push({ role: "user", text });
    } else if (event.type === "assistant/message") {
      const data = event.data;
      const text = flattenText(data?.message?.content);
      if (text) turns.push({ role: "assistant", text });
    }
  }
  return sampleContextTurns(turns);
}
function createOptimizerController(ctx, opts = {}) {
  let state = INITIAL;
  const listeners = /* @__PURE__ */ new Set();
  let abort = null;
  let liveRaw = "";
  let frozenAnalysis = "";
  let frozenOptimized = "";
  let liveTimer = null;
  const clearLiveTimer = () => {
    if (liveTimer) {
      clearTimeout(liveTimer);
      liveTimer = null;
    }
  };
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  async function optimize(text, sessionId) {
    const split = splitCommandPrefix(text);
    const { prefix, body: draft } = split;
    if (!draft || state.status === "loading") return;
    if (split.commandOnly) {
      set({
        open: true,
        status: "error",
        error: "\u68C0\u6D4B\u5230\u659C\u6760\u547D\u4EE4\u4F46\u6CA1\u6709\u6B63\u6587:\u8BF7\u5148\u8F93\u5165\u8981\u4F18\u5316\u7684\u5185\u5BB9\u3002",
        live: null,
        last: { text: draft, sessionId }
      });
      return;
    }
    const previous = state.result && state.result.wellFormed && state.last?.sessionId === sessionId && state.last.text !== draft && (opts.isContextEnabled?.() ?? true) ? state.result.optimized : void 0;
    abort?.abort();
    clearLiveTimer();
    liveRaw = "";
    frozenAnalysis = "";
    frozenOptimized = "";
    const controller = new AbortController();
    abort = controller;
    const watchdogMs = Math.max(1e3, opts.getWatchdogMs?.() ?? 125e3);
    let clientTimedOut = false;
    const watchdog = setTimeout(() => {
      clientTimedOut = true;
      controller.abort();
    }, watchdogMs);
    const failTimeout = () => {
      clearLiveTimer();
      const seconds = Math.round(watchdogMs / 1e3);
      set({
        status: "error",
        live: null,
        error: `\u8BF7\u6C42\u8D85\u65F6(\u5BA2\u6237\u7AEF ${seconds} \u79D2\u65E0\u54CD\u5E94,Host \u53EF\u80FD\u672A\u8FD0\u884C)\u3002\u53EF\u5728 \u8BBE\u7F6E\u7684\u63D2\u4EF6\u9875\u300C\u63D0\u793A\u8BCD\u4F18\u5316\u300D \u4E2D\u8C03\u9AD8\u300C\u8D85\u65F6\u65F6\u95F4\u300D\u3002`
      });
    };
    const startedAt = Date.now();
    set({ open: true, status: "loading", error: null, live: { analysis: "", optimized: "" }, last: { text: draft, sessionId, prefix }, applied: null });
    try {
      const [selection, context] = await Promise.all([
        (async () => {
          if (opts.isModelPinned?.()) return void 0;
          try {
            const directories = opts.getSessionModelDirectories?.();
            if (!directories) {
              console.warn("[dsh-prompt-optimizer] \u4F1A\u8BDD\u6A21\u578B\u76EE\u5F55\u670D\u52A1\u5728\u5F53\u524D dsh \u7248\u672C\u7F3A\u5E2D,\u6539\u7528 Host \u56DE\u9000");
              return void 0;
            }
            const state2 = await directories.directoryFor(sessionId).load();
            const current = state2.current;
            if (current?.provider && current.model) {
              return { provider: current.provider, model: current.model, reasoningEffort: current.reasoningEffort };
            }
            console.warn("[dsh-prompt-optimizer] \u4F1A\u8BDD\u6CA1\u6709\u53EF\u7528\u7684\u6A21\u578B\u9009\u62E9,\u6539\u7528 Host \u56DE\u9000:", state2.error ?? current);
          } catch (cause) {
            console.warn("[dsh-prompt-optimizer] \u4F1A\u8BDD\u6A21\u578B\u67E5\u8BE2\u5931\u8D25,\u6539\u7528 Host \u56DE\u9000:", cause);
          }
          return void 0;
        })(),
        (async () => {
          if (!(opts.isContextEnabled?.() ?? true)) return void 0;
          try {
            const entries = sessionEventEntries(opts.getSessions?.(), sessionId);
            if (entries?.length) {
              const turns = extractContextTurns(entries);
              if (turns.length) return turns;
              console.warn("[dsh-prompt-optimizer] \u4F1A\u8BDD\u4E8B\u4EF6\u7A97\u53E3\u91CC\u6CA1\u6709\u53EF\u7528\u7684\u5BF9\u8BDD,\u5C1D\u8BD5\u65E7\u67E5\u8BE2\u9762");
            } else {
              console.warn("[dsh-prompt-optimizer] \u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u53EF\u8BFB\u7684\u4E8B\u4EF6\u7A97\u53E3,\u5C1D\u8BD5\u65E7\u67E5\u8BE2\u9762");
            }
          } catch (cause) {
            console.warn("[dsh-prompt-optimizer] \u8BFB\u53D6\u4F1A\u8BDD\u4E8B\u4EF6\u7A97\u53E3\u5931\u8D25,\u5C1D\u8BD5\u65E7\u67E5\u8BE2\u9762:", cause);
          }
          try {
            const history = legacyQueryFace(ctx.connection)?.sessions?.history;
            if (!history) {
              console.warn("[dsh-prompt-optimizer] \u4F1A\u8BDD\u5386\u53F2\u67E5\u8BE2\u9762\u5728\u5F53\u524D dsh \u7248\u672C\u7F3A\u5E2D,\u6309\u65E0\u4E0A\u4E0B\u6587\u4F18\u5316");
              return void 0;
            }
            const result = await history({ sessionId, maxMessages: 24 }, controller.signal);
            if (result.ok) {
              const turns = extractContextTurns(result.value.events ?? []);
              return turns.length ? turns : void 0;
            }
            console.warn("[dsh-prompt-optimizer] \u4F1A\u8BDD\u5386\u53F2\u67E5\u8BE2\u88AB\u62D2\u7EDD,\u6309\u65E0\u4E0A\u4E0B\u6587\u4F18\u5316:", result.error);
          } catch (cause) {
            console.warn("[dsh-prompt-optimizer] \u4F1A\u8BDD\u5386\u53F2\u67E5\u8BE2\u5931\u8D25,\u6309\u65E0\u4E0A\u4E0B\u6587\u4F18\u5316:", cause);
          }
          return void 0;
        })()
      ]);
      const resp = await fetch(ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // sessionId 随请求带给 Host:Host 把它标注到 llm 调用上,要求会话头
        // 的提供方(如 opencode 的 x-opencode-session)才能路由成功,同时
        // 会话级计量会把这次调用归属到当前会话。
        body: JSON.stringify({ text: draft, sessionId, provider: selection?.provider, model: selection?.model, reasoningEffort: selection?.reasoningEffort, context, previous }),
        signal: controller.signal
      });
      if (!resp.ok || !(resp.headers.get("content-type") ?? "").includes("text/event-stream")) {
        const data = await resp.json().catch(() => null);
        if (!controller.signal.aborted) {
          set({ status: "error", live: null, error: String(data?.error ?? `\u8BF7\u6C42\u5931\u8D25(HTTP ${resp.status})`) });
        }
        return;
      }
      const reader = resp.body?.getReader();
      if (!reader) throw new Error("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u6D41\u5F0F\u54CD\u5E94");
      const decoder = new TextDecoder();
      let buffer = "";
      let terminal = false;
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let event;
          try {
            event = JSON.parse(line.slice(5).trim());
          } catch {
            console.warn("[dsh-prompt-optimizer] \u8DF3\u8FC7\u65E0\u6CD5\u89E3\u6790\u7684 SSE \u5E27:", line.slice(0, 120));
            continue;
          }
          if (event.type === "delta") {
            liveRaw += String(event.text ?? "");
            if (!liveTimer) {
              liveTimer = setTimeout(() => {
                liveTimer = null;
                if (state.status === "loading" && abort === controller) {
                  const comp = compactPartialBuffer(liveRaw);
                  if (comp.compacted !== null) {
                    if (comp.analysis) frozenAnalysis = comp.analysis;
                    if (comp.optimized) frozenOptimized = comp.optimized;
                    liveRaw = comp.compacted;
                  }
                  const partial = parsePartialOptimizerOutput(liveRaw);
                  const live = { analysis: partial.analysis || frozenAnalysis, optimized: partial.optimized || frozenOptimized };
                  if (opts.isFastMode?.() && !live.analysis && !live.optimized && liveRaw.trim() && !liveRaw.includes("<<<")) {
                    live.optimized = liveRaw.trim();
                  }
                  set({ live });
                }
              }, 50);
            }
          } else if (event.type === "done") {
            terminal = true;
            clearLiveTimer();
            set({
              status: "done",
              live: null,
              result: {
                analysis: String(event.analysis ?? ""),
                optimized: String(event.optimized ?? ""),
                wellFormed: event.wellFormed !== false,
                truncated: event.truncated === true,
                provider: String(event.provider ?? ""),
                model: String(event.model ?? ""),
                fallbackUsed: event.fallbackUsed === true,
                fallbackReason: typeof event.fallbackReason === "string" && event.fallbackReason ? event.fallbackReason : void 0,
                durationMs: Date.now() - startedAt
              }
            });
          } else if (event.type === "error") {
            terminal = true;
            clearLiveTimer();
            set({ status: "error", live: null, error: String(event.error ?? "\u672A\u77E5\u9519\u8BEF") });
          }
        }
      }
      if (!terminal) {
        if (!controller.signal.aborted) {
          clearLiveTimer();
          set({ status: "error", live: null, error: "\u8FDE\u63A5\u4E2D\u65AD:\u54CD\u5E94\u6D41\u63D0\u524D\u7ED3\u675F" });
        } else if (clientTimedOut && abort === controller) {
          failTimeout();
        }
      }
    } catch (cause) {
      if (controller.signal.aborted) {
        if (clientTimedOut && abort === controller) failTimeout();
        return;
      }
      set({ status: "error", live: null, error: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      clearTimeout(watchdog);
    }
  }
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
    optimize,
    retry() {
      if (state.last) void optimize(joinLast(state.last), state.last.sessionId);
    },
    markApplied(applied) {
      set({ applied });
    },
    clearApplied() {
      if (state.applied) set({ applied: null });
    },
    close() {
      abort?.abort();
      abort = null;
      clearLiveTimer();
      set({ ...INITIAL });
    },
    /**
     * O2:loading 中取消(Esc)。与 close 不同:中止请求但不清空状态,
     * 面板定格展示已生成的部分——用户等了几十秒的内容不应一键蒸发。
     * 后续可「重新优化」续跑或「关闭」彻底收起。
     */
    cancel() {
      if (state.status !== "loading") return;
      abort?.abort();
      abort = null;
      clearLiveTimer();
      set({ status: "cancelled" });
    }
  };
}
export {
  createOptimizerController,
  extractContextTurns,
  joinLast,
  shouldAutoClose,
  splitCommandPrefix
};
