/**
 * 内核自带右栏（@deepseek-ai/dsh-client-ui-sidebar-right）的接入层。
 *
 * 内核右栏是 #root 帧里的第三列，自带 dockkit 分栏、拖宽、全屏与开关；它自己的
 * 「文件 / 文档预览 / 终端」三个标签用的就是下面这套**公开两段式注册**：
 *   ① ctx.sidebarRightTabs.register({ id, kind, title, guide }) —— 标签的「类型」
 *   ② ctx.slots.register({ name:'sidebar.right.pane.tab', key: <①的 id> }, Body) —— 标签的「主体」
 * 所以本插件不改内核任何包、也不新增 PatchSpec。
 *
 * 接入后：整块工作台（文件树 + 标签 + 分屏 + 底部面板）里的**右侧面板**作为右栏
 * 里的一个标签渲染——列宽/开关/全屏/拖宽归内核，我们只把面板那一段 portal 进内核
 * 给的 pane 元素（见下方 useKernelPaneEl 与 Sidebar.tsx）；底部面板与它顶开会话列
 * 的行为**不变**（那是另一处独立工作面）。
 *
 * 兜底：内核没有这两个服务（旧内核 / 该包未加载）时本模块整体不生效，<Sidebar>
 * 退回自绘浮层（legacy），行为与整合前完全一致。这也是为什么**不**把该包写进
 * package.json 的 dsh.client.inject：inject 是硬前置，写进去等于让插件在没有该
 * 服务的内核上整体不加载；这里走 ctx.inject 的可选接法，服务缺席只是不集成。
 */
import { useEffect, useState, useSyncExternalStore, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import type { Context } from '../context-types.ts'
import type { SidebarStore } from './state.ts'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconPanelBottomOutline16, IconPanelRightOutline16 } from './icons.tsx'
import { t } from './locales.ts'
import css from './sidebar.module.css'

/** 标签类型的 id：同时是 `sidebar.right.pane.tab` 键控槽的 key（内核约定：主体注册在 id 下）。 */
export const KERNEL_RIGHTBAR_ID = 'dsh-better-sidebar'
/** 标签类型的 kind：`openTab(kind)` 用它点名（页面型，不声明 patterns）。 */
export const KERNEL_RIGHTBAR_KIND = 'better-sidebar'

/** 我们真正用到的那一小片内核右栏 API（结构化声明，不引入内核包的构建期依赖）。 */
export interface KernelRightbarSeam {
  /** 第一段：注册标签类型。 */
  registerType(definition: KernelRightbarDefinition): () => void
  /** 打开（或聚焦）我们的页面标签；同 kind 的页面标签在同一个 pane 里唯一，故可重复调用。 */
  openTab(kind: string): void
  /** 右栏当前是否展开（轮询式读取，用于「展开即见工作台」）。 */
  isExpanded(): boolean
}

/** 传给内核的类型定义（字段与内核 SidebarRightTabDefinition 一致）。 */
export interface KernelRightbarDefinition {
  id: string
  kind: string
  title: () => string
  priority?: 'extension' | 'builtin' | 'fallback'
  guide?: ReadonlyArray<{
    id: string
    order: number
    title: () => string
    description?: () => string
    icon?: ComponentType<{ size?: number }>
  }>
}

/** 从 context 上读内核右栏的两个服务；不在位（或不完整）时返回 null。 */
export function readKernelRightbarSeam(ctx: Context): KernelRightbarSeam | null {
  const anyCtx = ctx as unknown as {
    sidebarRightTabs?: { register?: unknown }
    sidebarRight?: { openTab?: unknown; isExpanded?: unknown }
  }
  const tabs = anyCtx.sidebarRightTabs
  const right = anyCtx.sidebarRight
  if (typeof tabs?.register !== 'function') return null
  if (typeof right?.openTab !== 'function' || typeof right.isExpanded !== 'function') return null
  return {
    registerType: (definition) =>
      (tabs.register as (d: KernelRightbarDefinition) => () => void).call(tabs, definition),
    openTab: (kind) => (right.openTab as (k: string) => void).call(right, kind),
    isExpanded: () => (right.isExpanded as () => boolean).call(right),
  }
}

