/**
 * M3 — the four model tools: compress / decompress / search_context /
 * acp_status, registered through `ctx.tools` (defineTool).
 *
 * compress is the heart of ACP: the model writes the summary and the tool
 * lands it as a durable surface replacement (no second LLM summarization
 * call). decompress recovers shadowed content read-only from the log (DSH
 * keeps the originals — V5). search_context scores blocks rebuilt from the
 * log. acp_status reports the block ledger and pressure.
 * @module billion-context-dsh/tools
 */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { type CompressionCore } from 'acp-kernel';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { AcpStateStore } from './state.ts';
import { type KernelConfigInput } from './config.ts';
import { type AcpWindow } from './window.ts';
import { type ResolvedPrompts } from './prompts.ts';
export interface ToolEnvironment extends KernelConfigInput {
    readonly kernel: CompressionCore;
    readonly store: AcpStateStore;
    /** Resolve the effective context window for an agent (optional: status falls back to modelContextLimit). */
    readonly windowFor?: (agent: Agent) => Promise<AcpWindow>;
    /** Resolved prompt templates (optional: falls back to DEFAULT_RESOLVED). */
    readonly prompts?: ResolvedPrompts;
}
/** Build the four ACP model tools bound to one engine. */
export declare function makeTools(env: ToolEnvironment): ToolDefinition[];
