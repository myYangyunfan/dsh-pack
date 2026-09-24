/**
 * graph-memory
 *
 * By: adoresever
 * Email: Wywelljob@gmail.com
 */

/**
 * Tool use/result pairing repair for assembled context.
 *
 * 裁剪消息后修复 tool_use/toolResult 配对，防止 OpenClaw 报 "Message ordering conflict"
 */

type AgentMessageLike = {
  role: string;
  content?: unknown;
  toolCallId?: string;
  toolUseId?: string;
  toolName?: string;
  stopReason?: string;
  isError?: boolean;
  timestamp?: number;
};

type ToolCallLike = { id: string; name?: string };

const TOOL_CALL_TYPES = new Set([
  "toolCall", "toolUse", "tool_use", "tool-use",
  "functionCall", "function_call",
]);

function extractToolCallId(block: { id?: unknown; call_id?: unknown }): string | null {
  if (typeof block.id === "string" && block.id) return block.id;
  if (typeof block.call_id === "string" && block.call_id) return block.call_id;
  return null;
}

function extractToolCallsFromAssistant(msg: AgentMessageLike): ToolCallLike[] {
  if (!Array.isArray(msg.content)) return [];
  const calls: ToolCallLike[] = [];
  for (const block of msg.content) {
    if (!block || typeof block !== "object") continue;
    const rec = block as { type?: unknown; id?: unknown; call_id?: unknown; name?: unknown };
    const id = extractToolCallId(rec);
    if (!id) continue;
    if (typeof rec.type === "string" && TOOL_CALL_TYPES.has(rec.type)) {
      calls.push({ id, name: typeof rec.name === "string" ? rec.name : undefined });
    }
  }
  return calls;
}

function extractToolResultId(msg: AgentMessageLike): string | null {
  if (typeof msg.toolCallId === "string" && msg.toolCallId) return msg.toolCallId;
  if (typeof msg.toolUseId === "string" && msg.toolUseId) return msg.toolUseId;
  return null;
}

function makeMissingToolResult(params: { toolCallId: string; toolName?: string }): AgentMessageLike {
  return {
    role: "toolResult",
    toolCallId: params.toolCallId,
    toolName: params.toolName ?? "unknown",
    content: [{ type: "text", text: "[graph-memory] tool result missing after context trim." }],
    isError: true,
    timestamp: Date.now(),
  };
}

export function sanitizeToolUseResultPairing<T extends AgentMessageLike>(messages: T[]): T[] {
  const out: T[] = [];
  const seenToolResultIds = new Set<string>();
  let changed = false;

  const pushToolResult = (msg: T) => {
    const id = extractToolResultId(msg);
    if (id && seenToolResultIds.has(id)) { changed = true; return; }
    if (id) seenToolResultIds.add(id);
    out.push(msg);
  };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || typeof msg !== "object") { out.push(msg); continue; }

    const role = msg.role;
    if (role !== "assistant") {
      if (role !== "toolResult") { out.push(msg); }
      else { changed = true; }
      continue;
    }

    const stopReason = msg.stopReason;
    if (stopReason === "error" || stopReason === "aborted") {
      out.push(msg);
      continue;
    }

    const toolCalls = extractToolCallsFromAssistant(msg);
    if (toolCalls.length === 0) { out.push(msg); continue; }

    const toolCallIds = new Set(toolCalls.map((t) => t.id));
    const spanResultsById = new Map<string, T>();
    const remainder: T[] = [];

    let j = i + 1;
    for (; j < messages.length; j++) {
      const next = messages[j];
      if (!next || typeof next !== "object") { remainder.push(next); continue; }
      if (next.role === "assistant") break;

      if (next.role === "toolResult") {
        const id = extractToolResultId(next);
        if (id && toolCallIds.has(id)) {
          if (seenToolResultIds.has(id)) { changed = true; continue; }
          if (!spanResultsById.has(id)) spanResultsById.set(id, next);
          continue;
        }
      }

      if (next.role !== "toolResult") { remainder.push(next); }
      else { changed = true; }
    }

    out.push(msg);

    if (spanResultsById.size > 0 && remainder.length > 0) changed = true;

    for (const call of toolCalls) {
      const existing = spanResultsById.get(call.id);
      if (existing) {
        pushToolResult(existing);
      } else {
        changed = true;
        pushToolResult(makeMissingToolResult({ toolCallId: call.id, toolName: call.name }) as T);
      }
    }

    for (const rem of remainder) out.push(rem);
    i = j - 1;
  }

  return changed ? out : messages;
}
