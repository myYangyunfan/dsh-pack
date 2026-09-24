/**
 * 「按变更查看 diff」的引擎与工具（0.6.3 起随包交付）。
 *
 * 引擎三个函数（splitLines / diffRows / diffStats）与 dsh-client-file-changes 的
 * 「文件」视图是**同一份语义**：那边的 bundle 里就是这套实现。这里做同仓源码复制，
 * 是为了让编辑器里的历史面板和「文件」视图给出完全一致的 ± 判定——两边各写一套
 * diff 必然漂移。时间与文案工具是本面板自己加的。
 *
 * 纯函数、不碰 DOM、不碰 React：Node 测试可以直接跑
 * （scripts/test/unit-better-sidebar-editor-diff.test.js 从 file-changes 的真源码
 * 抽取同一批函数做行为对照，并断言本文件被打进了 editor chunk）。
 */

/** One row of the three-category line diff. */
export type DiffRowKind = 'ctx' | 'add' | 'del' | 'mod'

/** A diff row: `kind` decides both the prompt glyph and the colour class. */
export interface DiffRow {
  kind: DiffRowKind
  text: string
}

/** Split into lines; null/undefined read as empty, and empty text has no lines. */
export function splitLines(text: string | null | undefined): string[] {
  const v = String(text == null ? '' : text)
  return v === '' ? [] : v.split('\n')
}

/**
 * Three-category line diff: trim the common prefix and suffix, keep up to 3 context
 * lines on each side, pair the middle run as `mod` (old line first, then new), and
 * leave the unpaired tail as `del` / `add`.
 */
export function diffRows(
  oldText: string | null | undefined,
  newText: string | null | undefined,
): DiffRow[] {
  const a = splitLines(oldText)
  const b = splitLines(newText)
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  let sa = a.length
  let sb = b.length
  while (sa > p && sb > p && a[sa - 1] === b[sb - 1]) { sa--; sb-- }
  const rows: DiffRow[] = []
  for (let i = Math.max(0, p - 3); i < p; i++) rows.push({ kind: 'ctx', text: a[i]! })
  const removed = a.slice(p, sa)
  const added = b.slice(p, sb)
  const m = Math.min(removed.length, added.length)
  for (let i = 0; i < m; i++) rows.push({ kind: 'mod', text: removed[i]! })
  for (let i = 0; i < m; i++) rows.push({ kind: 'mod', text: added[i]! })
  for (let i = m; i < removed.length; i++) rows.push({ kind: 'del', text: removed[i]! })
  for (let i = m; i < added.length; i++) rows.push({ kind: 'add', text: added[i]! })
  for (let i = sb; i < Math.min(sb + 3, b.length); i++) rows.push({ kind: 'ctx', text: b[i]! })
  return rows
}

/**
 * Counts for a group header. A `mod` pair is two rows but ONE change: `mod` reports
 * pairs, and `added` / `removed` fold the pairs back in so the header's +n −n matches
 * what the eye counts in the expanded lines.
 */
export function diffStats(rows: readonly DiffRow[]): {
  add: number
  del: number
  mod: number
  added: number
  removed: number
} {
  let add = 0
  let del = 0
  let mod = 0
  for (const r of rows) {
    if (r.kind === 'add') add++
    else if (r.kind === 'del') del++
    else if (r.kind === 'mod') mod++
  }
  const pairs = mod / 2
  return { add, del, mod: pairs, added: add + pairs, removed: del + pairs }
}

/** HH:MM in local time — the history row's right column. */
export function formatHistTime(ms: number): string {
  const d = new Date(ms)
  const p2 = (n: number): string => String(n).padStart(2, '0')
  return p2(d.getHours()) + ':' + p2(d.getMinutes())
}

/** The history row's operation badge; an unknown op falls back to its raw value. */
export const HIST_OP_LABEL: Readonly<Record<string, string>> = {
  create: '新建',
  edit: '修改',
  delete: '删除',
}
