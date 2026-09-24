/**
 * Inline agent-diff highlight for the sidebar editor (K28).
 *
 * Reads the session-scoped agent changes published by dsh-client-file-changes
 * on `window.__dshFileChanges` (see that plugin's client bundle) and returns
 * the per-line highlight for one file. The heavy lifting — the three-category
 * line diff (green add / red delete / yellow modify) and the path-indexed
 * query — lives in dsh-client-file-changes; this module only bridges the
 * window global into the CodeMirror editor, so the two plugins share data
 * with zero host-service coupling and zero projection duplication.
 *
 * Everything here is DOM-free/CodeMirror-free except `ensureDiffHighlightCss`,
 * so the query face can be exercised in a Node test without a browser.
 */

/** A file's resolved inline highlight (`present` = this path had agent changes). */
export interface FileHighlight {
  present: boolean
  op?: string
  seq?: number
  time?: number
  path?: string
  count?: number
  /** 'ctx' | 'add' | 'mod', aligned one-to-one with the current file's lines. */
  kinds?: Array<'ctx' | 'add' | 'mod'>
  /** Counts of outright deleted / added / changed lines (red / green / yellow). */
  removed?: number
  added?: number
  changed?: number
}

/** The window-global store shape published by dsh-client-file-changes. */
export interface FileChangesStore {
  queryFileHighlight(sessionId: string, path: string): FileHighlight | { present: false }
  /** Every recorded change of one path, oldest first (the history panel reverses it). */
  queryFileChanges(sessionId: string, path: string): FileChangeEntry[]
  subscribe(fn: () => void): () => void
  get(sessionId: string): { changes: Array<unknown>; truncated: boolean }
}

/** One recorded change of a path, as dsh-client-file-changes stores it. */
export interface FileChangeEntry {
  /** 'create' | 'edit' | 'delete'; an unknown value is shown verbatim. */
  op: string
  /** The path's text before this change (empty for a creation). */
  oldText: string
  /** The path's text after this change (empty for a deletion). */
  newText: string
  /** Monotonic per-session sequence; the history panel numbers rows by it. */
  seq: number
  /** Wall-clock ms of the change. */
  time: number
}

/** Read the store singleton (null when dsh-client-file-changes is absent). */
export function readFileChangesStore(): FileChangesStore | null {
  if (typeof window === 'undefined') return null
  const store = (window as unknown as { __dshFileChanges?: FileChangesStore }).__dshFileChanges
  return store !== null && typeof store === 'object' && typeof store.queryFileHighlight === 'function'
    ? store
    : null
}

/** Resolve the inline highlight for one session + path (null when no store or no changes). */
export function readFileHighlight(sessionId: string, path: string): FileHighlight | null {
  const store = readFileChangesStore()
  if (store === null) return null
  try {
    const result = store.queryFileHighlight(sessionId, path)
    return result !== null && typeof result === 'object' && (result as FileHighlight).present === true
      ? (result as FileHighlight)
      : null
  } catch {
    return null
  }
}

/** Raw CSS class suffix for a highlight kind (only add/mod are rendered). */
export function highlightKindClass(kind: 'add' | 'mod'): string {
  return kind === 'add' ? 'dsh-editor-diff-add' : 'dsh-editor-diff-mod'
}

const HIGHLIGHT_CSS_TAG = '@deepseek-ai/dsh-better-sidebar/editor-diff-highlight.css'

/**
 * Inject the line-decoration classes and the diff-history panel's stylesheet once
 * (idempotent, DSH color tokens). CodeMirror line decorations and the panel's
 * `dsh-eh-*` rows use raw class names (not the CSS-module hash), so both live in
 * one dedicated style tag rather than sidebar.module.css.
 */
export function ensureDiffHighlightCss(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(HIGHLIGHT_CSS_TAG)}]`)) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-better-sidebar'
  tag.dataset.pluginCss = HIGHLIGHT_CSS_TAG
  tag.textContent = [
    '.dsh-editor-diff-add{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);box-shadow:inset 3px 0 0 var(--dsw-alias-state-success-primary)}',
    '.dsh-editor-diff-mod{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent);box-shadow:inset 3px 0 0 var(--dsw-alias-state-warn-primary)}',
    // 「按变更查看 diff」历史面板：+绿 / −红 / ±黄 / ctx 灰，全部走 DSH 色令牌。
    '.dsh-eh-root{border-top:1px solid var(--dsw-alias-border-l1);max-height:46%;overflow-y:auto;font-family:var(--ds-font-family-code,Consolas,monospace);font-size:11.5px}',
    '.dsh-eh-head{display:flex;align-items:center;gap:8px;padding:6px 10px;position:sticky;top:0;background:var(--dsw-alias-bg-layer-2);z-index:1}',
    '.dsh-eh-title{font-weight:600;font-size:11px;color:var(--dsw-alias-label-secondary);flex:1}',
    '.dsh-eh-close{border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:13px;padding:0 2px}',
    '.dsh-eh-empty{padding:8px 10px;color:var(--dsw-alias-label-tertiary);font-size:11px;border-top:1px solid var(--dsw-alias-border-l1)}',
    '.dsh-eh-item{border-bottom:1px solid var(--dsw-alias-border-l1)}',
    '.dsh-eh-row{display:flex;align-items:center;gap:8px;padding:4px 10px;cursor:pointer}',
    '.dsh-eh-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
    '.dsh-eh-toggle{width:10px;color:var(--dsw-alias-label-tertiary)}',
    '.dsh-eh-seq{color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums}',
    '.dsh-eh-badge{font-size:10px;padding:0 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}',
    '.dsh-eh-time{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
    '.dsh-eh-stats{margin-left:auto;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
    '.dsh-eh-lines{padding:2px 0 6px;background:var(--dsw-alias-bg-base)}',
    '.dsh-eh-line{white-space:pre-wrap;word-break:break-all;padding:0 10px;line-height:16px}',
    '.dsh-eh-add{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);color:var(--dsw-alias-state-success-primary)}',
    '.dsh-eh-del{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary)}',
    '.dsh-eh-mod{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent);color:var(--dsw-alias-state-warn-primary)}',
    '.dsh-eh-ctx{color:var(--dsw-alias-label-tertiary)}',
  ].join('')
  document.head.appendChild(tag)
}
