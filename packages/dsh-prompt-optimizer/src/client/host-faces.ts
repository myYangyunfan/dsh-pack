/**
 * 与宿主客户端服务对接的最小结构面(版本稳定的自有定义)。
 *
 * 背景:0.1.x 各版本间上游类型多次搬家——`dsh-client-runtime` 在 0.1.2 被并包移除,
 * `HistoryEntry` / `ModelProviderGroup` 的权威定义滞留在未发布的
 * `dsh-api-session-controller`。插件因此自带结构定义:只声明实际消费的字段,
 * 不追着上游类型跑,跨版本稳定。
 */

/** 会话历史条目的最小结构面(只消费 `event.type` / `event.data`)。 */
export interface OptimizerHistoryEntry {
  event?: { type?: unknown; data?: unknown }
}

/** 会话当前模型选择(provider/model + 可选推理强度)。 */
export interface OptimizerSessionSelection {
  provider?: string
  model?: string
  reasoningEffort?: string
}

/** 模型目录分组(设置卡下拉用)。 */
export interface OptimizerModelGroup {
  id: string
  name: string
  models: readonly { id: string; name: string }[]
}

/** 目录加载时个别提供方的失败(其余分组照常可用)。 */
export interface OptimizerModelFailure {
  id: string
  name: string
  message: string
}

/** 连接层 RPC 的统一结果包络(`ConnectionRpcResult` 的结构面)。 */
export type OptimizerRpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error?: { message?: string } | string }

/**
 * 连接层通用 RPC(`connection.rpc.call`)的最小结构面。
 *
 * 端点为 typert 的 `<namespace>/<method>` 规范形(如 `session/modelCatalog`),
 * 载荷为 `{ args: <按形参顺序的数组> }`,经 `/api` 通道由 api-gateway 分派。
 * 该通道 0.1.0-rc.7 → 0.1.5 形状一致,是插件跨越版本最稳的宿主调用面。
 */
export interface ConnectionRpcFace {
  rpc?: {
    call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<OptimizerRpcResult<unknown>>
  }
}

/**
 * 拉取宿主代际的模型目录(`session/modelCatalog`,无常量参数)。
 * 返回 ok/失败两种结果;调用方自行降级。
 *
 * 载荷信封:网关要求 `payload` 恰好含一个**纯对象** `args` 字段,业务参数按
 * 形参的 wire 名为键;零参方法即 `{ args: {} }`(数组会被拒:
 * "Remote payload must contain exactly one plain-object args field")。
 */
export async function sessionCatalog(
  connection: unknown,
  signal?: AbortSignal,
): Promise<OptimizerRpcResult<{ groups: OptimizerModelGroup[]; failures?: readonly OptimizerModelFailure[] }>> {
  const call = (connection as ConnectionRpcFace | undefined)?.rpc?.call
  if (!call) return { ok: false, error: '连接层 RPC 通道在当前 dsh 版本缺席' }
  const result = (await call('/api', 'session/modelCatalog', { args: {} }, signal)) as
    | { ok: true; value: { groups?: OptimizerModelGroup[]; failures?: readonly OptimizerModelFailure[] } }
    | { ok: false; error?: { message?: string } | string }
  if (!result.ok) {
    return { ok: false, error: result.error }
  }
  return { ok: true, value: { groups: result.value.groups ?? [], failures: result.value.failures } }
}

/**
 * 官方会话模型目录服务(`ctx.modelDirectories`,`dsh-client-ui-model-selection` 提供)。
 * `directoryFor(sessionId)` 返回该会话与 /model 弹窗共用的同一份目录状态:
 * `load()` 拉齐宿主目录,快照里的 `current` 即「会话实际将使用的模型」
 * (持久化的会话内选择,回落宿主默认)。旧版宿主可能未提供该服务,按可选取用。
 */
export interface SessionModelDirectoryLike {
  load(): Promise<{
    current: OptimizerSessionSelection | null
    groups?: readonly OptimizerModelGroup[]
    status?: string
    error?: string | null
  }>
}

