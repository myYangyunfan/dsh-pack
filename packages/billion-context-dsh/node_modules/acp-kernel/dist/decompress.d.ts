import type { CompressionBlock, CompressionState, CoreMessage } from "./types.js";
export declare function parseBlockIdArg(arg: string): string | null;
export declare function findBlocksOverlappingMessages(state: CompressionState, messageIds: Set<string>): CompressionBlock[];
export declare function findActiveAncestor(state: CompressionState, blockId: string): string | null;
export interface DeactivateOptions {
    deep?: boolean;
}
export declare function deactivateBlock(state: CompressionState, blockIds: string[], options?: DeactivateOptions): CompressionState;
export interface RestoredPreviewResult {
    preview: string;
    restoredCount: number;
}
export declare function buildRestoredContentPreview(messages: CoreMessage[], beforeActiveMessageIds: Set<string>, state: CompressionState): RestoredPreviewResult;
export interface CollectedContentResult {
    /** Rendered, human-readable content string (empty when count is 0). */
    text: string;
    /** Number of items rendered: direct messages + nested summaries (full=false) or all messages (full=true). */
    count: number;
}
export interface CollectContentOptions {
    /** When true, recurse through all nested tiers to original messages. Default: false (one tier up — nested active children stay folded, their summaries shown). */
    full?: boolean;
}
/**
 * Collect a block's content as a readable string WITHOUT modifying state.
 *
 * This is the cache-safe decompress primitive: the block stays compressed
 * (folded), its summary stays in place, and the full content is returned as
 * text for the caller to surface (e.g. as a tool result appended to the
 * conversation). Unlike deactivateBlock + prune, this does not mutate the
 * message-array prefix, so prompt cache is preserved.
 *
 * full=false (default): one tier up. Nested ACTIVE children of this block
 *   stay folded; their summaries are rendered in place of their messages.
 *   The block's own direct messages (not covered by any active child) are
 *   rendered in full.
 * full=true: recurse through all nested tiers; every effective message is
 *   rendered in full.
 *
 * Returns { text: "", count: 0 } when the block covers no messages.
 */
export declare function collectBlockContent(state: CompressionState, block: CompressionBlock, messages: CoreMessage[], options?: CollectContentOptions): CollectedContentResult;
//# sourceMappingURL=decompress.d.ts.map