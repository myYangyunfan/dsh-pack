import type { CompressionState, CoreMessage } from "./types.js";
export interface StatusReportOptions {
    scope?: "compressed" | "uncompressed";
    view?: "ranges" | "messages";
    tool?: string;
    sort?: "size" | "time" | "tool" | "age";
    limit?: number;
}
export declare function buildStatusReport(state: CompressionState, messages: CoreMessage[], countTokens: (t: string) => number, options?: StatusReportOptions): string;
export declare function buildRecap(state: CompressionState, blockId?: string): string;
//# sourceMappingURL=report.d.ts.map