/**
 * dsh-basics-panel host half: a single fenced /basics JSON API that merges
 * every feature backend's methods. The route passes the same browser-trust
 * fence as the /api gateway (loopback or `webRuntime.trustedHosts`), and each
 * feature re-resolves its own authorities (the skill registry for skill
 * paths, the composition scan for MCP files) so the panel never trusts a
 * client-supplied path alone.
 */
import { Config, type ResolvedBasicsConfig } from './config.ts';
import type { Context } from './context-types.ts';
export { Config };
export type { ResolvedBasicsConfig };
export type { Context };
/** Plugin identity for cordis.yml rows. */
export declare const name = "dsh-basics-panel";
/** Services required before mounting. */
export declare const inject: string[];
/**
 * Plugin body: mount the fenced routes over the merged feature APIs.
 * @param ctx - host plugin context (webServer, webRuntime, sessions, skills, tools).
 * @param config - deployment limits; the Loader validates against {@link Config}.
 */
export declare function apply(ctx: Context, config?: Partial<ResolvedBasicsConfig>): void;
