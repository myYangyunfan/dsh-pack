import type { CoreMessage, MessageRefMap } from "./types.js";
export declare const BLOCKED_REF = "BLOCKED";
export declare function emptyRefMap(): MessageRefMap;
export declare function indexToRef(index: number): string;
export declare function refToIndex(ref: string): number | null;
export declare function refForRaw(map: MessageRefMap, rawId: string): string | null;
export declare function rawForRef(map: MessageRefMap, ref: string): string | null;
export interface AssignRefsResult {
    map: MessageRefMap;
    nextIndex: number;
    newlyAssigned: number;
}
export interface AssignRefsOptions {
    existing: MessageRefMap;
    nextIndex: number;
    isProtected?: (message: CoreMessage) => boolean;
    shouldSkip?: (message: CoreMessage) => boolean;
}
export declare function assignRefs(messages: CoreMessage[], options: AssignRefsOptions): AssignRefsResult;
export declare function rebuildRefIndex(map: MessageRefMap): MessageRefMap;
export declare function highestUsedIndex(map: MessageRefMap): number;
//# sourceMappingURL=refs.d.ts.map