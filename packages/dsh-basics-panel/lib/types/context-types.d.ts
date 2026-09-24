/**
 * Structural types for the cordis services this plugin consumes, plus the
 * Context augmentation both halves share. A third-party plugin resolves
 * outside the DSH monorepo's single cordis instance, so the upstream
 * `declare module 'cordis'` augmentations do not reach this Context — and the
 * npm cordis package does not declare the DSH-vendored runtime members
 * (`ctx.effect`, service properties). The members below mirror the actual
 * runtime shapes this plugin touches:
 * - webServer: @deepseek-ai/dsh-host-webserver (the WebServer)
 * - sessions: host side @deepseek-ai/dsh-session (SessionStore), client side
 *   the runtime ISessions list feed
 * - webRuntime: @deepseek-ai/dsh-web-app (bind-derived trusted hosts)
 * - skills: @deepseek-ai/dsh-skill (the layered skill registry)
 * - tools: @deepseek-ai/dsh-tools (ToolRuntime; `schemas()` for MCP status)
 * - loader: @deepseek-ai/cordis-plugin-loader (mounted entry tree)
 * - agentPresets: @deepseek-ai/dsh-agent-presets (optional roster)
 * - slots: the client runtime SlotRegistry
 * - locale: the client runtime locale service
 * Drift from upstream is contained to this file.
 *
 * This file must stay FREE of Node.js types (`node:http`, `node:stream`,
 * `Buffer`): it is part of the CLIENT-reachable declaration graph, so a Node
 * import here would leak into browser-only consumer builds.
 */
