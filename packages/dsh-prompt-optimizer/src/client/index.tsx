import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// 类型级引入,激活目标槽位的 SlotMap 合并声明,以及 ctx.slots / ctx.configForms
// 的 Context 合并(slots 由 ui-renderer 声明,configForms 由 ui-settings 声明)。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { createOptimizeButton } from './OptimizeButton.js'
import { createResultDock } from './ResultDock.js'
import { createSettingsCard } from './SettingsCard.js'
import { createOptimizerController } from './controller.js'
import type { ModelDirectoriesLike } from './host-faces.js'
import { installLocaleFace, type LocaleFace, translate } from './i18n.js'
import { createSettingsFace } from './settings-face.js'
// connection 的客户端 Context 合并发布版不带,这里按实际形状补齐。
declare module '@deepseek-ai/cordis' {
  interface Context {
    connection: ConnectionHandle
  }
}

export const name = 'dsh-prompt-optimizer-client'
// 主注入只放本插件离不开的服务。locale / modelDirectories / sessions /
// configForms 都是可选消费,走下方各自的独立 inject——并进主 inject 会让
// 宿主缺任一服务时整个客户端永远等不到就绪。
export const inject = ['slots', 'connection', 'remote']

/** 本插件交互元素的公共类名(U11:focus-visible 焦点环走这一份注入的样式)。 */
export const BUTTON_CLASS = 'dsh-po-btn'

/** 设置命名空间 = 组合行 entry id(与 cordis.patch.yml 的 insert id 一致)。 */
const SETTINGS_ENTRY_ID = 'prompt-optimizer'

/**
 * U11:键盘可达性。inline style 表达不了 :focus-visible 伪类,注入一段全局样式
 * 为所有 .dsh-po-btn 元素补焦点环;幂等,重复调用只插一次。
 */
function ensureFocusStyles(): void {
  if (typeof document === 'undefined') return
  const ID = 'dsh-prompt-optimizer-focus-styles'
  if (document.getElementById(ID)) return
  const style = document.createElement('style')
  style.id = ID
  style.textContent =
    '.dsh-po-btn:focus-visible{outline:2px solid var(--dsw-alias-state-focus-ring, #4f7cf7);outline-offset:2px;border-radius:4px;}'
    // 发送栏「优化」按钮的底色与 hover:对齐官方工具胶囊(5% 中性浅底、全圆角)。
    // 底色用 label-primary 做 color-mix 近似官方 #f5f6f7,color-mix 不支持时
    // 整条声明失效、回落透明底;hover 加深一档给可点击性反馈。
    // (放在样式表而非 inline:hover 会被 inline background 盖掉。)
    + '.dsh-po-opt{background:color-mix(in srgb, var(--dsw-alias-label-primary, #0f1115) 5%, transparent);}'
    + '.dsh-po-opt:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-label-primary, #0f1115) 9%, transparent);}'
    // 设置卡标题栏的 GitHub 仓库链接:hover 提亮 + 淡背景,给可点击性一个视觉反馈。
    + '.dsh-po-repo-link{transition:color 0.15s ease,background-color 0.15s ease;}'
    + '.dsh-po-repo-link:hover{color:var(--dsw-alias-label-primary, inherit);background-color:var(--dsw-alias-fill-secondary, rgba(128,128,128,0.12));}'
  document.head.appendChild(style)
}

