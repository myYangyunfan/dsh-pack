/**
 * Client half of dsh-basics-panel: registers the zh/en dictionaries into the
 * DSH locale registry and contributes the "基础能力" section to the DSH
 * Settings shell through `settings.section`. The section registration rides
 * `ctx.slots.inject` so it waits for the settings shell to declare the slot;
 * the panel content itself renders the feature registry (tab bar).
 */
import type { Context } from '../context-types.ts';
/** Services required before mounting (provided by the client runtime). */
export declare const inject: string[];
/**
 * Client plugin body.
 * @param ctx - the client cordis context (slots, sessions, locale).
 */
export declare function apply(ctx: Context): void;
