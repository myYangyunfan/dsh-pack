/**
 * Algorithm registry. Builtins are pre-registered; hosts may register
 * additional algorithms (e.g. an embedding-based semantic provider) via
 * registerSearchAlgorithm and reference them by name in SearchOptions.
 */
import type { AnySearchAlgorithm } from "./types.js";
export declare function registerSearchAlgorithm(algo: AnySearchAlgorithm): void;
export declare function getSearchAlgorithm(name: string): AnySearchAlgorithm | undefined;
export declare function listSearchAlgorithms(): AnySearchAlgorithm[];
//# sourceMappingURL=registry.d.ts.map