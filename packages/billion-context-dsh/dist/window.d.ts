/**
 * Auto context-window detection — resolve the model's real context window
 * from the host LLM runtime instead of trusting a hardcoded config default.
 *
 * `agent.ctx.llm` (the cordis `LlmRuntime` service) exposes
 * `resolveModelInfo(provider, model)` → `{ context: { contextWindow } }`, the
 * exact-route capacity the adapter learned from the provider API (pi-ai reads
 * `context_window`/`context_length` during discovery). Probing is a standalone
 * capability query — no request is sent.
 * @module billion-context-dsh/window
 */
import type { Agent } from '@deepseek-ai/dsh-agent';
/** Fallback window when auto-detection is unavailable. Same default as acp-kernel's `defaultConfig`. */
export declare const DEFAULT_CONTEXT_WINDOW = 128000;
/** The effective context window plus where it came from. */
export interface AcpWindow {
    /** Effective context window in tokens. */
    readonly limit: number;
    /** Where the limit came from. */
    readonly source: 'explicit' | 'auto' | 'default';
    /** Route the auto window was resolved for (auto source only). */
    readonly provider?: string;
    readonly model?: string;
}
/** Human label for an AcpWindow's source (used by acp_status). */
export declare function windowSourceLabel(window: AcpWindow): string;
/**
 * Probe the model's real context window. Returns null when the host provides
 * no llm service, the adapter discloses no window, or the probe throws —
 * callers fall back to DEFAULT_CONTEXT_WINDOW. Never throws.
 */
export declare function detectContextWindow(agent: Agent, provider: string, model: string): Promise<number | null>;
