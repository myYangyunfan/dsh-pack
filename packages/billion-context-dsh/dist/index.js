// src/index.ts
import {
  CompactionEngine,
  ManualCompactionError
} from "@deepseek-ai/dsh-compaction";
import { createCore } from "acp-kernel";

// src/state.ts
import { createInitialState } from "acp-kernel";

// src/region.ts
import { randomUUID } from "crypto";
import {
  CompactionId,
  compactCheckpointSource,
  toolPairingBalancedAfter,
  toolPairingBalancedBefore
} from "@deepseek-ai/dsh-compaction";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { defaultCountTokens } from "acp-kernel";

// src/messages.ts
function extractText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (block === null || typeof block !== "object") continue;
    const b = block;
    if (b.type === "text" && typeof b.text === "string") {
      parts.push(b.text);
    } else if (Array.isArray(b.content)) {
      parts.push(extractText(b.content));
    }
  }
  return parts.join("\n");
}
function toolCallsOf(content) {
  if (!Array.isArray(content)) return [];
  return content.filter((b) => b.type === "tool-call");
}
function stringifyArgs(args) {
  if (!args) return "";
  if (typeof args === "string") return args;
  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
}
function projectEvent(event) {
  switch (event.type) {
    case "user/message": {
      const text = extractText(event.data.content);
      return text.length > 0 ? [{ id: String(event.seq), role: "user", contentType: "text", text }] : [];
    }
    case "assistant/message": {
      const content = event.data.message?.content;
      const calls = toolCallsOf(content);
      const text = extractText(content);
      if (calls.length === 0) {
        return text.trim().length > 0 ? [{ id: String(event.seq), role: "assistant", contentType: "text", text }] : [];
      }
      if (calls.length === 1) {
        const call = calls[0];
        const argStr = stringifyArgs(call.arguments);
        const body = argStr && text ? `${text}
${argStr}` : argStr || text;
        return [{
          id: String(event.seq),
          role: "assistant",
          contentType: "tool-call",
          toolName: call.name ?? "",
          toolCallId: call.id ?? "",
          text: body
        }];
      }
      return calls.map((call) => ({
        id: `${event.seq}#${call.id ?? ""}`,
        role: "assistant",
        contentType: "tool-call",
        toolName: call.name ?? "",
        toolCallId: call.id ?? "",
        text: stringifyArgs(call.arguments) || text
      }));
    }
    case "tool/result": {
      const message = event.data.message;
      const text = extractText(message?.content);
      if (text.length === 0) return [];
      return [{
        id: String(event.seq),
        role: "tool",
        contentType: "tool-result",
        toolName: message?.toolName ?? "",
        toolCallId: message?.toolCallId ?? "",
        text
      }];
    }
    default:
      return [];
  }
}
function eventsToCoreMessages(events) {
  const out = [];
  for (const event of events) out.push(...projectEvent(event));
  return out;
}
function surfaceEventsOf(session) {
  return session.surface.nodes.map((seq) => session.events[seq]).filter((event) => event !== void 0);
}
function allLogMessages(session) {
  return eventsToCoreMessages(session.events);
}
function extractEventText(event) {
  switch (event.type) {
    case "user/message":
      return extractText(event.data.content);
    case "assistant/message":
      return extractText(event.data.message?.content);
    case "tool/result":
      return extractText(event.data.message?.content);
    default:
      return "";
  }
}

