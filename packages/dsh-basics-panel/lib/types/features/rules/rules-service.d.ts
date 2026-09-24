import type { FeatureContext } from '../registry.ts';
/** One rule row in the list. */
export interface RuleRow {
    /** Stable id (the absolute path; the host re-checks it against discovery). */
    key: string;
    scope: 'global' | 'project';
    fileName: string;
    displayPath: string;
    directory: string;
    size?: number;
    mtime?: number;
    editable: boolean;
}
/** One scope group in the list. */
export interface RuleGroup {
    scope: 'global' | 'project';
    rules: RuleRow[];
}
/** A loaded rule for the editor. */
export interface RuleDetail {
    key: string;
    scope: 'global' | 'project';
    fileName: string;
    displayPath: string;
    content: string;
    mtime?: number;
    editable: boolean;
}
/** Build the rules feature API. */
export declare function registerRules(fc: FeatureContext): Record<string, (payload: unknown) => Promise<unknown> | unknown>;
