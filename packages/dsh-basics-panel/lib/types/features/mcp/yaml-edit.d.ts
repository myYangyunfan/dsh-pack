/**
 * Flip one row's `disabled` flag in a composition document. `disabled === true`
 * adds the flag; `false` removes it (the Loader default). Returns the edited
 * text, or the original text with `ok: false` when the row or document is
 * unparsable/unfound.
 */
export declare function setRowDisabled(text: string, target: {
    rowId?: string | null;
    serverName: string;
}, disabled: boolean): {
    ok: boolean;
    text: string;
};
/** Editable fields on one MCP row's `config` mapping (null deletes the field). */
export interface RowConfigPatch {
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
/**
 * Update one row's `config` mapping in place. A null/absent patch value is
 * skipped; an explicit null deletes the key. Values are converted through the
 * document's node factory so nested objects/arrays serialize correctly.
 */
export declare function setRowConfig(text: string, target: {
    rowId?: string | null;
    serverName: string;
}, patch: RowConfigPatch): {
    ok: boolean;
    text: string;
};
/** One new `mcp-client` row to append to a composition document. */
export interface McpNewRow {
    id: string;
    name: string;
    config: Record<string, unknown>;
}
/**
 * Append a new `mcp-client` row to a composition document. The row lands
 * inside an existing top-level `insert` list when one is present, otherwise a
 * fresh `insert` block is created; an empty document is seeded with a fresh
 * `insert` block. Returns the edited text, or the original text with
 * `ok: false` when the document shape is unsupported.
 */
export declare function addRow(text: string, row: McpNewRow): {
    ok: boolean;
    text: string;
};