import type { Context } from 'cordis';
/** The request face route handlers see (structural subset of node's IncomingMessage). */
export interface BasicsHttpRequest {
    url?: string;
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    [Symbol.asyncIterator](): AsyncIterator<string | Uint8Array>;
}
/** The response face route handlers write to (structural subset of node's ServerResponse). */
export interface BasicsHttpResponse {
    statusCode: number;
    writeHead(status: number, headers?: Record<string, string>): void;
    end(body?: string | Uint8Array): void;
}
/** One named webserver route (mirror of the host-webserver WebRoute). */
export interface BasicsWebRoute {
    kind: 'exact' | 'prefix';
    path: string;
    handler: (req: BasicsHttpRequest, res: BasicsHttpResponse) => void | Promise<void>;
}
/** The webServer service face this plugin uses. */
export interface BasicsWebServer {
    register(route: BasicsWebRoute): () => void;
}
/** The web runtime service face: the bind-derived trust list for the browser fence. */
export interface BasicsWebRuntime {
    trustedHosts: readonly string[];
}
/** A published session's header slice the host reads (authoritative cwd). */
export interface BasicsSessionHeader {
    cwd?: string;
}
/** The host session store face (`ctx.sessions.get(id)` returns the live session). */
export interface BasicsSessionStore {
    get(id: string): {
        header: BasicsSessionHeader;
    } | undefined;
}
/** One skill's invocation policy (mirror of dsh-skill's resolved invocation). */
export interface SkillInvocation {
    modelInvocable: boolean;
    userInvocable: boolean;
}
/** A winning skill summary (mirror of dsh-skill's `toSummary`). */
export interface SkillSummary {
    name: string;
    description: string;
    whenToUse?: string;
    invocation: SkillInvocation;
    source: string;
    provider: string;
    resourceBase?: {
        kind: string;
        path?: string;
        url?: string;
        description?: string;
    };
}
/** A full loaded skill (mirror of dsh-skill's definition). */
export interface SkillDefinition extends SkillSummary {
    content: string;
    path?: string;
    metadata?: Record<string, unknown>;
}
/** The `ctx.skills` face this plugin uses. */
export interface BasicsSkillRegistry {
    snapshot(options?: {
        cwd?: string;
        scope?: ScopeKey;
    }): Promise<{
        skills: SkillSummary[];
        complete: boolean;
    }>;
    get(name: string, options?: {
        cwd?: string;
        scope?: ScopeKey;
    }): Promise<SkillDefinition | undefined>;
}
/** One visible tool schema (mirror of dsh-tools' `schemas()` row). */
export interface VisibleToolSchema {
    name: string;
    description?: string;
}
/** The `ctx.tools` face this plugin uses. */
export interface BasicsToolRuntime {
    schemas(): VisibleToolSchema[];
}
/** One loader entry option slice (mirror of cordis-plugin-loader EntryOptions). */
export interface LoaderEntryOptions {
    id: string;
    name: string;
    config?: Record<string, unknown>;
    disabled?: boolean | null;
    inject?: unknown;
    group?: boolean | null;
}
/** One mounted loader entry (mirror of cordis-plugin-loader Entry). */
export interface LoaderEntry {
    id: string;
    options: LoaderEntryOptions;
    /** Effective disabled state (self or an owning parent entry). */
    disabled: boolean;
}
/** The `ctx.loader` face this plugin uses (the mounted entry tree). */
export interface BasicsLoader {
    entries(): Iterable<LoaderEntry>;
}
/** One agent-preset roster row (mirror of dsh-agent-presets' list()). */
export interface AgentPresetRow {
    id: string;
    trust: 'system' | 'user' | string;
    path: string;
    name?: string;
    description?: string;
}
/** The optional `ctx.agentPresets` roster face. */
export interface BasicsAgentPresets {
    list(): Promise<AgentPresetRow[]>;
}
/** An opaque agent scope key (the live Agent object doubles as its scope key). */
export type ScopeKey = object;
/** The optional `ctx.agents` face: the live Agent registry; `get()` returns the Agent (its scope key). */
export interface BasicsAgents {
    get(id: string): object | undefined;
}
/** Registration options the client passes to `ctx.slots.register` (subset). */
export interface BasicsSlotRegisterOptions {
    name: string;
    id?: string;
    order?: number;
    label?: string | (() => string);
    inject?: (...args: any[]) => Record<string, unknown>;
}
/** The client slots service face. */
export interface BasicsSlotsService {
    register(options: BasicsSlotRegisterOptions, component: unknown): () => void;
    /** Run a callback for each declaration lifetime of a slot (no-op while undeclared). */
    inject(key: string, callback: () => () => void): () => void;
}
/** One client session list row (cwd for skill scoping). */
export interface BasicsSessionSummary {
    id: string;
    cwd?: string;
    displayTitle: string;
}
/** The client session list snapshot. */
export interface BasicsSessionList {
    current: string | undefined;
    byId: Record<string, BasicsSessionSummary>;
}
/** The client sessions service face (only the list feed is needed). */
export interface BasicsSessionsService {
    list: {
        getSnapshot(): BasicsSessionList;
        subscribe(fn: () => void): () => void;
    };
}
/** The client locale service face. */
export interface BasicsLocaleService {
    getSnapshot(): {
        active: string;
    };
    subscribe(fn: () => void): () => void;
    register(ns: string, locale: string, dict: Record<string, string>): () => void;
}
declare module 'cordis' {
    interface Context {
        webServer: BasicsWebServer;
        sessions: BasicsSessionStore & BasicsSessionsService;
        webRuntime: BasicsWebRuntime;
        skills: BasicsSkillRegistry;
        tools: BasicsToolRuntime;
        loader: BasicsLoader;
        /** The agent-preset roster (host side); optional — presets degrade to a directory scan. */
        agentPresets?: BasicsAgentPresets;
        /** The live agent registry (host side); resolves a session's Agent (scope key) for skill reads. */
        agents?: BasicsAgents;
        /** The client slot registry (client side). */
        slots: BasicsSlotsService;
        /** The client locale service (client side). */
        locale: BasicsLocaleService;
        /** Register a lifecycle callback (DSH-vendored cordis). */
        effect(fn: () => void | (() => void), label?: string): void;
    }
}
export type { Context };
