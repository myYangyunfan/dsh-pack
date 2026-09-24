import type { CoreMessage } from "./types.js";
/**
 * Adjust compression range boundaries to keep a `reasoning` message together
 * with the assistant text/tool-call it belongs to.
 *
 * Reasoning models (DeepSeek-R1, GLM-4.6 thinking, Qwen-QwQ, Anthropic
 * thinking) emit a `reasoning_content` / thinking block that strict providers
 * require to be echoed back alongside the response on every subsequent
 * request. In acp-kernel that block is a separate `contentType: "reasoning"`
 * message immediately preceding the assistant text/tool-call of the same turn.
 * If a compression range covers only one half of the pair, the rebuilt
 * conversation ships reasoning without its response (or vice versa) and the
 * provider returns HTTP 400 (DeepSeek: "reasoning_content in the thinking mode
 * must be passed back to the API").
 *
 * This is the reasoning analogue of {@link adjustBoundariesForToolPairs}:
 * before a range is applied, pull the orphan half INTO the range so the pair
 * compresses together — zero information loss. Only MESSAGE-boundary ranges
 * are adjusted (block-boundary ranges are left untouched, like tool pairs).
 *
 * Pairing is adjacency-based — there is no shared id (unlike toolCallId). A
 * `reasoning` message pairs with the assistant text/tool-call immediately
 * following its reasoning run, and an assistant text/tool-call pairs with the
 * reasoning run immediately preceding it. This matches the round-trip contract
 * every adapter relies on when reconstructing reasoning_content.
 *
 * @returns Adjusted { startIndex, endIndex } — may be wider than input.
 */
export declare function adjustBoundariesForReasoningPairs(startIndex: number, endIndex: number, messages: CoreMessage[]): {
    startIndex: number;
    endIndex: number;
};
//# sourceMappingURL=reasoning-pairs.d.ts.map