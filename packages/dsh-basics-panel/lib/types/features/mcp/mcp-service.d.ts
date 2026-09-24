import type { FeatureContext } from '../registry.ts';
/** One masked server view shipped to the client. */
export interface McpServerRow {
    rowId: string | null;
    serverName: string;
    transport: 'stdio' | 'streamable-http' | 'unknown';
    disabled: boolean;
    editable: boolean;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    url?: string;
    headers?: Record<string, string>;
    toolCallTimeoutMs?: number;
    runtime: {
        mounted: boolean;
        toolCount: number;
    };
}
/** One scope group in the list. */
export interface McpGroup {
    scope: 'profile' | 'preset';
    scopeLabel: string;
    path: string;
    readOnly: boolean;
    servers: McpServerRow[];
}
/** Build the MCP feature API. */
export declare function registerMcp(fc: FeatureContext): Record<string, (payload: unknown) => Promise<unknown> | unknown>;
