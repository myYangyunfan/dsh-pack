/**
 * 「按变更查看 diff」历史面板：读 dsh-client-file-changes 发布的
 * `window.__dshFileChanges`（`queryFileChanges`），把一个文件的每一次变更按 seq
 * 倒序列出——组头是 #序号 / 操作 / 时间 / ±统计，点开后是带 +/−/± 提示符的行。
 *
 * 面板样式走 `dsh-eh-*` 裸类名，由 file-changes-highlight.ts 的
 * ensureDiffHighlightCss 一次性注入（和编辑器的高亮类共用同一个 style 标签）。
 *
 * 文案是字面量（面板跟着编辑器 chunk 走、不进主 bundle 的词典）：
 * scripts/test/unit-better-sidebar-editor-diff.test.js 直接断言这些字面量在产物里，
 * 改成 t('…') 会同时改掉面板可见文案与该断言。
 */
import { useEffect, useState } from 'react'
import { readFileChangesStore, type FileChangeEntry } from './file-changes-highlight.ts'
import { HIST_OP_LABEL, diffRows, diffStats, formatHistTime } from './diff-turns.ts'

/** One file's change history, newest first; collapses to a one-line empty state. */
export function DiffTurnsPanel(props: { sessionId: string; path: string; onClose: () => void }) {
  const { sessionId, path, onClose } = props
  const [items, setItems] = useState<FileChangeEntry[]>([])
  const [openIdx, setOpenIdx] = useState(-1)

  useEffect(() => {
    const store = readFileChangesStore()
    const refresh = (): void => {
      try {
        const list = store !== null && typeof store.queryFileChanges === 'function'
          ? store.queryFileChanges(sessionId, path)
          : []
        setItems(Array.isArray(list) ? list.slice().reverse() : [])
      } catch {
        setItems([])
      }
    }
    refresh()
    // The store mirrors the session's projection, so a new change re-reads the list.
    return store === null || typeof store.subscribe !== 'function'
      ? undefined
      : store.subscribe(refresh)
  }, [sessionId, path])

  if (items.length === 0) {
    return <div className="dsh-eh-empty">该文件暂无变更记录</div>
  }

  return (
    <div className="dsh-eh-root">
      <div className="dsh-eh-head">
        <span className="dsh-eh-title">按变更查看 diff</span>
        <button type="button" className="dsh-eh-close" onClick={onClose}>×</button>
      </div>
      {items.map((item, i) => {
        const rows = diffRows(item.oldText, item.op === 'delete' ? '' : item.newText)
        const st = diffStats(rows)
        const label = HIST_OP_LABEL[item.op] || item.op
        const open = openIdx === i
        return (
          <div key={i} className={'dsh-eh-item' + (open ? ' dsh-eh-open' : '')}>
            <div className="dsh-eh-row" onClick={() => { setOpenIdx(open ? -1 : i) }}>
              <span className="dsh-eh-toggle">{open ? '▾' : '▸'}</span>
              <span className="dsh-eh-seq">{'#' + (items.length - i)}</span>
              <span className="dsh-eh-badge">{label}</span>
              <span className="dsh-eh-time">{formatHistTime(item.time)}</span>
              <span className="dsh-eh-stats">{'+' + st.added + ' −' + st.removed}</span>
            </div>
            {open && (
              <div className="dsh-eh-lines">
                {rows.map((r, k) => (
                  <div
                    key={k}
                    className={'dsh-eh-line dsh-eh-' + r.kind}
                  >
                    {(r.kind === 'add' ? '+ ' : r.kind === 'del' ? '− ' : r.kind === 'mod' ? '± ' : '  ') + (r.text || ' ')}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
