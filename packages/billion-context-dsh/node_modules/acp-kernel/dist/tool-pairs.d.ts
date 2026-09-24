import type { CoreMessage } from "./types.js";
/**
 * Adjust compression range boundaries to include tool-call/result pairs.
 *
 * PREVENTIVE approach (adapted from opencode-acp PR #248): before compression
 * is applied, scan for tool-call or tool-result messages whose matching half
 * (the result for a call in range, or the call for a result in range) sits
 * outside the requested range. Pull the orphan half INTO the range so the
 * pair is compressed together — zero information loss.
 *
 * Only MESSAGE-boundary ranges are adjusted. Block-boundary ranges (bN) are
 * left untouched to preserve tier-detection correctness.
 *
 * @returns Adjusted { startIndex, endIndex } — may be wider than input.
 */
export declare function adjustBoundariesForToolPairs(startIndex: number, endIndex: number, messages: CoreMessage[], maxScan?: number): {
    startIndex: number;
    endIndex: number;
};
//# sourceMappingURL=tool-pairs.d.ts.map