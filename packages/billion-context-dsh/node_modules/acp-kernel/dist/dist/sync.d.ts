import type { CompressionState, CoreMessage } from "./types.js";
export interface SyncResult {
    state: CompressionState;
    deactivated: string[];
}
export declare function syncBlocks(messages: CoreMessage[], state: CompressionState): SyncResult;
//# sourceMappingURL=sync.d.ts.map