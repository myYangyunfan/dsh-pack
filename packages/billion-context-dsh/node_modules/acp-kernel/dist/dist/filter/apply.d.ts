import type { CoreMessage } from "../types.js";
import type { MessageFiltersConfig } from "./types.js";
export interface ApplyResult {
    messages: CoreMessage[];
    partsFiltered: number;
    partsDropped: number;
    partsModified: number;
}
export declare function applyMessageFilters(messages: CoreMessage[], config: MessageFiltersConfig | undefined): ApplyResult;
//# sourceMappingURL=apply.d.ts.map