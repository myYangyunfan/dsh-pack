/**
 * Lightweight English stemmer (suffix stripping, Porter-inspired).
 * Zero dependencies. Good enough for IR morphology normalization:
 *   tokens → token, running → runn, compressed → compress,
 *   authentication → authentic, handling → handl, subagents → subagent
 *
 * Not a full Porter stemmer — intentionally simpler and faster. CJK is
 * untouched (handled by bigram tokenization, not stemming).
 */
export declare function stem(word: string): string;
//# sourceMappingURL=stemmer.d.ts.map