export function apply(ctx: ClientContext): void {
  ensureFocusStyles()
  // 可选消费 locale 服务(dsh-client-locale):存在则界面文案跟随 DSH 界面语言,
  // 缺席(老版本/非 web)时保持中文,不影响任何其他功能。
  ctx.inject(['locale'], (lctx) => {
    installLocaleFace((lctx as unknown as { locale?: LocaleFace }).locale ?? null)
  })
  // 可选消费会话模型目录服务(dsh-client-ui-model-selection):「跟随会话」用它读取
  // 与 /model 弹窗共用的目录。**独立 inject**:不能并进主 inject,否则旧版宿主
  // (无该服务)会让整个客户端永远等不到就绪;缺席时保持 undefined,走 Host 回退。
  // 闭包捕获 + 点击时惰性读取:优化点击远晚于服务到达,无需阻塞任何注册。
  let modelDirectories: ModelDirectoriesLike | undefined
  ctx.inject(['modelDirectories'], (mctx) => {
    modelDirectories = (mctx as unknown as { modelDirectories?: ModelDirectoriesLike }).modelDirectories
  })
  // 可选消费会话服务(`ctx.sessions`,dsh-api-session-controller):「携带上下文」
  // 从会话事件窗口取近期对话。同样**独立 inject** —— 老宿主无该服务时保持
  // undefined,controller 自动退回 legacy 查询面或按无上下文优化。
  let sessions: unknown
  ctx.inject(['sessions'], (sctx) => {
    sessions = (sctx as unknown as { sessions?: unknown }).sessions
  })

  // 设置面:内核 0.2.x 只有 configForms(命名空间 = entry id)。服务缺席时
  // 快照保持 loading,controller 的判定函数按缺省口径工作。
  const settings = createSettingsFace()
  ctx.inject(['configForms'], (cctx) => {
    const forms = (cctx as unknown as { configForms?: Parameters<typeof settings.attachForms>[0] }).configForms
    if (forms) settings.attachForms(forms, SETTINGS_ENTRY_ID)
  })

  const scope = { getSnapshot: () => settings.face.getSnapshot() }
  const controller = createOptimizerController(ctx, {
    // 与 Host 侧「空字符串视为未设置」的口径一致。
    isModelPinned: () => Boolean(scope.getSnapshot().value?.model?.trim()),
    // 与 Host 侧「includeContext 缺省视为开」的口径一致(R28)。
    isContextEnabled: () => scope.getSnapshot().value?.includeContext ?? true,
    // 与 Host 侧「仅 mode==='fast' 为快速」的归一化口径一致。
    isFastMode: () => scope.getSnapshot().value?.mode === 'fast',
    // R21:看门狗 = 设置超时秒数 + 5s 余量(正常时 Host 的超时错误先到达,文案更友好)。
    getWatchdogMs: () => ((scope.getSnapshot().value?.timeoutSeconds ?? 120) + 5) * 1000,
    // 「跟随会话」的模型来源(见上);点击时读取,服务缺席走 Host 回退。
    getSessionModelDirectories: () => modelDirectories,
    // 「携带上下文」的会话事件窗口来源(见上);点击时读取。
    getSessions: () => sessions,
  })

  // 发送栏按钮与结果面板。0.1.2 起 conversation.input.* 槽位是 session scope,
  // 采用与官方 ui-model-selection 一致的双层形态 —— 注入回调内 scope 化注册,
  // 并携带渲染端使用的 inject(sessionId) 钩子;0.2.0 的槽位声明与该形态一致。
  ctx.inject(['slots', 'connection', 'remote'], (scopeCtx) => {
    scopeCtx.slots.inject('conversation.input.right', () =>
      scopeCtx.slots.register(
        {
          name: 'conversation.input.right',
          id: 'prompt-optimizer',
          order: 30,
          inject: () => ({}),
        },
        createOptimizeButton(controller),
      ),
    )
    scopeCtx.slots.inject('conversation.input.dock', () =>
      scopeCtx.slots.register(
        {
          name: 'conversation.input.dock',
          id: 'prompt-optimizer',
          order: 30,
          inject: () => ({}),
        },
        createResultDock(controller),
      ),
    )
  })

  // 设置入口:settings.plugins.tab(插件设置页的标签页,id + order + label;
  // 仅一个第三方标签时官方组件直接整页展示)。旧宿主(0.1.x)的
  // settings.plugin.item 槽位已随内核 0.2.0 退役,不再注册。
  // inject 回调只在宿主声明了该槽位时触发,缺席时不注册、也不抛错。
  const slotsAny = ctx.slots as unknown as { inject(name: string, register: () => unknown): void }
  const registerSettingsTab = (slotCtx: ClientContext): (() => void) => {
    const slots = slotCtx.slots as unknown as {
      register(options: Record<string, unknown>, component: unknown): () => void
    }
    const card = createSettingsCard(slotCtx, settings.face)
    return slots.register(
      {
        name: 'settings.plugins.tab',
        id: SETTINGS_ENTRY_ID,
        order: 30,
        label: () => translate('panel.title'),
        inject: () => ({}),
      },
      card,
    )
  }
  slotsAny.inject('settings.plugins.tab', () => registerSettingsTab(ctx))
}
