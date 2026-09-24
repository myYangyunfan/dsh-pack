/**
 * Lazy chunk view wrapper: mounts a component that lives in a lazy chunk,
 * showing a loading placeholder while the chunk script loads and an error +
 * retry affordance on failure. Used by the built-in tab/viewer descriptors.
 *
 * Load failures (kernel down → `client module system unavailable`, network
 * blips, …) stay on the error state with the manual retry button, but the
 * view also subscribes to the chunk's shared auto-retry loop
 * ({@link ensureChunkAutoRetry}): a waiting line shows the live attempt
 * count, and when the loop reports `ready` the view re-loads and recovers
 * WITHOUT user action — the 0.5.0 "sidebar bricked after kernel restart"
 * fix (see chunk-availability.ts).
 *
 * Contract note: {@link lazyChunkComponent} returns a plain render-prop
 * function — the descriptor contract is `component: (props) => ReactNode`,
 * and the repo renders descriptors BOTH ways: Sidebar calls
 * `descriptor.component(props)` directly, EditorHost renders it via
 * `createElement`. The wrapper function body therefore contains no hooks;
 * all state lives in the inner {@link LazyChunkView} component.
 */
import { createElement, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { ensureChunkAutoRetry, loadChunk, type ChunkExports, type ChunkName } from './chunk-loader.ts'
import { t } from './locales.ts'
import css from './sidebar.module.css'

interface LazyChunkViewProps<P> {
  chunk: ChunkName
  /** Module-level-stable selector (an inline lambda would re-trigger the effect). */
  pick: (mod: ChunkExports) => ComponentType<P> | undefined
  props: P
  /** Read-only fallback renderer used while the chunk cannot load (the file's
   *  content is already in `props` for fsRead viewers, so the user ALWAYS sees
   *  something; the auto-retry keeps trying for the real editor behind it). */
  fallback?: (props: P) => ReactNode
}

function LazyChunkView<P>({ chunk, pick, props, fallback }: LazyChunkViewProps<P>): ReactNode {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string; autoAttempt?: number }
    | { status: 'ready'; Comp: ComponentType<any> }
  >({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    let stopAutoRetry: (() => void) | undefined
    setState({ status: 'loading' })
    loadChunk(chunk).then((mod) => {
      if (cancelled) return
      const Comp = pick(mod)
      if (Comp === undefined) {
        // Build inconsistency (not transient): manual retry only.
        setState({ status: 'error', message: `[dsh-better-sidebar] chunk "${chunk}" is missing its component` })
        return
      }
      setState({ status: 'ready', Comp })
    }).catch((error: unknown) => {
      if (cancelled) return
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error), autoAttempt: 1 })
      // Auto-recover in the background (shared per-chunk loop; cleaned up on
      // unmount / effect re-run — see chunk-loader.ts).
      stopAutoRetry = ensureChunkAutoRetry(chunk, (event) => {
        if (cancelled) return
        if (event.ready) {
          // Loop re-loaded the chunk: re-run this effect (loadChunk now
          // resolves from cache) and render — no user action needed.
          setAttempt(current => current + 1)
          return
        }
        setState((prev) => prev.status === 'error' ? { ...prev, autoAttempt: event.attempt } : prev)
      })
    })
    return () => {
      cancelled = true
      stopAutoRetry?.()
    }
  }, [chunk, pick, attempt])

  if (state.status === 'loading') {
    return <div className={css.editorPlaceholder}>{t('loading')}</div>
  }
  if (state.status === 'error') {
    // A fallback renderer (read-only preview) keeps the file VIEWABLE while the
    // chunk is unavailable — the banner explains the degradation and the retry
    // still targets the real editor.
    if (fallback !== undefined) {
      return (
        <>
          <div className={css.editorBanner}>
            <span>{t('chunkFallbackNotice')}</span>
            {state.autoAttempt !== undefined && (
              <span>{t('chunkAutoRetryWaiting', { n: state.autoAttempt })}</span>
            )}
            <button
              type="button"
              className={css.terminalRetry}
              onClick={() => { setAttempt(current => current + 1) }}
            >
              {t('terminalRetry')}
            </button>
          </div>
          {fallback(props)}
        </>
      )
    }
    return (
      <div className={css.editorError}>
        <span>{state.message}</span>
        {state.autoAttempt !== undefined && (
          <span>{t('chunkAutoRetryWaiting', { n: state.autoAttempt })}</span>
        )}
        <button
          type="button"
          className={css.terminalRetry}
          onClick={() => { setAttempt(current => current + 1) }}
        >
          {t('terminalRetry')}
        </button>
      </div>
    )
  }
  return createElement(state.Comp, props)
}

/**
 * Build a descriptor-compatible lazy wrapper for a chunk-resident component.
 * The returned function is the descriptor `component` itself: it returns an
 * element and never calls hooks, so both invocation styles (plain function
 * call and createElement/JSX render) work. `pick` must be a module-level
 * function (stable identity) — an inline lambda would re-trigger the load
 * effect on every render.
 * @param chunk - the chunk name (see chunk-loader.ts).
 * @param pick - select the component from the chunk's exports.
 * @param fallback - optional read-only preview rendered while the chunk is
 *   unavailable (the fsRead viewers pass one so the file stays viewable).
 */
export function lazyChunkComponent<P extends object>(
  chunk: ChunkName,
  pick: (mod: ChunkExports) => ComponentType<P> | undefined,
  fallback?: (props: P) => ReactNode,
): (props: P) => ReactNode {
  return (props: P) => createElement(
    LazyChunkView as ComponentType<LazyChunkViewProps<P>>,
    { chunk, pick, props, fallback },
  )
}
