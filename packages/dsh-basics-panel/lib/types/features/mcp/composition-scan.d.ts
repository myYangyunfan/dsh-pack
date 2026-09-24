import type { Context } from '../../context-types.ts';
import type { ResolvedBasicsConfig } from '../../config.ts';
/** One `mcp-client` row found in a file (raw config stays host-side). */
export interface McpRowFile {
    rowId: string | null;
    serverName: string;
    disabled: boolean;
    config: Record<string, unknown>;
}
/** One composition file and its MCP rows. */
export interface McpSourceFile {
    scope: 'profile' | 'preset';
    scopeLabel: string;
    path: string;
    readOnly: boolean;
    rows: McpRowFile[];
}
/** Whether a plugin module specifier names the MCP client bridge. */
export declare function isMcpClientName(name: unknown): boolean;
/**
 * Extract every `mcp-client` row from a composition document (top-level YAML
 * array). Handles both preset rows (`{id, name, config}`) and patch entries
 * (`{insert: [{id, name, config}, ...]}`).
 */
export declare function collectMcpRows(text: string): McpRowFile[];
/** Discover every composition source and its MCP rows. */
export declare function scanMcpSources(ctx: Context, resolved: ResolvedBasicsConfig): Promise<McpSourceFile[]>;