/**
 * The kernel pane element our panel is portalled into.
 *
 * The slot body below mounts INSIDE the kernel's dock, so it is the only place that
 * can hand us that element; the panel lives in <Sidebar>'s single React tree (all its
 * effects must stay single-instance), so we publish the element through this tiny
 * store instead of rendering the panel twice. `null` = no kernel right bar → legacy.
 */
let paneEl: HTMLElement | null = null
const paneListeners = new Set<() => void>()
/** The live seam while integration is active (null = legacy floating panel). */
let activeSeam: KernelRightbarSeam | null = null

/**
 * Whether integration is ACTIVE — distinct from "the pane element is present".
 * The dock unmounts our tab body while the column is collapsed (and whenever the
 * tab is closed), which empties the pane element; the panel must then stay
 * unmounted instead of falling back to rendering in place, or a closed kernel
 * column would leave our panel drawn at the viewport's top-left over the app.
 */
let integrationActive = false
const activeListeners = new Set<() => void>()

function setIntegrationActive(next: boolean): void {
  if (integrationActive === next) return
  integrationActive = next
  for (const listener of activeListeners) listener()
}

/** React hook form: whether the kernel right bar is driving our right panel. */
export function useKernelRightbarActive(): boolean {
  return useSyncExternalStore(
    (listener) => { activeListeners.add(listener); return () => { activeListeners.delete(listener) } },
    () => integrationActive,
    () => false,
  )
}

function setKernelPaneEl(el: HTMLElement | null): void {
  if (paneEl === el) return
  paneEl = el
  for (const listener of paneListeners) listener()
}

function subscribeKernelPane(listener: () => void): () => void {
  paneListeners.add(listener)
  return () => { paneListeners.delete(listener) }
}

/** React hook form: the current kernel pane element (null while not integrated). */
export function useKernelPaneEl(): HTMLElement | null {
  return useSyncExternalStore(subscribeKernelPane, () => paneEl, () => null)
}

/** Our own element inside the dock's button row (see {@link ensureStripHost}). */
const STRIP_HOST_ATTR = 'data-dsh-strip-host'

/**
 * The dock's tab strip: the row holding the kit's own [split] [fullscreen] [collapse]
 * buttons. Our bottom-panel toggle docks there as a parallel button (the user's
 * "在侧边栏按钮里面加一个并列的底部侧边栏"), so the floating toggle cluster can go away.
 *
 * `useKernelPaneEl` is the lifetime signal: the strip only exists while our tab body
 * is mounted, and the strip can be re-rendered (dropping our host) without the pane
 * element changing — hence the observer, which re-creates the host if it vanishes.
 */
export function useKernelStripAnchor(): HTMLElement | null {
  const pane = useKernelPaneEl()
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (pane === null) {
      setHost(null)
      return
    }
    const refresh = (): void => { setHost(ensureStripHost(pane)) }
    refresh()
    const surface = pane.closest('[data-dockkit-surface]') ?? pane.parentElement ?? document.body
    const observer = new MutationObserver(refresh)
    observer.observe(surface, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      const stale = document.querySelector(`[${STRIP_HOST_ATTR}]`)
      stale?.remove()
      setHost(null)
    }
  }, [pane])
  return host
}

/**
 * Find the dock's tab strip from our pane, then make sure our host element exists in
 * its button row — inserted BEFORE the kit's split control, so the row reads
 * [底部面板] [分栏] [全屏] [收起]. We own exactly this one empty span; the kit's own
 * nodes are never moved or restyled (only the strip's flex makes room, 28px).
 */
function ensureStripHost(pane: HTMLElement): HTMLElement | null {
  let scope: HTMLElement | null = pane
  let strip: HTMLElement | null = null
  for (let hops = 0; scope !== null && hops < 8; hops += 1) {
    strip = scope.querySelector('[data-dockkit-strip]')
    if (strip !== null) break
    scope = scope.parentElement
  }
  if (strip === null) return null
  const existing = strip.querySelector(`[${STRIP_HOST_ATTR}]`)
  if (existing !== null) return existing as HTMLElement
  const host = document.createElement('span')
  host.setAttribute(STRIP_HOST_ATTR, '')
  host.className = 'dsh-strip-host'
  strip.insertBefore(host, strip.querySelector('[data-dockkit-split-button]'))
  return host
}