export interface ModelDirectoriesLike {
  directoryFor(sessionId: string): SessionModelDirectoryLike
}

/**
 * 旧版 `connection.api.*` 会话/目录查询面。
 *
 * 上游发布版(0.1.0-rc.7 → 0.1.5)从未在 `ConnectionHandle` 上声明过 `api`,
 * 浏览器端运行时同样不提供该属性。此面已不再被插件使用(目录改走
 * `session/modelCatalog` RPC、会话模型改走 `modelDirectories` 服务),
 * 仅保留供历史参考与回退诊断。
 */
export interface LegacySessionQueryFace {
  api?: {
    sessions?: {
      models(args: { sessionId: string }, signal?: AbortSignal): Promise<OptimizerRpcResult<{ current: OptimizerSessionSelection }>>
      history(args: { sessionId: string; maxMessages?: number }, signal?: AbortSignal): Promise<OptimizerRpcResult<{ events?: readonly OptimizerHistoryEntry[] }>>
    }
    llm?: {
      models(args?: unknown, signal?: AbortSignal): Promise<OptimizerRpcResult<{ groups: OptimizerModelGroup[] }>>
    }
  }
}

/** 读取旧版查询面(整体缺席时返回 undefined,调用方各自降级)。 */
export function legacyQueryFace(connection: unknown): LegacySessionQueryApi | undefined {
  return (connection as LegacySessionQueryFace | undefined)?.api
}

/** 旧版查询面本体(供调用方标注变量)。 */
export type LegacySessionQueryApi = NonNullable<LegacySessionQueryFace['api']>

/**
 * 一条会话事件:`session/page` 记录与本地事件窗口条目形状一致。
 * `event.data` 是 merge-extensible 的 JSON,按事件类型各自解释。
 */
export interface OptimizerSessionHistoryRecord {
  type?: string
  event?: {
    type?: string
    seq?: number
    time?: number
    data?: unknown
  }
}

/**
 * 会话事件窗口(`ctx.sessions.binding(id).eventSource`)的结构面。
 *
 * 这是 0.2.x 上**真正可用**的历史来源:`ISessions.retain()` 打开会话时先把
 * 尾部页(`HISTORY_PAGE_OPTIONS = { maxMessages: 500, turnWindow: { minMessages:50, minTurns:2 } }`)
 * 灌进这个窗口,`loadOlder()` 再向前翻页;窗口里就是 `{ type:'event', event }`
 * 序列,正是提炼上下文需要的真实用户/助手消息。
 *
 * 对照:`session/page` RPC 虽然存在,但它要求调用方先给出一个 `throughSeq`
 * 上界(来自 follow 开场帧);冷调用传 -1 会被 `paginate()` 算成
 * `end = 0` 而返回空页,拿不到既有历史。`ctx.conversation` 则完全不暴露历史。
 */
export interface OptimizerEventWindow {
  readonly entries?: readonly OptimizerSessionHistoryRecord[]
}

export interface OptimizerSessionsBinding {
  readonly eventSource?: { getSnapshot(): OptimizerEventWindow }
}

/**
 * 会话服务(`ctx.sessions`,`@deepseek-ai/dsh-api-session-controller/client`)的最小结构面。
 * `binding(id)` 只对**已保留**的会话返回绑定;未打开过的会话返回 undefined。
 */
export interface OptimizerSessionsLike {
  binding?(sessionId: string): OptimizerSessionsBinding | undefined
}

/**
 * 从本地事件窗口读取该会话当前已装载的历史条目。
 *
 * 返回 undefined 表示「当前宿主/当前会话拿不到窗口」,调用方按无上下文降级。
 * 非破坏性:只读快照,不 retain、不触发打开、不翻页。
 */
export function sessionEventEntries(sessions: unknown, sessionId: string): readonly OptimizerSessionHistoryRecord[] | undefined {
  const binding = (sessions as OptimizerSessionsLike | undefined)?.binding?.(sessionId)
  const window = binding?.eventSource?.getSnapshot()
  return window?.entries
}