// src/region.ts
function findOpenTurn(events) {
  let open = null;
  for (const event of events) {
    if (event.type === "turn/start") open = event.data.turn;
    else if (event.type === "turn/end" && event.data.turn === open) open = null;
  }
  return open;
}
function assertNoActiveCompaction(events) {
  let active = false;
  for (const event of events) {
    if (event.type === "compaction/start") active = true;
    else if (event.type === "compaction/end") active = false;
  }
  if (active) {
    throw new Error("billion-context-dsh: another compaction is already active for this session");
  }
}
function hasPlainRef(session, seq) {
  const event = session.events[seq];
  if (event === void 0) return false;
  switch (event.type) {
    case "user/message":
    case "tool/result":
      return extractEventText(event).trim().length > 0;
    case "assistant/message": {
      const content = event.data.message?.content;
      const calls = Array.isArray(content) ? content.filter(
        (block) => block !== null && typeof block === "object" && block.type === "tool-call"
      ) : [];
      if (calls.length > 1) return false;
      return calls.length === 1 || extractEventText(event).trim().length > 0;
    }
    default:
      return false;
  }
}
var AlreadyCompressedRangeError = class extends Error {
  constructor(start, end, coveringBlockIds) {
    super(
      `billion-context-dsh: seq ${start}..${end} already compressed \u2014 no live content remains in that span`
    );
    this.start = start;
    this.end = end;
    this.coveringBlockIds = coveringBlockIds;
    this.name = "AlreadyCompressedRangeError";
  }
  start;
  end;
  coveringBlockIds;
};
function recoverStaleRange(session, start, end) {
  if (session.events[start] === void 0 || session.events[end] === void 0) {
    const failedEdge = session.events[start] === void 0 ? start : end;
    return { kind: "unresolvable", failedEdge };
  }
  const liveInside = session.surface.nodes.filter((seq) => seq >= start && seq <= end).sort((a, b) => a - b);
  const plain = liveInside.filter((seq) => !isCheckpointNode(session.events[seq]));
  if (plain.length === 0) {
    const coveringBlockIds = rebuildBlockLedger(session.events).filter((entry) => entry.shadowedSeqs.some((seq) => seq >= start && seq <= end)).map((entry) => entry.blockId);
    return { kind: "already-compressed", coveringBlockIds };
  }
  return { kind: "ok", start: plain[0], end: plain[plain.length - 1] };
}
function resolveSurfaceRange(session, start, end) {
  const nodes = session.surface.nodes;
  if (start > end) {
    throw new Error(`billion-context-dsh: reversed range ${start}..${end}`);
  }
  let requestedStartIdx = nodes.indexOf(start);
  let requestedEndIdx = nodes.indexOf(end);
  let recovered = false;
  if (requestedStartIdx < 0 || requestedEndIdx < 0) {
    const stale = recoverStaleRange(session, start, end);
    if (stale.kind === "unresolvable") {
      throw new Error(
        `billion-context-dsh: seq ${start}..${end} not in the current surface \u2014 edge seq ${stale.failedEdge} is not in this session's log. Surface seqs are sparse message nodes (only user/message, assistant/message, tool/result events); consult acp_status for the current surface range`
      );
    }
    if (stale.kind === "already-compressed") {
      throw new AlreadyCompressedRangeError(start, end, stale.coveringBlockIds);
    }
    start = stale.start;
    end = stale.end;
    recovered = true;
    requestedStartIdx = nodes.indexOf(start);
    requestedEndIdx = nodes.indexOf(end);
    if (requestedStartIdx < 0 || requestedEndIdx < 0) {
      throw new Error(
        `billion-context-dsh: seq ${start}..${end} not in the current surface \u2014 consult acp_status for the current surface range`
      );
    }
  }
  if (requestedStartIdx > requestedEndIdx) {
    throw new Error(`billion-context-dsh: reversed range ${start}..${end}`);
  }
  if (start > end) {
    throw new Error(`billion-context-dsh: reversed range ${start}..${end}`);
  }
  const cleanBefore = (index) => toolPairingBalancedBefore(session, nodes[index]) && hasPlainRef(session, nodes[index]);
  const cleanAfter = (index) => toolPairingBalancedAfter(session, nodes[index]) && hasPlainRef(session, nodes[index]);
  let startIdx = requestedStartIdx;
  let endIdx = requestedEndIdx;
  while (startIdx <= endIdx && !cleanBefore(startIdx)) {
    startIdx += 1;
  }
  while (endIdx >= startIdx && !cleanAfter(endIdx)) {
    endIdx -= 1;
  }
  if (startIdx <= endIdx && nodes[startIdx] <= nodes[endIdx]) {
    return recovered ? { start: nodes[startIdx], end: nodes[endIdx], recovered: true } : { start: nodes[startIdx], end: nodes[endIdx] };
  }
  if (recovered) {
    throw new Error(
      `billion-context-dsh: no tool-pairing-balanced live remainder around seq ${start}..${end} \u2014 narrow the range or consult acp_status for the current surface`
    );
  }
  startIdx = requestedStartIdx;
  endIdx = requestedEndIdx;
  while (startIdx > 0 && !cleanBefore(startIdx)) {
    startIdx -= 1;
  }
  while (endIdx < nodes.length - 1 && !cleanAfter(endIdx)) {
    endIdx += 1;
  }
  if (cleanBefore(startIdx) && cleanAfter(endIdx) && nodes[startIdx] <= nodes[endIdx]) {
    return { start: nodes[startIdx], end: nodes[endIdx] };
  }
  throw new Error(
    `billion-context-dsh: no tool-pairing-balanced range around seq ${start}..${end} \u2014 narrow the range or consult acp_status for the current surface`
  );
}
function shadowedSeqsOf(session, start, end) {
  const nodes = session.surface.nodes;
  const startIdx = nodes.indexOf(start);
  const endIdx = nodes.indexOf(end);
  return nodes.slice(startIdx, endIdx + 1);
}
function readCompactionSummary(event) {
  return event.data;
}
function runCompactionTransaction(session, input) {
  assertNoActiveCompaction(session.events);
  const turn = findOpenTurn(session.events);
  const compactionId = CompactionId(randomUUID());
  const seqs = [];
  seqs.push(session.append("compaction/start", { compactionId, turn }).seq);
  seqs.push(session.append("compaction/summary", {
    compactionId,
    summary: input.summary,
    shadowedRange: { start: input.start, end: input.end },
    shadowedSeqs: [...input.shadowedSeqs],
    shadowedTokenCount: input.shadowedTokenCount,
    provider: input.provider,
    model: input.model,
    tier: input.tier ?? 1,
    ...input.kernelBlockId === void 0 ? {} : { kernelBlockId: input.kernelBlockId },
    ...input.parentBlockIds === void 0 || input.parentBlockIds.length === 0 ? {} : { parentBlockIds: [...input.parentBlockIds] },
    ...input.directMessageIds === void 0 ? {} : { directMessageIds: [...input.directMessageIds] },
    ...input.effectiveMessageIds === void 0 ? {} : { effectiveMessageIds: [...input.effectiveMessageIds] }
  }).seq);
  const message = createUserMessage({
    content: input.summary,
    source: compactCheckpointSource(compactionId)
  });
  seqs.push(session.append("user/message", message, {
    surfaceOp: { op: "replace", start: input.start, end: input.end },
    sourceEventSeqs: [...input.shadowedSeqs]
  }).seq);
  seqs.push(session.append("compaction/end", { compactionId, turn }).seq);
  return { compactionId, seqs };
}
function summarySeqOfCompaction(events, compactionId) {
  for (const event of events) {
    if (event.type !== "user/message") continue;
    const source = event.data.source;
    if (source?.plugin === "compact" && source.compactionId === compactionId) return event.seq;
  }
  return null;
}
function rebuildBlockLedger(events) {
  const ledger = [];
  for (const event of events) {
    if (event.type !== "compaction/summary") continue;
    const data = readCompactionSummary(event);
    let shadowedTokenCount = data.shadowedTokenCount;
    if (shadowedTokenCount === 0) {
      shadowedTokenCount = 0;
      for (const seq of data.shadowedSeqs) {
        const original = events[seq];
        if (original !== void 0) shadowedTokenCount += defaultCountTokens(extractEventText(original));
      }
    }
    const tier = data.tier === 2 || data.tier === 3 ? data.tier : 1;
    const parentBlockIds = Array.isArray(data.parentBlockIds) ? [...data.parentBlockIds] : [];
    const directMessageIds = Array.isArray(data.directMessageIds) ? [...data.directMessageIds] : void 0;
    const effectiveMessageIds = Array.isArray(data.effectiveMessageIds) ? [...data.effectiveMessageIds] : void 0;
    const summarySeq = summarySeqOfCompaction(events, data.compactionId);
    ledger.push({
      blockId: data.compactionId,
      summary: extractText(data.summary),
      shadowedSeqs: [...data.shadowedSeqs],
      shadowedTokenCount,
      start: data.shadowedRange.start,
      end: data.shadowedRange.end,
      tier,
      parentBlockIds,
      ...typeof data.kernelBlockId === "string" ? { kernelBlockId: data.kernelBlockId } : {},
      ...summarySeq === null ? {} : { summarySeq },
      ...directMessageIds === void 0 ? {} : { directMessageIds },
      ...effectiveMessageIds === void 0 ? {} : { effectiveMessageIds },
      createdAt: event.time
    });
  }
  return ledger;
}
function isCheckpointNode(event) {
  if (event.type !== "user/message") return false;
  const source = event.data.source;
  return source?.plugin === "compact";
}
function buildCompressibleSeqRanges(session, opts = {}) {
  const nodes = session.surface.nodes;
  const preserve = opts.preserveRecent ?? 5;
  const protectedSeqs = /* @__PURE__ */ new Set();
  for (const seq of nodes.slice(-preserve)) protectedSeqs.add(seq);
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const event = session.events[nodes[index]];
    if (event?.type === "user/message" && !isCheckpointNode(event)) {
      protectedSeqs.add(nodes[index]);
      break;
    }
  }
  const raw = [];
  let cur = null;
  const flush = () => {
    if (cur !== null) raw.push(cur);
    cur = null;
  };
  for (const seq of nodes) {
    const event = session.events[seq];
    if (event === void 0 || protectedSeqs.has(seq) || isCheckpointNode(event)) {
      flush();
      continue;
    }
    if (cur !== null && seq < cur.start) {
      flush();
      cur = null;
    }
    const tokens = defaultCountTokens(extractEventText(event));
    if (cur === null) {
      cur = { start: seq, end: seq, count: 1, tokens };
    } else {
      cur = { start: cur.start, end: seq, count: cur.count + 1, tokens: cur.tokens + tokens };
    }
  }
  flush();
  const out = [];
  for (const range of raw) {
    try {
      const { start, end } = resolveSurfaceRange(session, range.start, range.end);
      const count = range.count;
      out.push({ start, end, count, tokens: range.tokens });
    } catch {
    }
  }
  return out.sort((a, b) => b.tokens - a.tokens);
}
function surfaceSummary(session) {
  const nodes = session.surface.nodes;
  if (nodes.length === 0) return "empty";
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  return `${nodes.length} nodes, seqs ${first}..${last}`;
}
function blockRegistry(session) {
  const ledger = rebuildBlockLedger(session.events);
  const kernelIdOf = /* @__PURE__ */ new Map();
  const raw = [];
  let next = 1;
  for (const entry of ledger) {
    let kernelBlockId;
    if (entry.kernelBlockId !== void 0 && /^b\d+$/.test(entry.kernelBlockId)) {
      kernelBlockId = entry.kernelBlockId;
      const num = Number(kernelBlockId.slice(1));
      if (Number.isInteger(num)) next = Math.max(next, num + 1);
    } else {
      kernelBlockId = `b${next}`;
      next += 1;
    }
    kernelIdOf.set(entry.blockId, kernelBlockId);
    raw.push({
      blockId: entry.blockId,
      kernelBlockId,
      tier: entry.tier,
      summarySeq: entry.summarySeq ?? null,
      active: true,
      parentBlockIds: [...entry.parentBlockIds]
    });
  }
  const consumed = /* @__PURE__ */ new Set();
  for (const entry of raw) {
    for (const parent of entry.parentBlockIds) consumed.add(parent);
  }
  return raw.map((entry) => ({
    ...entry,
    active: !consumed.has(entry.blockId)
  }));
}
function blockRefForSummarySeq(session, seq) {
  const event = session.events[seq];
  if (event?.type !== "user/message") return null;
  const source = event.data.source;
  if (source?.plugin !== "compact" || source.compactionId === void 0) return null;
  const entry = blockRegistry(session).find((r) => r.blockId === source.compactionId);
  if (entry === void 0) return null;
  return entry.kernelBlockId;
}
function compactionIdsOfKernelBlocks(session, kernelBlockIds) {
  if (kernelBlockIds.length === 0) return [];
  const byKernel = new Map(blockRegistry(session).map((r) => [r.kernelBlockId, r.blockId]));
  return kernelBlockIds.map((id) => byKernel.get(id)).filter((id) => id !== void 0);
}
function summarySeqOfKernelBlock(session, kernelBlockId) {
  const entry = blockRegistry(session).find((r) => r.kernelBlockId === kernelBlockId);
  return entry?.active ? entry.summarySeq : null;
}
function checkpointBlockIdOf(events, seq) {
  const event = events[seq];
  if (event?.type !== "user/message") return null;
  const source = event.data.source;
  if (source?.plugin !== "compact" || source.compactionId === void 0) return null;
  return source.compactionId;
}
function expandShadowedSeqs(session, blockId) {
  const ledger = rebuildBlockLedger(session.events);
  const byId = new Map(ledger.map((entry) => [entry.blockId, entry]));
  const root = byId.get(blockId);
  if (root === void 0) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const visit = (entry) => {
    if (seen.has(entry.blockId)) return;
    seen.add(entry.blockId);
    for (const seq of entry.shadowedSeqs) {
      const childId = checkpointBlockIdOf(session.events, seq);
      const child = childId === null ? void 0 : byId.get(childId);
      if (child !== void 0) visit(child);
      else out.push(seq);
    }
  };
  visit(root);
  return out;
}

