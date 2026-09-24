// dsh-zcode-migrate — 把 zcode CLI 的历史会话迁移成 dsh 原生会话日志。
//
// Cordis 插件契约：导出 name / inject / Config / apply。启动后在 `ctx.tools`
// 上注册三个模型可调用工具（inspect / migrate / verify）。真正的迁移逻辑在
// 框架无关的 `core/`，这里只是一层薄薄的 dsh 适配。
//
// 为什么产物能被 dsh 直接读到：dsh 的 JSONL 持久化后端把每个会话存成
//   <root>/--<归一化 cwd>--/<编码后的 id>/session.jsonl.zstd
// 文件内容是「拼接的带校验和 zstd 帧，每帧一条 JSONL 记录」，首帧第一条是
// v0 会话头。`core/paths.js` 与 `core/zstdlog.js` 逐字节复刻了这套规则，因此
// 写出的文件与 dsh 自己写出的在磁盘上同构。

import { Schema } from './schema.js'
import { registerTools } from './tools.js'
import { registerApi } from './rpc.js'
import { inspect, migrate } from '../core/migrate.js'
import { toErrorPayload } from '../core/errors.js'

export const name = 'zcode-migrate'

// webServer 是设置页（客户端半 lib/client.js）的数据入口所必需：没有它就没有
// HTTP 面，设置页只能干看着（所以声明成硬依赖而不是可选读）。
// workspaceRegistry 用来把「迁来的目录」登记成 dsh 工作区 —— 会话归组靠它，
// 不登记的话迁来的会话全掉「未分组」（用户实报）。注意 cordis 必须**声明 inject**
// 才拿得到服务：实测 `ctx.get('workspaceRegistry')` 在这个上下文里返回 undefined，
// 于是登记动作只会回「工作区服务不可用」。
export const inject = ['tools', 'webServer', 'workspaceRegistry']

export const Config = Schema.object({
  dbPath: Schema.string()
    .description('zcode 数据库路径（默认 ~/.zcode/cli/db/db.sqlite，支持 ~）')
    .default('~/.zcode/cli/db/db.sqlite'),
  dshRoot: Schema.string()
    .description('dsh 会话根目录（默认 ~/.dsh/sessions，支持 ~）')
    .default('~/.dsh/sessions'),
  includeSubagents: Schema.boolean()
    .description('默认是否迁移子代理会话；false 只迁移顶层会话（子代理数量通常是顶层的好几倍）')
    .default(false),
  snapshot: Schema.boolean()
    .description(
      '迁移前先用 SQLite 在线备份做一致性快照。默认关闭：只读访问对 WAL 库本身就是一致读，而快照会复制整库（可能上 GB）到系统临时目录。开启后会在结束时自动删除快照。',
    )
    .default(false),
  agentPreset: Schema.string()
    .description('写入会话头的 dsh agent preset id（决定恢复该会话时的工具与提示词组合）')
    .default('standard'),
  slashCommand: Schema.boolean()
    .description('注册 /zcode 斜杠命令约定（通过系统提示段把 /zcode … 映射到 zcode.* 工具）')
    .default(true),
})

/** 斜杠命令约定：dsh 没有命令注册面，用一段系统提示把前缀映射到工具。 */
export const SLASH_GUIDE = [
  '\n[zcode 会话迁移] 用户消息以 `/zcode` 开头时视为 zcode→dsh 迁移命令：直接调用对应 zcode.* 工具执行，用紧凑列表或表格汇报，不要寒暄。',
  '- `/zcode`（无参或 help）→ 列出本命令清单',
  '- `/zcode inspect` → zcode_inspect（只读侦察：库总量、按项目分布、待迁移清单）',
  '- `/zcode migrate [dryRun]` → zcode_migrate（dryRun 时只预演不写盘）',
  '- `/zcode migrate --cwd <路径>` → 只迁移某个项目的会话',
  '- `/zcode migrate --ids <sess_id,...>` → 只迁移指定会话',
  '- `/zcode migrate --includeSubagents` → 连同子代理会话一起迁移',
  '- `/zcode verify <路径>` → zcode_verify（回读产物确认可被 dsh 解析）',
  '',
].join('\n')

/**
 * Cordis apply：注册工具与（可选的）斜杠命令提示段。
 *
 * @param {object} ctx - dsh cordis 上下文。
 * @param {object} config - 由 {@link Config} 归一化后的插件配置。
 * @returns {() => void} 卸载回调。
 */
export function apply(ctx, config = {}) {
  const resolved = {
    dbPath: config.dbPath || '~/.zcode/cli/db/db.sqlite',
    dshRoot: config.dshRoot || '~/.dsh/sessions',
    includeSubagents: config.includeSubagents === true,
    snapshot: config.snapshot === true,
    agentPreset: config.agentPreset || 'standard',
    slashCommand: config.slashCommand !== false,
  }

  registerTools(ctx, resolved)

  // 设置页的数据入口（客户端半的唯一后端）。挂载失败不阻断插件：工具面照常可用。
  // workspaceRegistry 已在上面的 inject 里声明（必须声明才注入，见 inject 处注释）。
  const workspaceRegistry = ctx.workspaceRegistry
  if (!registerApi(ctx, resolved, { workspaceRegistry })) {
    ctx.logger?.warn?.('[zcode-migrate] webServer 不可用：设置页（勾选迁移）不会出现，仍可用工具/命令行迁移')
  }

  if (resolved.slashCommand) {
    try {
      if (typeof ctx.systemPrompt?.section === 'function') {
        ctx.systemPrompt.section(async () => SLASH_GUIDE)
      }
    } catch (err) {
      ctx.logger?.warn?.('[zcode-migrate] 系统提示段注册不可用:', err)
    }
  }

  // 暴露一个最小服务面，便于其他插件/测试直接调用迁移逻辑。
  //
  // 【别再写回 `ctx.zcodeMigrate = …`】cordis 4 的 ctx 是 Proxy：未声明 provide 就直接
  // 给 ctx 赋属性会抛 `cannot set property "zcodeMigrate" without provide`，整个宿主半
  // 随之加载失败（内核日志里是 `[loader-isolation] entry zcode-migrate … failed`，
  // 表现为「设置页在、但工具/命令/路由全都没有」）。只走 provide 这一条路。
  const service = {
    config: resolved,
    inspect: (options = {}) => inspect({ ...resolved, ...options }),
    migrate: (options = {}) => migrate({ ...resolved, ...options }),
  }
  if (typeof ctx.provide === 'function') ctx.provide('zcodeMigrate', service)

  return () => {}
}

export { inspect, migrate, toErrorPayload }
export { projectKey, encodeSegment, sessionLogPath, toDshSessionId } from '../core/paths.js'
