/** The fixed user-global rule file name (mirror of dsh-agent-instructions' USER_GLOBAL_FILE). */
export declare const RULES_GLOBAL_FILE = "AGENTS.md";
/** Ordered base candidates per directory (highest precedence first). */
export declare const RULES_BASE_CANDIDATES: string[];
/** Ordered local-overlay candidates per directory (loaded after the base files). */
export declare const RULES_LOCAL_CANDIDATES: string[];
/** Every candidate file the panel may create. */
export declare const RULES_ALL_CANDIDATES: string[];
/** Directory entries that identify the project root while walking upward. */
export declare const RULES_ROOT_MARKERS: string[];
/** A rule file's scope group. */
export type RuleScope = 'global' | 'project';
/** A discovered rule file (path facts only, no content). */
export interface RuleFile {
    scope: RuleScope;
    /** The file name within its directory (e.g. AGENTS.md). */
    fileName: string;
    /** Absolute path on disk. */
    absolutePath: string;
    /** User-facing path (e.g. ~/.dsh/AGENTS.md, or project-root-relative). */
    displayPath: string;
    /** The directory that holds the file. */
    directory: string;
}
/** Probe whether a path exists on the host filesystem. */
export declare function fileExists(path: string): Promise<boolean>;
/**
 * Walk upward from `cwd` to the first directory containing a root marker.
 * @returns the discovered project root, or `cwd` itself when no marker exists.
 */
export declare function findProjectRoot(cwd: string, markers?: readonly string[], exists?: (path: string) => Promise<boolean>): Promise<string>;
/**
 * Build the inclusive root-to-cwd directory chain.
 * @param root - project root directory.
 * @param cwd - most-specific directory in the chain.
 * @returns directories ordered from broadest (root) to most specific (cwd).
 */
export declare function ancestorChain(root: string, cwd: string): string[];
/**
 * Discover every existing rule file for a session cwd: the user-global file
 * first, then the root-to-cwd chain candidates.
 * @param options - cwd, harness home, display form of the home (e.g. `~/.dsh`), probe.
 * @returns discovered files in precedence order (global first, then broadest→most specific).
 */
export declare function discoverRuleFiles(options: {
    cwd: string;
    dshHome: string;
    /** Display form of the harness home (e.g. `~/.dsh`); defaults to the raw home. */
    displayHome?: string;
    /** Pre-resolved project root (skips the upward marker walk). */
    projectRoot?: string;
    exists?: (path: string) => Promise<boolean>;
}): Promise<RuleFile[]>;
/** Where a new rule file may be created. */
export type RuleCreateScope = 'global' | 'project' | 'cwd';
/** The resolved target of a create request. */
export interface RuleCreateTarget {
    scope: RuleScope;
    fileName: string;
    absolutePath: string;
    displayPath: string;
    directory: string;
}
/**
 * Resolve the target path of a create request against the allowlist.
 * @returns the resolved target, or undefined when the scope/file combo is not allowed.
 *   - `global` allows only AGENTS.md under the harness home;
 *   - `project` places the file at the project root;
 *   - `cwd` places the file at the current working directory.
 */
export declare function createRulePath(options: {
    cwd: string;
    dshHome: string;
    displayHome?: string;
    scope: RuleCreateScope;
    fileName: string;
    exists?: (path: string) => Promise<boolean>;
}): Promise<RuleCreateTarget | undefined>;
/** The starter content written for a newly created rule file. */
export declare function ruleTemplate(fileName: string): string;
