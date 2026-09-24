/**
 * Secret masking for MCP server config. The panel never ships a raw secret
 * across the wire: env values, header values, URL userinfo passwords, and
 * the value that follows a sensitive command-line flag are replaced with a
 * fixed marker. The host keeps the raw config in memory only.
 */
/** The display marker for a masked secret. */
export declare const MASK = "\u2022\u2022\u2022\u2022";
/** Mask every value in an env/header-style map, keeping the keys. */
export declare function maskValues(map: Record<string, string> | undefined): Record<string, string> | undefined;
/** Mask the argument that follows a sensitive flag; everything else verbatim. */
export declare function maskArgs(args: string[] | undefined): string[] | undefined;
/** Mask the password in a URL's userinfo (e.g. http://user:pass@host). */
export declare function maskUrl(url: string | undefined): string | undefined;
