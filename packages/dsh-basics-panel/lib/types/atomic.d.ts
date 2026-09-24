/** Write `content` to `path` atomically (throws a plain Error on failure). */
export declare function atomicWrite(path: string, content: string): Promise<void>;
/** Compare two absolute paths, case-insensitively on Windows. */
export declare function samePath(left: string, right: string): boolean;