// src/state.ts
function rebuildKernelBlocks(events) {
  const ledger = rebuildBlockLedger(events);
  if (ledger.length === 0) return [];
  const kernelIdOf = /* @__PURE__ */ new Map();
  const parentKernelIds = /* @__PURE__ */ new Map();
  let next = 1;
  for (const entry of ledger) {
    let kernelBlockId;
    if (entry.kernelBlockId !== void 0 && /^b\d+$/.test(entry.kernelBlockId)) {
      kernelBlockId = entry.kernelBlockId;
      const num = Number(kernelBlockId.slice(1));
      if (Number.isInteger(num)) next = Math.max(next, num + 1);
    } else {
      kernelBlockId = `b${next}`;
      next += 1;
    }
    kernelIdOf.set(entry.blockId, kernelBlockId);
    parentKernelIds.set(
      entry.blockId,
      entry.parentBlockIds.map((parent) => kernelIdOf.get(parent)).filter((id) => id !== void 0)
    );
  }
  const consumed = /* @__PURE__ */ new Set();
  for (const entry of ledger) {
    for (const parent of entry.parentBlockIds) consumed.add(parent);
  }
  const blocks = [];
  for (const entry of ledger) {
    const blockId = kernelIdOf.get(entry.blockId);
    const direct = entry.directMessageIds ?? [...entry.shadowedSeqs.map(String)];
    const effective = entry.effectiveMessageIds ?? (entry.tier > 1 ? entry.summarySeq === void 0 ? [...entry.shadowedSeqs.map(String)] : [String(entry.summarySeq)] : [...entry.shadowedSeqs.map(String)]);
    blocks.push({
      blockId,
      runId: `r${blocks.length + 1}`,
      tier: entry.tier,
      summary: entry.summary,
      directMessageIds: [...direct],
      effectiveMessageIds: [...effective],
      directBlockIds: parentKernelIds.get(entry.blockId) ?? [],
      compressedTokens: entry.shadowedTokenCount,
      createdAt: entry.createdAt,
      survivedCount: 0,
      generation: "young",
      active: !consumed.has(entry.blockId)
    });
  }
  return blocks;
}
function nextBlockIdAfter(events) {
  const blocks = rebuildKernelBlocks(events);
  let max = 0;
  for (const block of blocks) {
    const num = Number(block.blockId.slice(1));
    if (Number.isInteger(num)) max = Math.max(max, num);
  }
  return max + 1;
}
var AcpStateStore = class {
  states = /* @__PURE__ */ new Map();
  /** Kernel state for one session, initialised on first access. */
  stateFor(session) {
    const id = session.id;
    const existing = this.states.get(id);
    if (existing !== void 0) return existing;
    const state = createInitialState();
    if (session.events.some((event) => event.type === "compaction/summary")) {
      state.blocks = rebuildKernelBlocks(session.events);
      state.nextBlockId = nextBlockIdAfter(session.events);
    }
    this.states.set(id, state);
    return state;
  }
  set(session, state) {
    this.states.set(session.id, state);
  }
  delete(session) {
    this.states.delete(session.id);
  }
};

// src/tools.ts
import { defineTool } from "@deepseek-ai/dsh-tools";
import { defaultCountTokens as defaultCountTokens3 } from "acp-kernel";

// src/config.ts
import { defaultConfig } from "acp-kernel";
function kernelConfigFor(input) {
  const nudgePatch = {};
  if (input.nudgeMinContextLimitPct !== void 0) nudgePatch.minContextLimitPct = input.nudgeMinContextLimitPct;
  if (input.nudgeMaxContextLimitPct !== void 0) nudgePatch.maxContextLimitPct = input.nudgeMaxContextLimitPct;
  if (input.nudgeEmergencyThresholdPct !== void 0) nudgePatch.emergencyThresholdPct = input.nudgeEmergencyThresholdPct;
  const overrides = { ...input.coreOverrides };
  if (Object.keys(nudgePatch).length > 0) {
    overrides.nudge = { ...defaultConfig(input.modelContextLimit).nudge, ...nudgePatch };
  }
  return defaultConfig(input.modelContextLimit, overrides);
}

// src/nudge.ts
import {
  COMPRESS_PHILOSOPHY as COMPRESS_PHILOSOPHY2,
  TIER2_DISTILL_RULES as TIER2_DISTILL_RULES2,
  TIER3_CONDENSE_RULES as TIER3_CONDENSE_RULES2,
  defaultCountTokens as defaultCountTokens2,
  renderNudgeText
} from "acp-kernel";
import { createUserMessage as createUserMessage2 } from "@deepseek-ai/dsh-llm";

