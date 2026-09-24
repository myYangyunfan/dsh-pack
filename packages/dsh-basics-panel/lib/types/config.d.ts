/**
 * Plugin configuration: the deployment-facing limits and safety switches.
 * The Loader validates `Config` (standard-schema) and fills defaults; direct
 * callers (tests) get them from `resolveBasicsConfig`.
 */
import z from '@deepseek-ai/schemastery';
/** Default cap on one skill file read into the editor (bytes). */
export declare const DEFAULT_MAX_SKILL_BYTES: number;
/** Default cap on one rule file read/written by the editor (bytes); mirrors DSH's maxSourceBytes default. */
export declare const DEFAULT_MAX_RULE_BYTES: number;
/** Default cap on one JSON request body (bytes). */
export declare const DEFAULT_MAX_BODY_BYTES: number;
/** The public config schema. */
export declare const Config: z<Schemastery.ObjectS<{
    /** Upper bound on a single skill file the editor may load (bytes). */
    maxSkillBytes: z<number, number>;
    /** Upper bound on a single rule file the editor may load or write (bytes). */
    maxRuleBytes: z<number, number>;
    /** Upper bound on a single JSON request body (bytes). */
    maxBodyBytes: z<number, number>;
    /** Additional absolute composition-file paths the panel may edit (deployment-managed). */
    extraMcpFiles: z<string[], string[]>;
    /** Force the whole panel read-only (no MCP toggle, no skill save, no rule edit). */
    readOnly: z<boolean, boolean>;
}>, Schemastery.ObjectT<{
    /** Upper bound on a single skill file the editor may load (bytes). */
    maxSkillBytes: z<number, number>;
    /** Upper bound on a single rule file the editor may load or write (bytes). */
    maxRuleBytes: z<number, number>;
    /** Upper bound on a single JSON request body (bytes). */
    maxBodyBytes: z<number, number>;
    /** Additional absolute composition-file paths the panel may edit (deployment-managed). */
    extraMcpFiles: z<string[], string[]>;
    /** Force the whole panel read-only (no MCP toggle, no skill save, no rule edit). */
    readOnly: z<boolean, boolean>;
}>>;
/** The resolved config handed to `apply`. */
export interface ResolvedBasicsConfig {
    maxSkillBytes: number;
    maxRuleBytes: number;
    maxBodyBytes: number;
    extraMcpFiles: string[];
    readOnly: boolean;
}
/** Normalize raw config (for direct callers that bypass the Loader schema). */
export declare function resolveBasicsConfig(config?: Partial<ResolvedBasicsConfig>): ResolvedBasicsConfig;
