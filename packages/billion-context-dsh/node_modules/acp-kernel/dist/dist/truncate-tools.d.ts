import type { Config, CoreMessage } from "./types.js";
export interface TruncateOptions {
    minOutputTokens?: number;
    keepPrefixChars?: number;
    keepSuffixChars?: number;
    protectRecentMessages?: number;
}
export interface TruncateResult {
    messages: CoreMessage[];
    truncatedCount: number;
    savedTokens: number;
}
export declare function truncateLargeToolOutputs(messages: CoreMessage[], tokenCount: number, config: Config, countTokens: (text: string) => number, options?: TruncateOptions): TruncateResult;
//# sourceMappingURL=truncate-tools.d.ts.map