// src/prompts.ts
import { COMPRESS_PHILOSOPHY, HOW_TO_COMPRESS_RULES, TIER2_DISTILL_RULES, TIER3_CONDENSE_RULES } from "acp-kernel";
var NUDGE_ALLOWED = {
  normal: /* @__PURE__ */ new Set(["pct", "philosophy"]),
  emergency: /* @__PURE__ */ new Set(["pct", "philosophy"]),
  guidance: /* @__PURE__ */ new Set(),
  tier: /* @__PURE__ */ new Set(["tier", "count", "prevTier", "tokens", "seqs"]),
  breakdown: /* @__PURE__ */ new Set(["system", "tool", "summaries", "code", "text"]),
  growth: /* @__PURE__ */ new Set(["growth"]),
  tip: /* @__PURE__ */ new Set()
};
var RANGE_TABLE_ALLOWED = {
  header: /* @__PURE__ */ new Set(["surface"]),
  title: /* @__PURE__ */ new Set(["count"]),
  line: /* @__PURE__ */ new Set(["start", "end", "count", "tokens"]),
  footer: /* @__PURE__ */ new Set()
};
var TOOLS_ALLOWED = {
  compress: /* @__PURE__ */ new Set(),
  decompress: /* @__PURE__ */ new Set(),
  searchContext: /* @__PURE__ */ new Set(),
  acpStatus: /* @__PURE__ */ new Set()
};
var SYSTEM_ALLOWED = /* @__PURE__ */ new Set(["philosophy", "howToCompressRules", "tier2DistillRules", "tier3CondenseRules"]);
function validateTemplate(template, allowed, path) {
  const re = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  let match;
  while ((match = re.exec(template)) !== null) {
    const name = match[1];
    if (!allowed.has(name)) {
      throw new Error(
        `${path} contains unknown placeholder {${name}} \u2014 allowed: ${[...allowed].join(", ") || "(none)"}`
      );
    }
  }
  return template;
}
function renderTemplate(template, vars) {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name) => {
    const value = vars[name];
    if (value === void 0) {
      throw new Error(
        `renderTemplate: missing value for placeholder {${name}} in template "${template.slice(0, 60)}\u2026"`
      );
    }
    return String(value);
  });
}
function mergeGroup(defaults, override, allowed, path) {
  if (override == null) return defaults;
  const out = {};
  for (const key of Object.keys(defaults)) {
    const value = override[key];
    out[key] = value === null || value === void 0 ? defaults[key] : validateTemplate(value, allowed[key], `${path}.${String(key)}`);
  }
  return out;
}
function resolvePrompts(input) {
  if (input === void 0) return DEFAULT_RESOLVED;
  return {
    nudge: mergeGroup(DEFAULT_PROMPTS.nudge, input.nudge, NUDGE_ALLOWED, "prompts.nudge"),
    rangeTable: mergeGroup(DEFAULT_PROMPTS.rangeTable, input.rangeTable, RANGE_TABLE_ALLOWED, "prompts.rangeTable"),
    tools: mergeGroup(DEFAULT_PROMPTS.tools, input.tools, TOOLS_ALLOWED, "prompts.tools"),
    systemPromptTemplate: input.systemPrompt === null || input.systemPrompt === void 0 ? DEFAULT_PROMPTS.systemPromptTemplate : validateTemplate(input.systemPrompt, SYSTEM_ALLOWED, "prompts.systemPrompt")
  };
}
function renderSystemPrompt(prompts) {
  return renderTemplate(prompts.systemPromptTemplate, {
    philosophy: COMPRESS_PHILOSOPHY,
    howToCompressRules: HOW_TO_COMPRESS_RULES,
    tier2DistillRules: TIER2_DISTILL_RULES,
    tier3CondenseRules: TIER3_CONDENSE_RULES
  });
}
var DEFAULT_PROMPTS = {
  nudge: {
    // 与 kernel nudge-text.ts EFFICIENCY_NOTE 逐字对齐——不含 "Context usage is at X%"
    // 陈述(usage 只通过 breakdown 传达);{pct} 仍可用作自定义占位符。
    normal: "This is an efficiency nudge to compress early and keep context lean \u2014 not an overflow warning. A separate, stronger alert will appear if the context is actually full.\n\n{philosophy}",
    emergency: "\u26A0\uFE0F Context limit reached \u2014 compress now. Prioritize consumed tool outputs.\n\n{philosophy}",
    guidance: HOW_TO_COMPRESS_RULES,
    tier: "Tier {tier}: {count} tier-{prevTier} block(s) distillable ({tokens} tokens) \u2014 compress their summary node(s) [seqs {seqs}] to reclaim the original messages.",
    breakdown: "Context breakdown: {system}K system | {tool}K tool | {summaries}K summaries | {code}K code | {text}K text",
    growth: "+{growth}K since last nudge",
    tip: "\u{1F4A1} Compress all ranges in one call (pass multiple content entries: `content: [{...}, {...}]`)."
  },
  rangeTable: {
    header: "Surface: {surface}",
    title: "Compressible ranges (suggestions only \u2014 compress any consumed span; refs are surface seqs):",
    line: "  - seq {start}..{end} \u2014 {count} messages, ~{tokens} tokens",
    footer: "Compress with: compress({ content: [{ startSeq, endSeq, summary }] }) \u2014 content is an array: batch multiple unrelated segments in one call, each entry its own block. Keep ranges disjoint.\nSnapshot taken at nudge time: the seqs go stale once the surface moves (a later compress shadows them), so re-run acp_status for fresh refs before compressing."
  },
  tools: {
    compress: "Replace older conversation ranges with dense summaries you write. Each message seq is a surface reference. Single range: compress({ content: [{ startSeq, endSeq, summary }] }). Batch multiple unrelated ranges in one call (each content entry becomes its own block); keep ranges disjoint. Never compress content the current step is actively using. Seq refs must come from the CURRENT surface (acp_status or the latest nudge): a span whose edges were shadowed by an earlier compress is auto-remapped to its still-live content, a fully compressed span is reported as already compressed, and invented/other-session seqs fail with guidance.",
    decompress: "Recover the original content of a compressed block by its blockId (read-only; does not unshadow the range).",
    searchContext: "Search inside compressed blocks (summaries and original content) for information the model no longer sees in context.",
    acpStatus: "Report the ACP block ledger: compressed blocks, reclaimed tokens, and current context pressure."
  },
  systemPromptTemplate: `Active Context Pruning \u2014 model-driven context management

YOU decide whether and when to compress context. The nudge is an efficiency notification: when you see one, consider which ranges you have genuinely consumed and could summarise to keep working context lean.

{philosophy}

WHEN TO COMPRESS:
- A sub-agent or delegated task has returned a large result that you have already extracted the key facts from.
- Verbose command output (build/test logs, git diff, directory listings) where you have already used the information you need.
- Exploration that led nowhere.
- Repeated reads of the same file or repeated status checks once the decision is recorded.
- Resolved discussion threads where a decision has been captured in summary or in code.
- Intermediate steps of a completed multi-step task, once the final result is recorded.
- A task phase has ended \u2014 bug hunt complete, root cause found, exploration done, research sprint wrapped.

WHEN NOT TO COMPRESS:
- Content the current step is actively reading or reasoning about.
- Important user messages \u2014 preserve their exact intent, constraints, and acceptance criteria.
- Protected tool outputs \u2014 hard-excluded from compression ranges, survive intact in visible context.

{howToCompressRules}

Compression tools (refs are SURFACE SEQS, not ids):
- compress: replace one or more seq ranges, each with your own dense summary. Single range: compress({ content: [{ startSeq, endSeq, summary }] }). Batch multiple unrelated segments in one call (each entry becomes its own block): compress({ content: [{ startSeq: 1, endSeq: 5, summary: '...' }, { startSeq: 12, endSeq: 18, summary: '...' }] }). Keep ranges disjoint \u2014 overlapping entries in one batch are skipped. Edges are auto-balanced to tool-call/result boundaries; a trailing #callId fragment in a seq is ignored. Seq refs must be on the current surface: seqs from older nudges or earlier compresses go stale as the surface moves, so a stale span is auto-remapped to its still-live remainder (the result reports the adjusted span), a fully compressed span is reported as already compressed, and invented/other-session seqs fail with guidance.
- decompress: recover a compressed block's original content, read-only. decompress({ blockId }).
- search_context: find information inside compressed blocks BEFORE decompressing. search_context({ query }).
- acp_status: current context usage and the live compressible-range list. Run it right before compressing \u2014 the only seqs that never go stale are the ones you just read.

Tiered compression: each compressed block appears on the surface as one summary node. Compressing that node again DISTILLS the block (tier 2): the parent summary folds into your new summary and the original messages are freed. Distilling a tier-2 block yields tier 3. Distill when a summary itself is consumed \u2014 decompress on the tier-2 block recovers the full originals.

{tier2DistillRules}

{tier3CondenseRules}

When you write a summary, it becomes the ONLY record of that range: keep file paths, signatures, exact values, decisions, and error strings verbatim so a later reader (or you, after decompress) can continue without the original. Never reuse historical seqs \u2014 the surface moves as messages land and compress; verify with acp_status.`
};
var DEFAULT_RESOLVED = DEFAULT_PROMPTS;