/**
 * The bottom-panel toggle as a button in the dock's strip (integrated mode only).
 * Renders nothing until the strip exists; toggling keeps our existing semantics —
 * the bottom panel still spans the conversation column below.
 */
export function KernelBottomPanelToggle(props: { open: boolean; onToggle: () => void; host: HTMLElement | null }) {
  const { open, onToggle, host } = props
  if (host === null) return null
  const label = open ? t('collapseBottomPanel') : t('expandBottomPanel')
  return createPortal(
    <Tooltip label={label} side="bottom" delayMs={500}>
      <button
        type="button"
        className={css.toggleButton}
        data-dsh-bottom-panel-toggle=""
        aria-label={label}
        aria-pressed={open}
        onClick={onToggle}
      >
        <IconPanelBottomOutline16 />
      </button>
    </Tooltip>,
    host,
  )
}

/**
 * The slot body of our tab: an empty, pane-filling element that publishes itself.
 * The workbench renders through the portal, so this stays a one-line component.
 */
export function KernelRightbarBody(_props: { sessionId?: string }) {
  return <div ref={(el) => { setKernelPaneEl(el) }} className={css.kernelPane} data-dsh-kernel-pane="" />
}

/**
 * Register the tab type (stage one) and its body (stage two), and keep the panel
 * reachable: the kernel seeds an empty dock with its guide page, so on the first
 * expansion of each session we open our own tab — one click on the kernel's expand
 * button then lands on the workbench instead of the guide. Gated by the
 * `kernelRightbarAutoOpen` pref.
 */
export function integrateKernelRightbar(
  ctx: Context,
  store: SidebarStore,
  seam: KernelRightbarSeam,
): () => void {
  activeSeam = seam
  setIntegrationActive(true)
  const disposeType = seam.registerType({
    id: KERNEL_RIGHTBAR_ID,
    kind: KERNEL_RIGHTBAR_KIND,
    title: () => t('kernelTabTitle'),
    priority: 'extension',
    guide: [{
      id: 'workbench',
      order: 5,
      title: () => t('kernelGuideTitle'),
      description: () => t('kernelGuideDescription'),
      icon: IconPanelRightOutline16 as unknown as ComponentType<{ size?: number }>,
    }],
  })
  const disposeBody = ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: KERNEL_RIGHTBAR_ID,
  }, KernelRightbarBody))
  const stopWatching = store.getPrefs().kernelRightbarAutoOpen === false
    ? () => {}
    : watchKernelExpansion(seam, () => store.getSnapshot().sessionId)
  return () => {
    stopWatching()
    disposeBody()
    disposeType()
    setKernelPaneEl(null)
    setIntegrationActive(false)
    if (activeSeam === seam) activeSeam = null
  }
}

/**
 * Expand the kernel column (used by every "reveal the sidebar" path: a file open, a
 * terminal, the auto-opened Subagent/Jobs page). Page tabs are unique per pane, so
 * this focuses our existing tab when there is one and creates it otherwise.
 * @returns whether the kernel right bar handled it — false means the caller should
 *   run the legacy panel toggle instead.
 */
export function ensureKernelRightbarOpen(): boolean {
  if (activeSeam === null) return false
  activeSeam.openTab(KERNEL_RIGHTBAR_KIND)
  return true
}

/** Open our tab on the first expansion of each session (see integrateKernelRightbar). */
function watchKernelExpansion(seam: KernelRightbarSeam, currentSession: () => string | undefined): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  const opened = new Set<string>()
  const check = (): void => {
    if (!seam.isExpanded()) return
    const sessionId = currentSession()
    if (sessionId === undefined || opened.has(sessionId)) return
    opened.add(sessionId)
    seam.openTab(KERNEL_RIGHTBAR_KIND)
  }
  const observer = new MutationObserver(check)
  // The panel is a kernel-owned element we must not poke at, so we watch the two
  // attributes it flips (opened / placement) and re-read the controller instead.
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-sidebar-right-open', 'data-sidebar-right-panel'],
  })
  check()
  return () => { observer.disconnect() }
}
