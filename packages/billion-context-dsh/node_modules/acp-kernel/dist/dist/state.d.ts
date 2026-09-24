import type { CompressionBlock, CompressionState } from "./types.js";
export declare function createInitialState(): CompressionState;
export declare function allocateBlockId(state: CompressionState): string;
export declare function allocateRunId(state: CompressionState): string;
export declare function blockById(state: CompressionState, blockId: string): CompressionBlock | undefined;
export declare function activeBlocks(state: CompressionState): CompressionBlock[];
export declare function coveredMessageIds(state: CompressionState): Set<string>;
export declare function highestActiveTier(state: CompressionState): 0 | 1 | 2 | 3;
export declare function advanceSurvival(state: CompressionState, promotionThreshold: number): void;
//# sourceMappingURL=state.d.ts.map