/**
 * OPTIONAL semantic search algorithm (embedding-based).
 *
 * NOT registered by default — acp-kernel stays zero-runtime-deps. This is a
 * reference implementation showing how a host plugs in a heavyweight
 * semantic retriever. It catches the queries lexical algorithms cannot:
 * synonyms (login↔登录), cross-language (cache↔缓存), and paraphrase.
 *
 * score() returns a Promise, so use it via searchBlocksAsync():
 *
 *   import { registerSearchAlgorithm, searchBlocksAsync } from "acp-kernel";
 *   import { createSemanticAlgorithm } from "acp-kernel/search/algorithms/semantic";
 *
 *   registerSearchAlgorithm(createSemanticAlgorithm({
 *     embed: async (texts) => embeddingApi.embed(texts),  // → number[][]
 *   }));
 *
 *   const results = await searchBlocksAsync(state, "credentials", { algorithm: "semantic" });
 *
 * The `embed` function is host-supplied — pick any backend:
 *   - @huggingface/transformers (local, ~25MB model, offline, ~25ms/query)
 *   - OpenAI / Voyage / Cohere embeddings API (remote, needs key)
 *   - a local inference server
 *
 * Embeddings are memoized by content hash: docs only re-embed when their
 * summary changes. The query embeds fresh each call.
 */
import type { AsyncSearchAlgorithm } from "../types.js";
export interface EmbedFn {
    (texts: string[]): Promise<number[][]>;
}
export interface SemanticOptions {
    embed: EmbedFn;
    name?: string;
}
export declare function createSemanticAlgorithm(opts: SemanticOptions): AsyncSearchAlgorithm;
//# sourceMappingURL=semantic.d.ts.map