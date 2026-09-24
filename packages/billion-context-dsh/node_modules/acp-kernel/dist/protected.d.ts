import type { Config, CoreMessage } from "./types.js";
/** Tools that are ALWAYS protected, regardless of user config. These are ACP's
 *  own metadata tools whose records must remain in context: compress calls
 *  carry the summaries that decompress/search rely on, and the system prompt
 *  treats past compress calls as load-bearing metadata. Letting them be
 *  compressed away breaks decompress and the "summary is historical" contract. */
export declare const ALWAYS_PROTECTED_TOOLS: readonly ["compress"];
/** Tool results that must NEVER participate in the soft-protected recent zone
 *  (preserveRecentMessages / preserveRecentTokens / last user message).
 *
 *  These tools return large content (restored blocks, search hits, file bodies,
 *  command output). If such a result lands in the last-N window it becomes
 *  un-compressible: the model cannot reclaim that context, and it never appears
 *  in the compressible-ranges recommendation list. Excluding these tools from
 *  the protected zone lets the model compress them again immediately, while
 *  still leaving them visible (the host's preserveRecent is about not
 *  compressing the active working set, not about which tool results are in
 *  scope).
 *
 *  - `decompress`: large restored content as an inline tool result.
 *  - `search_context`: large result lists (10 ranked hits with previews).
 *  - `read`: file/image contents — the largest common source of context bloat.
 *  - `bash`: command output (build/test/logs) — frequently large and spent.
 *
 *  Note: this only affects the recent-zone computation. Such messages remain
 *  fully visible and compressible like any ordinary message. */
export declare const NEVER_PRESERVE_RECENT_TOOLS: readonly ["decompress", "search_context", "read", "bash"];
/** True for tool-call / tool-result messages whose toolName is in the
 *  NEVER_PRESERVE_RECENT_TOOLS list — i.e. tool results (like decompress)
 *  that should be excluded from the soft-protected recent zone. */
export declare function isNeverPreserveRecent(msg: CoreMessage): boolean;
export declare function matchToolPattern(toolName: string, pattern: string): boolean;
export declare function isMessageProtected(msg: CoreMessage, config: Pick<Config, "protectedTools" | "isToolProtected">): boolean;
/** Build the set of toolCallIds whose tool-call is protected. Use this to also
 *  protect tool-results that lack a toolName (common when the host projects a
 *  tool-result with only toolCallId). Without it, the result half of a
 *  protected tool exchange leaks into compressible ranges. */
export declare function collectProtectedToolCallIds(messages: CoreMessage[], config: Pick<Config, "protectedTools" | "isToolProtected">): Set<string>;
/** Like isMessageProtected, but also matches tool-results by toolCallId against
 *  the protected call set. Use when you have the full message list available. */
export declare function isMessageProtectedWithPairing(msg: CoreMessage, config: Pick<Config, "protectedTools" | "isToolProtected">, protectedCallIds: Set<string>): boolean;
//# sourceMappingURL=protected.d.ts.map