// src/nudge.ts
function resolveTokenCount(agent, coreMessages) {
  const projections = agent.ctx?.get?.("sessionProjections");
  const projected = projections?.snapshot?.(agent.session)?.values?.contextPressure?.projectedTokens;
  if (typeof projected === "number" && projected > 0) return projected;
  const meter = agent.ctx?.get?.("tokenMeter");
  const surface = meter?.measure?.(agent.session)?.surfaceTokens;
  if (typeof surface === "number" && surface > 0) return surface;
  return coreMessages.reduce((sum, message) => sum + defaultCountTokens2(message.text ?? ""), 0);
}
function rangeTable(session, prompts = DEFAULT_RESOLVED) {
  const ranges = buildCompressibleSeqRanges(session).slice(0, 6);
  if (ranges.length === 0) return "";
  const lines = ranges.map(
    (range) => renderTemplate(prompts.rangeTable.line, {
      start: range.start,
      end: range.end,
      count: range.count,
      tokens: range.tokens
    })
  );
  return [
    // 前导空串元素产生 nudge 中范围表前的唯一空行(§4:parts 层不再加分隔)。
    "",
    renderTemplate(prompts.rangeTable.header, { surface: surfaceSummary(session) }),
    renderTemplate(prompts.rangeTable.title, { count: ranges.length }),
    ...lines,
    prompts.rangeTable.footer
  ].join("\n");
}
function measuredTokenCount(agent, coreMessages) {
  return resolveTokenCount(agent, coreMessages);
}
function buildNudge(agent, env, lastNudgeTurn) {
  const session = agent.session;
  const state = env.store.stateFor(session);
  const coreMessages = allLogMessages(session);
  const surfaceMessages = eventsToCoreMessages(surfaceEventsOf(session));
  const tokenCount = measuredTokenCount(agent, surfaceMessages);
  const config = kernelConfigFor(env);
  const turn = env.kernel.processTurn({ messages: coreMessages, state, config, tokenCount });
  env.store.set(session, turn.state);
  const nudge = turn.nudge;
  if (nudge === void 0 || !nudge.shouldInject) return null;
  const emergency = nudge.breakdown?.emergencyOverride === 1;
  const turnNumber = findOpenTurn(session.events) ?? 0;
  const alreadyShown = !emergency && lastNudgeTurn.get(session.id) === turnNumber;
  if (alreadyShown) return null;
  lastNudgeTurn.set(session.id, turnNumber);
  const text = buildNudgeText(nudge, emergency, session, env.prompts);
  const message = createUserMessage2({
    content: [{ type: "text", text }],
    source: { kind: "plugin", plugin: "acp-nudge" }
  });
  return { message, emergency };
}
function buildNudgeText(nudge, emergency, session, prompts = DEFAULT_RESOLVED) {
  if (prompts.nudge !== DEFAULT_RESOLVED.nudge) {
    return renderNudgeFromTemplates(nudge, emergency, session, prompts);
  }
  const rendered = renderNudgeText(nudge);
  return adaptKernelNudgeToSeq(rendered.text, nudge, session, prompts);
}
function adaptKernelNudgeToSeq(text, nudge, session, prompts) {
  let out = text;
  if ((nudge.tier === 2 || nudge.tier === 3) && (nudge.tierTargetBlocks?.length ?? 0) > 0) {
    out = replaceTierTrigger(out, nudge, session, prompts);
  } else if (out.includes('"startId"')) {
    out = replaceEmergencyExample(out);
  }
  const seqTable = rangeTable(session, prompts);
  if (seqTable !== "") out = replaceRangesStr(out, seqTable);
  return out;
}
function replaceRangesStr(text, seqTable) {
  const match = text.match(/\n\n(?:Compressible ranges \(|\[No specific ranges detected)/);
  if (!match) return text;
  const start = match.index;
  const rest = text.slice(start + 2);
  const next = rest.match(/\n\n/);
  const end = next !== null ? start + 2 + next.index : text.length;
  const before = text.slice(0, start);
  const after = text.slice(end);
  return before + "\n" + seqTable + after;
}
function replaceTierTrigger(text, nudge, session, prompts) {
  const start = text.search(/\n\n(?:\[TIER \d|\[EMERGENCY — TIER \d)/);
  if (start === -1) return text;
  const rest = text.slice(start + 2);
  const next = rest.match(/\n\nHOW TO COMPRESS/);
  const end = next !== null ? start + 2 + next.index : text.length;
  const targets = nudge.tierTargetBlocks;
  const summarySeqs = targets.map((block) => summarySeqOfKernelBlock(session, block.blockId)).filter((seq) => seq !== null);
  const pending = nudge.tier === 2 ? nudge.breakdown?.pendingT2 : nudge.breakdown?.pendingT3;
  const tokens = typeof pending === "number" ? pending : 0;
  const tierValue = nudge.tier === null ? 2 : nudge.tier;
  const tierLine = renderTemplate(prompts.nudge.tier, {
    tier: tierValue,
    count: targets.length,
    prevTier: tierValue - 1,
    tokens,
    seqs: summarySeqs.join(", ")
  });
  return text.slice(0, start) + "\n\n" + tierLine + text.slice(end);
}
function replaceEmergencyExample(text) {
  const start = text.search(/\n\n\{ "topic":/);
  if (start === -1) return text;
  const rest = text.slice(start + 2);
  const next = rest.match(/\n\nCompressible ranges |\n\n\[No specific/);
  const end = next !== null ? start + 2 + next.index : text.length;
  return text.slice(0, start) + "\n\ncompress({ content: [{ startSeq, endSeq, summary }] }) \u2014 use the seqs from the range table above." + text.slice(end);
}
function renderNudgeFromTemplates(nudge, emergency, session, prompts) {
  const pct = Math.round(Math.min(nudge.contextUsage, 1) * 100);
  const frame = renderTemplate(
    emergency ? prompts.nudge.emergency : prompts.nudge.normal,
    { pct, philosophy: COMPRESS_PHILOSOPHY2 }
  );
  const parts = [frame];
  if (nudge.contextBreakdown) {
    const bd = nudge.contextBreakdown;
    const breakdown = renderTemplate(prompts.nudge.breakdown, {
      system: Math.round(bd.system / 1e3),
      tool: Math.round(bd.tool / 1e3),
      summaries: Math.round(bd.summaries / 1e3),
      code: Math.round(bd.code / 1e3),
      text: Math.round(bd.text / 1e3)
    });
    if (breakdown !== "") parts.push("", breakdown);
    if (bd.growth > 0) {
      const growth = renderTemplate(prompts.nudge.growth, { growth: Math.round(bd.growth / 1e3) });
      if (growth !== "") parts.push(growth);
    }
  }
  if (prompts.nudge.guidance !== "") parts.push("", prompts.nudge.guidance);
  if ((nudge.tier === 2 || nudge.tier === 3) && (nudge.tierTargetBlocks?.length ?? 0) > 0) {
    const targets = nudge.tierTargetBlocks;
    const summarySeqs = targets.map((block) => summarySeqOfKernelBlock(session, block.blockId)).filter((seq) => seq !== null);
    const pending = nudge.tier === 2 ? nudge.breakdown?.pendingT2 : nudge.breakdown?.pendingT3;
    const tokens = typeof pending === "number" ? pending : 0;
    const tierLine = renderTemplate(prompts.nudge.tier, {
      tier: nudge.tier,
      count: targets.length,
      prevTier: nudge.tier - 1,
      tokens,
      seqs: summarySeqs.join(", ")
    });
    if (tierLine !== "") parts.push(tierLine);
    const tierRules = nudge.tier === 2 ? TIER2_DISTILL_RULES2 : TIER3_CONDENSE_RULES2;
    parts.push("", tierRules);
  } else {
    parts.push(rangeTable(session, prompts));
  }
  if (prompts.nudge.tip !== "") parts.push("", prompts.nudge.tip);
  return parts.join("\n");
}

// src/window.ts
var DEFAULT_CONTEXT_WINDOW = 128e3;
function windowSourceLabel(window) {
  if (window.source === "explicit") return "configured";
  if (window.source === "auto") {
    return `auto-detected from ${window.provider ?? "?"}/${window.model ?? "?"}`;
  }
  return "default (auto-detection unavailable)";
}
async function detectContextWindow(agent, provider, model) {
  const llm = agent.ctx?.get?.("llm");
  if (llm?.resolveModelInfo === void 0) return null;
  try {
    const info = await llm.resolveModelInfo(provider, model);
    const window = info?.context?.contextWindow;
    if (typeof window === "number" && Number.isInteger(window) && window > 0) return window;
    return null;
  } catch {
    return null;
  }
}

// src/tools.ts
function textOutput() {
  return {
    schema: {
      type: "object",
      properties: { text: { type: "string" } },
      additionalProperties: false
    },
    render: (_args, value) => [{ type: "text", text: value.text }]
  };
}
function requireAgent(exec) {
  if (exec.agent === void 0) {
    throw new Error("billion-context-dsh: tool requires an agent execution context");
  }
  return exec.agent;
}
var compressParameters = {
  // Tolerated wrapped-arguments form: some models emit
  // `{ "arguments": "{\"content\": [...]}" }` (double-nested) or
  // `{ "arguments": { "content": [...] } }` instead of the unwrapped
  // `{ "content": [...] }`. The old DSH validator surfaced this as
  // `invalid arguments: "arguments" must be an object` and the model retried
  // forever. `arguments` is accepted as an optional JSON node so the wrapped
  // shape passes schema validation; `handleCompress` unwraps it and falls back
  // to a clear runtime error when neither form carries content. `content` is
  // intentionally NOT `required: true` — a required property would reject the
  // wrapped shape before `handleCompress` can see it. The tool description
  // still tells the model content is mandatory.
  arguments: { type: "json", description: "Tolerated wrapped-arguments form (model-generated); unwrapped in handleCompress. Prefer passing content directly." },
  topic: { type: "string", description: "Fallback topic for entries without their own." },
  content: {
    type: "array",
    description: "One or more ranges to compress, each with startSeq/endSeq boundaries (surface seqs) and a dense summary. Required \u2014 pass it directly, not wrapped in an arguments key.",
    items: {
      type: "object",
      properties: {
        startSeq: {
          oneOf: [
            { type: "integer", description: "First surface seq of the range." },
            { type: "string", description: "Seq as text; a trailing #callId fragment is ignored." }
          ]
        },
        endSeq: {
          oneOf: [
            { type: "integer", description: "Inclusive last surface seq of the range." },
            { type: "string", description: "Seq as text; a trailing #callId fragment is ignored." }
          ]
        },
        summary: { type: "string", description: "Complete technical summary replacing the range; keep paths, decisions, values verbatim. Minimum 50 characters." },
        topic: { type: "string", description: "Short label (3-5 words) for this range." }
      },
      additionalProperties: false
    }
  }
};
function parseSeq(value) {
  const text = String(value).split("#")[0].trim();
  const seq = Number(text);
  if (!Number.isInteger(seq) || seq < 0) {
    throw new Error(`billion-context-dsh: invalid seq "${String(value)}" \u2014 use a surface seq like 295`);
  }
  return seq;
}
function unwrapCompressArgs(args) {
  if (args.content !== void 0) return args;
  if (args.arguments === void 0) return null;
  let inner = args.arguments;
  if (typeof inner === "string") {
    try {
      inner = JSON.parse(inner);
    } catch {
      return null;
    }
  }
  if (typeof inner !== "object" || inner === null || Array.isArray(inner)) return null;
  const content = inner.content;
  if (content === void 0) return null;
  return { ...args, content };
}
async function handleCompress(env, args, exec) {
  const agent = requireAgent(exec);
  const session = agent.session;
  const state = env.store.stateFor(session);
  const coreMessages = allLogMessages(session);
  const surfaceMessages = eventsToCoreMessages(surfaceEventsOf(session));
  const tokenCount = resolveTokenCount(agent, surfaceMessages);
  const config = kernelConfigFor(env);
  const turn = env.kernel.processTurn({ messages: coreMessages, state, config, tokenCount });
  env.store.set(session, turn.state);
  const byRaw = turn.state.messageRefs.byRaw;
  const unwrapped = unwrapCompressArgs(args);
  if (unwrapped === null) {
    return {
      text: "compress: missing content \u2014 pass the content array directly: compress({ content: [{ startSeq, endSeq, summary }] })"
    };
  }
  args = unwrapped;
  const ranges = [];
  const alreadyCompressedNotes = [];
  for (const range of args.content) {
    const startSeq = parseSeq(range.startSeq);
    const endSeq = parseSeq(range.endSeq);
    let resolved;
    try {
      resolved = resolveSurfaceRange(session, startSeq, endSeq);
    } catch (error) {
      if (error instanceof AlreadyCompressedRangeError) {
        const covering = error.coveringBlockIds;
        const blockNote = covering.length === 0 ? "" : ` (block ${covering[0].slice(0, 8)}${covering.length > 1 ? ` +${covering.length - 1} more` : ""})`;
        alreadyCompressedNotes.push(
          `  seqs ${error.start}..${error.end} already compressed${blockNote} \u2014 nothing to reclaim; decompress to recover the originals`
        );
        continue;
      }
      throw error;
    }
    const startBlockRef = blockRefForSummarySeq(session, resolved.start);
    const endBlockRef = blockRefForSummarySeq(session, resolved.end);
    const startRef = startBlockRef ?? byRaw[String(resolved.start)];
    const endRef = endBlockRef ?? byRaw[String(resolved.end)];
    if (startRef === void 0 || endRef === void 0) {
      throw new Error(
        `billion-context-dsh: seq ${resolved.start}..${resolved.end} has no assigned ref \u2014 the range must be on the current surface (run acp_status for the live seq list)`
      );
    }
    ranges.push({
      ...resolved,
      startSeq,
      endSeq,
      startRef,
      endRef,
      summary: range.summary,
      ...(range.topic ?? args.topic) === void 0 ? {} : { topic: range.topic ?? args.topic }
    });
  }
  if (ranges.length === 0) {
    const text = ["Compressed 0 block(s), ~0 tokens reclaimed.", ...alreadyCompressedNotes];
    if (alreadyCompressedNotes.length > 0) {
      text.push("  (all requested ranges were already compressed \u2014 decompress a block to recover its originals)");
    }
    return { text: text.join("\n") };
  }
  const applied = env.kernel.applyCompression({
    ranges: ranges.map(({ startRef, endRef, summary, topic }) => ({ startRef, endRef, summary, topic })),
    messages: coreMessages,
    state: turn.state,
    config
    // Deliberately NOT overriding protectedMessageIds: with the full log the
    // kernel's recent/last-user protection is computed over the same
    // non-block-covered messages as the visible feed, so default behavior is
    // preserved. Any 'Excluded N protected message(s)' warning is surfaced.
  });
  if (applied.result.errors.length > 0) {
    return { text: `compress failed: ${applied.result.errors.join("; ")}` };
  }
  env.store.set(session, applied.state);
  const previousIds = new Set(turn.state.blocks.map((block) => block.blockId));
  const newBlocks = applied.state.blocks.filter((block) => !previousIds.has(block.blockId));
  const blockByRangeKey = new Map(newBlocks.map((block) => [`${block.startRef}::${block.endRef}`, block]));
  const warningByRangeKey = /* @__PURE__ */ new Map();
  const freeWarnings = [];
  for (const warning of applied.result.warnings) {
    const match = /^Skipped range \((.+?)\.\.(.+?)\)/.exec(warning);
    if (match !== null) {
      const key = `${match[1]}::${match[2]}`;
      const list = warningByRangeKey.get(key) ?? [];
      list.push(warning);
      warningByRangeKey.set(key, list);
    } else {
      freeWarnings.push(warning);
    }
  }
  const lines = [];
  let skippedRanges = 0;
  for (const range of ranges) {
    const key = `${range.startRef}::${range.endRef}`;
    const block = blockByRangeKey.get(key);
    if (block === void 0) {
      skippedRanges += 1;
      const warnings = warningByRangeKey.get(key) ?? [];
      for (const warning of warnings) lines.push(`  ${warning}`);
      continue;
    }
    const { start, end } = range;
    const shadowed = shadowedSeqsOf(session, start, end);
    let shadowedTokens = 0;
    for (const seq of shadowed) {
      const event = session.events[seq];
      if (event !== void 0) shadowedTokens += defaultCountTokens3(extractEventText(event));
    }
    const tier = block.tier === 2 || block.tier === 3 ? block.tier : 1;
    const parentBlockIds = compactionIdsOfKernelBlocks(session, block.directBlockIds);
    const { compactionId } = runCompactionTransaction(session, {
      start,
      end,
      shadowedSeqs: shadowed,
      summary: [{ type: "text", text: range.summary }],
      shadowedTokenCount: shadowedTokens,
      provider: agent.options.provider ?? "",
      model: agent.options.model ?? "",
      tier,
      kernelBlockId: block.blockId,
      ...parentBlockIds.length === 0 ? {} : { parentBlockIds },
      // Record the kernel block's raw coverage so a restarted engine
      // rehydrates the SAME effective messages (a tier-2 block's coverage is
      // its parents' originals, not the checkpoint node).
      directMessageIds: block.directMessageIds,
      effectiveMessageIds: block.effectiveMessageIds
    });
    const adjusted = start !== range.startSeq || end !== range.endSeq;
    const tierLabel = tier === 1 ? "" : `, tier ${tier}`;
    const note = range.recovered === true ? ` (seqs ${range.startSeq}..${range.endSeq} were already shadowed \u2014 compressed the live remainder ${start}..${end})` : adjusted ? ` (adjusted from ${range.startSeq}..${range.endSeq} to balanced edges)` : "";
    lines.push(
      `  block ${compactionId.slice(0, 8)}: seqs ${start}..${end}, ${shadowed.length} messages shadowed${tierLabel}${note}`
    );
  }
  const summaryLine = `Compressed ${applied.result.blocksCreated} block(s), ~${applied.result.tokensCompressed} tokens reclaimed.`;
  const totalSkipped = skippedRanges + alreadyCompressedNotes.length;
  const warningLines = [...freeWarnings.map((warning) => `  ${warning}`), ...alreadyCompressedNotes, ...lines];
  const footer = totalSkipped > 0 ? `  (${totalSkipped} range(s) skipped \u2014 see warnings above)` : "";
  return { text: `${summaryLine}
${[...warningLines, footer].filter((line) => line !== "").join("\n")}` };
}
var decompressParameters = {
  blockId: { type: "string", required: true, description: "Block id from acp_status or search_context (the compaction id)." }
};
function handleDecompress(_env, args, exec) {
  const session = requireAgent(exec).session;
  const ledger = rebuildBlockLedger(session.events);
  const block = ledger.find((entry) => entry.blockId.startsWith(args.blockId));
  if (block === void 0) {
    return { text: `decompress: block "${args.blockId}" not found (see acp_status for the block list)` };
  }
  const parts = [];
  for (const seq of expandShadowedSeqs(session, block.blockId)) {
    const event = session.events[seq];
    const text = event === void 0 ? "" : extractEventText(event);
    if (text.length > 0) parts.push(`[seq ${seq}] ${text}`);
  }
  const tierNote = block.tier > 1 ? ` (tier ${block.tier}, distills ${block.parentBlockIds.length} block(s))` : "";
  return {
    text: `Block ${block.blockId} \u2014 ${block.summary}${tierNote}

${parts.join("\n\n") || "(no recoverable content)"}`
  };
}
var searchParameters = {
  query: { type: "string", required: true, description: "Search terms to find inside compressed blocks." },
  limit: { type: "integer", description: "Maximum results (default 5)." }
};
function handleSearch(_env, args, exec) {
  const session = requireAgent(exec).session;
  const ledger = rebuildBlockLedger(session.events);
  const terms = args.query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = [];
  for (const block of ledger) {
    const original = block.shadowedSeqs.map((seq) => extractEventText(session.events[seq])).join("\n");
    const haystack = `${block.summary}
${original}`.toLowerCase();
    let score = 0;
    for (const term of terms) score += haystack.split(term).length - 1;
    if (score > 0) scored.push({ blockId: block.blockId, score, summary: block.summary });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, args.limit ?? 5);
  if (top.length === 0) return { text: `search_context: no matches for "${args.query}"` };
  return {
    text: `Matches for "${args.query}":
` + top.map((hit) => `  - ${hit.blockId} (score ${hit.score}): ${hit.summary.slice(0, 160)}`).join("\n") + "\n\nDecompress with: decompress({ blockId })"
  };
}
var statusParameters = {};
async function handleStatus(env, _args, exec) {
  const agent = requireAgent(exec);
  const session = agent.session;
  const ledger = rebuildBlockLedger(session.events);
  const totalTokens = ledger.reduce((sum, block) => sum + block.shadowedTokenCount, 0);
  const coreMessages = eventsToCoreMessages(surfaceEventsOf(session));
  const estimated = resolveTokenCount(agent, coreMessages);
  const window = env.windowFor === void 0 ? { limit: env.modelContextLimit, source: "explicit" } : await env.windowFor(agent);
  const limit = window.limit;
  const lines = [
    `ACP status \u2014 session ${session.id}`,
    `  blocks: ${ledger.length}`,
    `  tokens compressed: ${totalTokens}`,
    `  estimated context: ${estimated} / ${limit} (${Math.round(estimated / limit * 100)}%)`,
    `  context window: ${limit} (${windowSourceLabel(window)})`,
    `  surface: ${surfaceSummary(session)}`
  ];
  for (const block of ledger.slice(0, 10)) {
    lines.push(`  - ${block.blockId.slice(0, 8)}: seqs ${block.start}..${block.end} (${block.shadowedSeqs.length} msgs) \u2014 ${block.summary.slice(0, 80)}`);
  }
  return { text: lines.join("\n") };
}
function makeTools(env) {
  const prompts = env.prompts ?? DEFAULT_RESOLVED;
  return [
    defineTool({
      name: "compress",
      description: prompts.tools.compress,
      parameters: compressParameters,
      output: textOutput(),
      async execute(args, exec) {
        return handleCompress(env, args, exec);
      }
    }),
    defineTool({
      name: "decompress",
      description: prompts.tools.decompress,
      parameters: decompressParameters,
      output: textOutput(),
      execute(args, exec) {
        return Promise.resolve(handleDecompress(env, args, exec));
      }
    }),
    defineTool({
      name: "search_context",
      description: prompts.tools.searchContext,
      parameters: searchParameters,
      output: textOutput(),
      execute(args, exec) {
        return Promise.resolve(handleSearch(env, args, exec));
      }
    }),
    defineTool({
      name: "acp_status",
      description: prompts.tools.acpStatus,
      parameters: statusParameters,
      output: textOutput(),
      execute(args, exec) {
        return handleStatus(env, args, exec);
      }
    })
  ];
}

// src/commands.ts
import { defaultCountTokens as defaultCountTokens4 } from "acp-kernel";
async function statusText(env, agent) {
  const session = agent.session;
  const ledger = rebuildBlockLedger(session.events);
  const totalTokens = ledger.reduce((sum, block) => sum + block.shadowedTokenCount, 0);
  const coreMessages = eventsToCoreMessages(surfaceEventsOf(session));
  const estimated = resolveTokenCount(agent, coreMessages);
  const window = env.windowFor === void 0 ? { limit: env.modelContextLimit, source: "explicit" } : await env.windowFor(agent);
  const limit = window.limit;
  const lines = [
    `ACP status \u2014 session ${session.id}`,
    `  blocks: ${ledger.length}`,
    `  tokens compressed: ${totalTokens}`,
    `  estimated context: ${estimated} / ${limit} (${Math.round(estimated / limit * 100)}%)`,
    `  context window: ${limit} (${windowSourceLabel(window)})`
  ];
  for (const block of ledger.slice(0, 10)) {
    const tier = block.tier > 1 ? ` [T${block.tier}]` : "";
    lines.push(`  - ${block.blockId.slice(0, 8)}${tier}: seqs ${block.start}..${block.end} \u2014 ${block.summary.slice(0, 80)}`);
  }
  return lines.join("\n");
}
function compressText(env, agent, args) {
  if (args.length < 3) {
    return "/acp compress <startSeq> <endSeq> <summary...>";
  }
  const startSeq = Number(args[0]);
  const endSeq = Number(args[1]);
  const summary = args.slice(2).join(" ");
  if (!Number.isInteger(startSeq) || !Number.isInteger(endSeq)) {
    return "/acp compress: startSeq and endSeq must be integers";
  }
  const session = agent.session;
  const { start, end } = resolveSurfaceRange(session, startSeq, endSeq);
  if (blockRefForSummarySeq(session, start) !== null || blockRefForSummarySeq(session, end) !== null) {
    return "/acp compress: the range touches a compressed block summary node \u2014 distill it with the compress tool (seq-based batch), not /acp compress";
  }
  const shadowed = shadowedSeqsOf(session, startSeq, endSeq);
  let shadowedTokens = 0;
  for (const seq of shadowed) {
    const event = session.events[seq];
    if (event !== void 0) shadowedTokens += defaultCountTokens4(extractEventText(event));
  }
  const { compactionId } = runCompactionTransaction(session, {
    start,
    end,
    shadowedSeqs: shadowed,
    summary: [{ type: "text", text: summary }],
    shadowedTokenCount: shadowedTokens,
    provider: agent.options.provider ?? "",
    model: agent.options.model ?? ""
  });
  return `Compressed seqs ${start}..${end} (${shadowed.length} messages) as block ${compactionId.slice(0, 8)}`;
}
function decompressText(_env, agent, args) {
  if (args.length < 1) return "/acp decompress <blockId>";
  const session = agent.session;
  const ledger = rebuildBlockLedger(session.events);
  const block = ledger.find((entry) => entry.blockId.startsWith(args[0]));
  if (block === void 0) return `block "${args[0]}" not found (see /acp status)`;
  const parts = expandShadowedSeqs(session, block.blockId).map((seq) => extractEventText(session.events[seq])).filter((text) => text.length > 0);
  return `Block ${block.blockId} \u2014 ${block.summary}

${parts.join("\n\n") || "(no recoverable content)"}`;
}
function acpCommand(env) {
  return {
    name: "acp",
    description: "Active Context Pruning \u2014 model-driven context compression. Usage: /acp status | /acp compress <startSeq> <endSeq> <summary> | /acp decompress <blockId>",
    handler: async (invocation) => {
      const raw = invocation.rawInput.trim();
      if (raw === "" || raw === "status") {
        return { kind: "success", text: await statusText(env, invocation.agent) };
      }
      if (raw.startsWith("compress")) {
        return { kind: "success", text: compressText(env, invocation.agent, raw.slice("compress".length).trim().split(/\s+/)) };
      }
      if (raw.startsWith("decompress")) {
        return { kind: "success", text: decompressText(env, invocation.agent, raw.slice("decompress".length).trim().split(/\s+/)) };
      }
      return { kind: "error", text: `unknown /acp subcommand "${raw.split(/\s+/)[0]}" \u2014 use status | compress | decompress` };
    }
  };
}

// src/system-prompt.ts
var ACP_SYSTEM_PROMPT = renderSystemPrompt(DEFAULT_PROMPTS);
var ACP_SYSTEM_PROMPT_ORDER = 150;

// src/index.ts
var DEFAULT_CONFIG = {
  autoModelContextLimit: true,
  autoTools: true,
  autoCommand: true,
  autoNudge: true,
  // Nudge thresholds: engine defaults 0.70/0.85 — deliberately below the
  // kernel/billion-context-pi 0.75/0.95. 0.95 leaves no room to act before
  // the API rejects, and the host's compaction-basic line (thresholdRatio
  // 0.80) shadows it in standard/code/cordis modes; 0.70 keeps the forced
  // over-limit nudge ahead of that 80% line. Explicit values always win.
  nudgeMaxContextLimitPct: 0.7,
  nudgeEmergencyThresholdPct: 0.85
};
function resolveAcpConfig(config = {}) {
  return { ...DEFAULT_CONFIG, ...config };
}
var AcpCompactionEngine = class extends CompactionEngine {
  /** The framework-agnostic ACP compression core, reused verbatim. */
  kernel;
  /** Per-session kernel state. */
  store;
  /** Resolved engine configuration. */
  config;
  /** Resolved prompt templates (validated at construction — fail-fast on template typos). */
  prompts;
  lastNudgeTurn = /* @__PURE__ */ new Map();
  /** Per provider/model route the resolved window (probe failures cached too). */
  windowCache = /* @__PURE__ */ new Map();
  constructor(ctx, config = {}) {
    super(ctx);
    this.config = resolveAcpConfig(config);
    this.prompts = resolvePrompts(config.prompts);
    const ports = this.config.countTokens !== void 0 ? { countTokens: this.config.countTokens } : {};
    this.kernel = createCore(ports);
    this.store = new AcpStateStore();
    const env = {
      kernel: this.kernel,
      store: this.store,
      // Initial value before any probe; windowFor() replaces it per pre-step.
      modelContextLimit: this.config.modelContextLimit ?? DEFAULT_CONTEXT_WINDOW,
      nudgeMinContextLimitPct: this.config.nudgeMinContextLimitPct,
      nudgeMaxContextLimitPct: this.config.nudgeMaxContextLimitPct,
      nudgeEmergencyThresholdPct: this.config.nudgeEmergencyThresholdPct,
      coreOverrides: this.config.coreOverrides,
      windowFor: (agent) => this.windowFor(agent),
      prompts: this.prompts
    };
    const tools = ctx.get("tools");
    if (tools !== void 0) {
      for (const tool of makeTools(env)) tools.register(tool);
    } else {
      let done = false;
      const registerTools = () => {
        if (done) return;
        const registry = ctx.get("tools");
        if (registry === void 0) return;
        done = true;
        for (const tool of makeTools(env)) registry.register(tool);
      };
      ctx.on("internal/service", (name) => {
        if (name === "tools") registerTools();
      });
    }
    const commands = ctx.get("commands");
    if (commands !== void 0) {
      commands.register(acpCommand(env));
    } else {
      let done = false;
      const registerCommand = () => {
        if (done) return;
        const registry = ctx.get("commands");
        if (registry === void 0) return;
        done = true;
        registry.register(acpCommand(env));
      };
      ctx.on("internal/service", (name) => {
        if (name === "commands") registerCommand();
      });
    }
    if (this.config.autoNudge) {
      ctx.on("agent/pre-step", async (payload, next) => {
        const decision = await next();
        if (decision.kind === "reject") return decision;
        const window = await this.windowFor(payload.agent);
        const outcome = buildNudge(payload.agent, { ...env, modelContextLimit: window.limit }, this.lastNudgeTurn);
        if (outcome === null) return decision;
        return { kind: "enter", messages: [...decision.messages, outcome.message] };
      });
    }
    const systemPrompt = ctx.get("systemPrompt");
    if (systemPrompt !== void 0) {
      systemPrompt.section({
        name: "billion-context-dsh",
        order: ACP_SYSTEM_PROMPT_ORDER,
        text: renderSystemPrompt(this.prompts)
      });
    } else {
      let done = false;
      const registerSystemPrompt = () => {
        if (done) return;
        const registry = ctx.get("systemPrompt");
        if (registry === void 0) return;
        done = true;
        registry.section({
          name: "billion-context-dsh",
          order: ACP_SYSTEM_PROMPT_ORDER,
          text: renderSystemPrompt(this.prompts)
        });
      };
      ctx.on("internal/service", (name) => {
        if (name === "systemPrompt") registerSystemPrompt();
      });
    }
  }
  /**
   * Resolve the effective context window for an agent. An explicitly
   * configured `modelContextLimit` always wins (no probe). Otherwise probe the
   * model's real window via `agent.ctx.llm.resolveModelInfo` (cached per
   * provider/model route, probe failures cached too) and fall back to
   * DEFAULT_CONTEXT_WINDOW when auto-detection is disabled or unavailable.
   */
  async windowFor(agent) {
    if (this.config.modelContextLimit !== void 0) {
      return { limit: this.config.modelContextLimit, source: "explicit" };
    }
    const provider = agent.options.provider ?? "";
    const model = agent.options.model ?? "";
    const key = `${provider}\0${model}`;
    const cached = this.windowCache.get(key);
    if (cached !== void 0) return cached;
    let window;
    if (!this.config.autoModelContextLimit) {
      window = { limit: DEFAULT_CONTEXT_WINDOW, source: "default", provider, model };
    } else {
      const detected = await detectContextWindow(agent, provider, model);
      window = detected === null ? { limit: DEFAULT_CONTEXT_WINDOW, source: "default", provider, model } : { limit: detected, source: "auto", provider, model };
    }
    this.windowCache.set(key, window);
    return window;
  }
  /** ACP is model-driven: automatic pressure policy never summarizes by itself. */
  async compactIfNeeded(_agent, _trigger, signal) {
    signal.throwIfAborted();
    return null;
  }
  /** Explicit idle-session compaction: ACP leaves the decision to the model. */
  async compactNow(_agent, signal) {
    signal.throwIfAborted();
    return null;
  }
  /**
   * The model-driven path lands through the `compress` tool, which runs the
   * full durable transaction directly. This seam method rejects with guidance:
   * automatic summarization is exactly what ACP replaces.
   */
  async compactRegion(_start, _end, _agent, signal) {
    signal?.throwIfAborted();
    throw new ManualCompactionError(
      "summary",
      "billion-context-dsh is model-driven: use the compress tool instead of automatic summarization"
    );
  }
};
var index_default = AcpCompactionEngine;
export {
  ACP_SYSTEM_PROMPT,
  ACP_SYSTEM_PROMPT_ORDER,
  AcpCompactionEngine,
  AcpStateStore,
  AlreadyCompressedRangeError,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_PROMPTS,
  DEFAULT_RESOLVED,
  acpCommand,
  assertNoActiveCompaction,
  blockRefForSummarySeq,
  blockRegistry,
  buildNudge,
  compactionIdsOfKernelBlocks,
  index_default as default,
  detectContextWindow,
  eventsToCoreMessages,
  expandShadowedSeqs,
  extractEventText,
  findOpenTurn,
  kernelConfigFor,
  makeTools,
  projectEvent,
  rebuildBlockLedger,
  renderSystemPrompt,
  renderTemplate,
  resolveAcpConfig,
  resolvePrompts,
  resolveSurfaceRange,
  resolveTokenCount,
  runCompactionTransaction,
  shadowedSeqsOf,
  summarySeqOfKernelBlock,
  surfaceEventsOf,
  windowSourceLabel
};
//# sourceMappingURL=index.js.map