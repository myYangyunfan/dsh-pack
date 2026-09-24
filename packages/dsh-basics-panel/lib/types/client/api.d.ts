/**
 * Typed fetch wrapper over the /basics JSON API. Every call posts to
 * `/basics/api/<method>`. Skill methods carry the current session id and cwd
 * (the host prefers its attached session header and uses the summary cwd only
 * while the session is still hydrating). Failures surface as
 * {@link BasicsApiError} with the wire code.
 */
import type { Context } from '../context-types.ts';
export declare class BasicsApiError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** The current session id and cwd read from the client sessions feed. */
export interface SessionRef {
    sessionId: string;
    cwd?: string;
}
/** Read the current session ref for skill scoping. */
export declare function currentSession(ctx: Context): SessionRef;
export interface SkillRow {
    name: string;
    description: string;
    whenToUse?: string;
    modelInvocable: boolean;
    userInvocable: boolean;
    source: string;
    provider: string;
    location?: string;
    editable: boolean;
}
export interface SkillGroup {
    scope: 'project' | 'custom' | 'user' | 'bundled' | 'runtime' | 'other';
    skills: SkillRow[];
}
export interface SkillsList {
    groups: SkillGroup[];
    complete: boolean;
}
export interface SkillDetail {
    name: string;
    description: string;
    whenToUse?: string;
    metadata?: Record<string, unknown>;
    modelInvocable: boolean;
    userInvocable: boolean;
    body: string;
    path?: string;
    source: string;
    provider: string;
    editable: boolean;
    mtime?: number;
}
export interface SkillEdit {
    description: string;
    whenToUse?: string | null;
    metadata?: Record<string, unknown> | null;
    modelInvocable: boolean;
    userInvocable: boolean;
    body: string;
}
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
export interface McpGroup {
    scope: 'profile' | 'preset';
    scopeLabel: string;
    path: string;
    readOnly: boolean;
    servers: McpServerRow[];
}
export interface McpConfigPatch {
    serverName?: string;
    transport?: string;
    command?: string | null;
    args?: string[] | null;
    env?: Record<string, string> | null;
    url?: string | null;
    headers?: Record<string, string> | null;
    cwd?: string | null;
    toolCallTimeoutMs?: number | null;
}
/** Fields the client sends to create a brand-new MCP server. */
export interface McpCreateConfig {
    serverName: string;
    transport: 'stdio' | 'streamable-http';
    command?: string | null;
    args?: string[] | null;
    env?: Record<string, string> | null;
    url?: string | null;
    cwd?: string | null;
    toolCallTimeoutMs?: number | null;
}
export interface McpList {
    groups: McpGroup[];
}
export interface RuleRow {
    key: string;
    scope: 'global' | 'project';
    fileName: string;
    displayPath: string;
    directory: string;
    size?: number;
    mtime?: number;
    editable: boolean;
}
export interface RuleGroup {
    scope: 'global' | 'project';
    rules: RuleRow[];
}
export interface RulesList {
    groups: RuleGroup[];
    cwd: string;
    projectRoot: string;
}
export interface RuleDetail {
    key: string;
    scope: 'global' | 'project';
    fileName: string;
    displayPath: string;
    content: string;
    mtime?: number;
    editable: boolean;
}
export type RuleCreateScope = 'global' | 'project' | 'cwd';
export declare const api: {
    skillsList(ref: SessionRef): Promise<SkillsList>;
    skillsGet(ref: SessionRef, name: string): Promise<SkillDetail>;
    skillsSave(ref: SessionRef, name: string, expectedMtime: number | undefined, edit: SkillEdit): Promise<{
        ok: true;
        mtime?: number;
    }>;
    mcpList(): Promise<McpList>;
    mcpSetEnabled(path: string, rowId: string | null, serverName: string, enabled: boolean): Promise<{
        ok: true;
        disabled: boolean;
        takesEffect: "live" | "new-session";
    }>;
    mcpSave(path: string, rowId: string | null, serverName: string, patch: McpConfigPatch): Promise<{
        ok: true;
    }>;
    mcpCreate(path: string | null, config: McpCreateConfig): Promise<{
        ok: true;
        serverName: string;
        path: string;
    }>;
    rulesList(ref: SessionRef): Promise<RulesList>;
    rulesGet(ref: SessionRef, key: string): Promise<RuleDetail>;
    rulesSave(ref: SessionRef, key: string, expectedMtime: number | undefined, content: string): Promise<{
        ok: true;
        mtime?: number;
    }>;
    rulesCreate(ref: SessionRef, scope: RuleCreateScope, fileName: string): Promise<{
        ok: true;
        key: string;
        scope: "global" | "project";
        fileName: string;
        displayPath: string;
        mtime?: number;
    }>;
};
