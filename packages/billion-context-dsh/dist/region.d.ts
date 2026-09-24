/**
 * M5 — durable region transaction and the log-rebuilt block ledger.
 *
 * Modeled on `dsh-compaction-basic/src/region.ts` (which is package-internal
 * and not exported by the seam): validate the surface range and tool-call/result
 * pairing, take the durable `compaction/start` lock, record `compaction/summary`
 * as the shadow price, land the `user/message` surface replacement carrying the
 * summary under `compactCheckpointSource`, and release the lock with
 * `compaction/end`. The original events stay in the append-only log, so
 * decompress/search/status can rebuild everything from the log.
 * @module billion-context-dsh/region
 */
import type { Session, SessionEvent, SessionEventMap } from '@deepseek-ai/dsh-session';
import { type ContentBlock } from '@deepseek-ai/dsh-llm';
/** One durable ACP block as rebuilt from the session log. */
export interface AcpBlockLedgerEntry {
    /** The compaction transaction id (stable block identity). */
    readonly blockId: string;
    readonly summary: string;
    readonly shadowedSeqs: readonly number[];
    readonly shadowedTokenCount: number;
    readonly start: number;
    readonly end: number;
    /** Compression tier: 1 (message range), 2 (distills tier-1 blocks), 3 (distills tier-2 blocks). Legacy blocks default to 1. */
    readonly tier: 1 | 2 | 3;
    /** Compaction ids of the blocks this block distilled (parents). Empty for tier-1 blocks. */
    readonly parentBlockIds: readonly string[];
    /** The acp-kernel block id (`bN`) created for this transaction — absent for legacy blocks (synthesised by order). */
    readonly kernelBlockId?: string;
    /** The surface seq of this block's checkpoint summary node (derived from the log; null when the node is gone). */
    readonly summarySeq?: number;
    /** The kernel block's raw direct/effective message ids at creation (recorded since the tier feature; absent for legacy). */
    readonly directMessageIds?: readonly string[];
    readonly effectiveMessageIds?: readonly string[];
    /** Unix epoch ms of the compaction/summary event. */
    readonly createdAt: number;
}
/** The open turn number, or null when the log ends between turns. */
export declare function findOpenTurn(events: readonly SessionEvent[]): number | null;
/** Reject a second concurrent compaction for the same session. */
export declare function assertNoActiveCompaction(events: readonly SessionEvent[]): void;
/**
 * A requested range whose EVERY live message was already shadowed by one or
 * more blocks. The compress tool catches this and reports the range as already
 * compressed (with the covering block ids) instead of folding block summary
 * nodes as plain messages or erroring out. Distillation stays an explicit act:
 * target a LIVE checkpoint seq directly to distill (tier 2/3).
 */
export declare class AlreadyCompressedRangeError extends Error {
    readonly start: number;
    readonly end: number;
    readonly coveringBlockIds: readonly string[];
    constructor(start: number, end: number, coveringBlockIds: readonly string[]);
}
export interface ResolvedSurfaceRange {
    readonly start: number;
    readonly end: number;
    /**
     * True when the requested edges were not on the current surface and were
     * remapped to the still-live content of the requested span (an earlier
     * compression shadowed them). Callers surface this so the model sees what
     * was actually compressed instead of silently shadowing a different span.
     */
    readonly recovered?: boolean;
}
/**
 * Validate one inclusive surface span and adjust its edges to a
 * tool-pairing-balanced range whose boundaries carry a bare-seq ref. Reversed
 * ranges throw. An edge that sits inside a tool-call/result pair — or on a
 * multi-tool-call assistant message that has no bare-seq ref — is first nudged
 * inward to the nearest clean cut; if that collapses the range (e.g. the model
 * asked for a SINGLE tool result, which can never be balanced alone), the
 * range EXPANDS outward to the enclosing clean pair instead — a lone tool
 * message is almost always a "consumed output" the model genuinely wants to
 * compress. The returned range is what a caller should actually shadow.
 *
 * Missing edges are NOT an immediate error: the seqs were probably shadowed by
 * an earlier compression (stale nudge table / old compress result). The span
 * is rebuilt from its still-live remainder via recoverStaleRange — a fully
 * shadowed span throws AlreadyCompressedRangeError, a genuinely unknown edge
 * throws the not-in-surface guidance error. The returned range is what a
 * caller should actually shadow.
 */
export declare function resolveSurfaceRange(session: Session, start: number, end: number): ResolvedSurfaceRange;
/** The surface seqs shadowed by the inclusive positional span. */
export declare function shadowedSeqsOf(session: Session, start: number, end: number): number[];
export interface CompactionTransactionInput {
    readonly start: number;
    readonly end: number;
    readonly shadowedSeqs: readonly number[];
    readonly summary: ContentBlock[];
    readonly shadowedTokenCount: number;
    readonly provider: string;
    readonly model: string;
    /** Compression tier of this block (default 1). */
    readonly tier?: 1 | 2 | 3;
    /** The acp-kernel block id (`bN`) created by the kernel for this transaction. */
    readonly kernelBlockId?: string;
    /** Compaction ids of the blocks distilled into this one. */
    readonly parentBlockIds?: readonly string[];
    /** The kernel block's direct/effective message ids (raw CoreMessage ids) — recorded for faithful rehydration. */
    readonly directMessageIds?: readonly string[];
    readonly effectiveMessageIds?: readonly string[];
}
/**
 * ACP tier extension fields carried on `compaction/summary` events. The
 * upstream dsh-compaction event type does not know them, so reads and writes
 * go through this precise intersection (never `any`).
 */
