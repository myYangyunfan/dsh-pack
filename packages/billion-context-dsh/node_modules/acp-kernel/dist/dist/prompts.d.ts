/**
 * Overridable prompt text consumed by the kernel's nudge renderer and, via the
 * adapter, the system prompt. Every field here is LOAD-BEARING: these rules
 * were tuned over months of production use and are quality-critical. Overriding
 * them can degrade summary quality (loss of paths / signatures / decisions →
 * broken retrieval), so {@link resolvePrompts} requires `{ acknowledgeRisk: true }`.
 *
 * Surface-level text (summary section headers, status-report chrome, tool
 * descriptions) is intentionally NOT part of this interface — it is owned by
 * the adapter or a later "prompt-set format" layer and is safe to customize
 * freely. See DESIGN.md for the load-bearing vs surface classification.
 */
export interface Prompts {
    /** Core compression philosophy. Embedded in the system prompt + every nudge. */
    compressPhilosophy: string;
    /** Rules the model follows when writing a tier-1 summary. */
    howToCompressRules: string;
    /** Rules for tier-2 distillation of existing summaries. */
    tier2DistillRules: string;
    /** Rules for tier-3 ultra-condensation of distilled summaries. */
    tier3CondenseRules: string;
}
/**
 * The kernel's canonical prompt values (verbatim from compression-rules.ts).
 * Frozen so a buggy caller cannot mutate the shared singleton and corrupt
 * every other consumer of {@link defaultPrompts}.
 */
export declare const defaultPrompts: Prompts;
export interface ResolvePromptsOptions {
    /**
     * Must be `true` to override any prompt field. Every {@link Prompts} field is
     * load-bearing; overriding without acknowledging the quality risk is a
     * programming error and throws.
     */
    acknowledgeRisk?: boolean;
}
/**
 * Merge prompt overrides onto the kernel defaults. All fields are load-bearing,
 * so ANY override requires `{ acknowledgeRisk: true }`.
 *
 * Only `string`-valued overrides take effect: an explicit `undefined`/`null` or
 * a wrong type is silently dropped (never clobbers a good default), so a
 * malformed partial never degrades the canonical rules. Resolve once at host
 * startup, then pass the resulting {@link Prompts} to {@link renderNudgeText}
 * and to the adapter's system-prompt composition so both layers stay consistent.
 */
export declare function resolvePrompts(overrides?: Partial<Prompts>, options?: ResolvePromptsOptions): Prompts;
//# sourceMappingURL=prompts.d.ts.map