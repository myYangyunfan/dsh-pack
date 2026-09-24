import type { CompressionState, CoreMessage } from "./types.js";
export interface HideConsumedResult {
    messages: CoreMessage[];
    hidden: number;
}
export declare function hideConsumedCompressCalls(state: CompressionState, messages: CoreMessage[]): HideConsumedResult;
//# sourceMappingURL=hide-consumed.d.ts.map