export interface AcpCompactionSummaryFields {
    /** Compression tier (1/2/3) — 1 = message range, 2 = distills tier-1, 3 = distills tier-2. */
    readonly tier?: 1 | 2 | 3;
    /** The acp-kernel block id (`bN`) created for this transaction. */
    readonly kernelBlockId?: string;
    /** Durable compaction ids of the blocks distilled into this one. */
    readonly parentBlockIds?: readonly string[];
    /**
     * The kernel block's direct message ids (raw CoreMessage ids) at creation —
     * recorded so a restarted engine rehydrates the SAME coverage (a tier-2
     * block's coverage is its parents' originals, not the checkpoint node).
     */
    readonly directMessageIds?: readonly string[];
    /** The kernel block's effective message ids (raw CoreMessage ids) at creation. */
    readonly effectiveMessageIds?: readonly string[];
}
type CompactionSummaryData = SessionEventMap['compaction/summary'];
/** Read a `compaction/summary` event's data including the ACP tier extension fields. */
export declare function readCompactionSummary(event: SessionEvent): CompactionSummaryData & AcpCompactionSummaryFields;
/**
 * Run one durable compression transaction. Throws on invalid state; on success
 * the four events are in the log and the surface has one summary node.
 */
export declare function runCompactionTransaction(session: Session, input: CompactionTransactionInput): {
    compactionId: string;
    seqs: number[];
};
/** Rebuild the block ledger from the durable log (no kernel state needed). */
export declare function rebuildBlockLedger(events: readonly SessionEvent[]): AcpBlockLedgerEntry[];
/** One self-computed compressible span of the current surface. */
export interface SeqCompressibleRange {
    readonly start: number;
    readonly end: number;
    readonly count: number;
    readonly tokens: number;
}
/**
 * Compute compressible spans directly from the surface — independent of the
 * kernel's ref map, which can drift after surface replacements in long
 * sessions and hide large tool results from the nudge range table. Skips the
 * recent protected tail, the last user message, and compaction checkpoints;
 * edges are then balanced through resolveSurfaceRange. Ranges are ordered by
 * size (largest reclaimed first).
 */
export declare function buildCompressibleSeqRanges(session: Session, opts?: {
    preserveRecent?: number;
}): SeqCompressibleRange[];
/**
 * A compact human-readable description of the current surface for the model:
 * node count plus the first/last message seqs. Surface seqs are sparse (the
 * event log interleaves non-message events and expanded delta batches), so a
 * model that never saw the nudge range table — e.g. low-pressure sessions
 * where no nudge fires — cannot guess its own seq space. acp_status and the
 * nudge's range table both surface this so compress edges can be located
 * without blind probing.
 */
export declare function surfaceSummary(session: Session): string;
/** One block as seen by the tier machinery: durable id ↔ kernel ref (`bN`). */
export interface AcpBlockRegistryEntry {
    /** The durable compaction id. */
    readonly blockId: string;
    /** The acp-kernel block ref (`bN`); synthesised by log order for legacy blocks. */
    readonly kernelBlockId: string;
    readonly tier: 1 | 2 | 3;
    /** The surface seq of this block's checkpoint summary node (null when gone). */
    readonly summarySeq: number | null;
    /** True until a LATER block distills this one. Only active blocks are distillable. */
    readonly active: boolean;
    readonly parentBlockIds: readonly string[];
}
/**
 * Rebuild the compactionId ↔ kernel-block-ref registry from the durable log.
 * Legacy blocks (pre-tier, no recorded `kernelBlockId`) are synthesised as
 * `b1`, `b2`, … in log order; recorded ids are kept as-is. A block is active
 * until a later block lists it as a parent.
 */
export declare function blockRegistry(session: Session): AcpBlockRegistryEntry[];
/**
 * The kernel block ref (`bN`) for a surface seq, when that seq is the
 * checkpoint summary node of a block — the edge the model must use to
 * distill (T2/T3). Active blocks distill; a stale (already-distilled) node
 * still maps to its `bN` so the kernel reports "already compressed" instead
 * of silently folding the summary as a plain message. Returns null for
 * anything else (plain messages, non-checkpoint nodes).
 */
export declare function blockRefForSummarySeq(session: Session, seq: number): string | null;
/** The durable compaction ids distilled by the given kernel block refs (`bN`). */
export declare function compactionIdsOfKernelBlocks(session: Session, kernelBlockIds: readonly string[]): string[];
/** The checkpoint summary seq of an ACTIVE kernel block (`bN`), or null. */
export declare function summarySeqOfKernelBlock(session: Session, kernelBlockId: string): number | null;
/**
 * The shadowed seqs of a block, recursing into distilled parent blocks: a
 * tier-2 block shadows its parent's checkpoint node, so recovering its
 * originals requires expanding that node into the parent block's own shadowed
 * seqs. Cycle-safe (a block can never be its own ancestor).
 */
export declare function expandShadowedSeqs(session: Session, blockId: string): number[];
export {};
