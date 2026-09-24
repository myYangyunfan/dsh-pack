/**
 * Browser-trust fence for the /basics routes, behaviorally identical to the
 * /api gateway's fence (copied from the public DSH-better-sidebar reference,
 * which is BSD-3-Clause). Host-header loopback or a configured trusted
 * authority passes; cross-site browser markers refuse. This is a DNS-rebinding
 * / cross-site defense, not authentication.
 */
import type { IncomingHttpHeaders } from 'node:http';
/** The request facts the fence reads (structural subset of IncomingMessage). */
interface ApiTrustRequest {
    headers: IncomingHttpHeaders;
}
/** Whether a normalized URL hostname names the local loopback authority. */
export declare function isLoopbackHostname(hostname: string): boolean;
/**
 * Decide whether one request may reach the plugin routes.
 * @param request - node HTTP request facts (headers).
 * @param trustedHosts - non-loopback authorities this deployment serves.
 * @returns true when the Host is ours (loopback or trusted) and browser markers are same-origin.
 */
export declare function isTrustedApiRequest(request: ApiTrustRequest, trustedHosts: readonly string[]): boolean;
export {};
