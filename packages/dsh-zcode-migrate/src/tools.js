// Model-callable tools exposed by the zcode → dsh migrator adapter.
//
// Three tools, deliberately small: `inspect` (read-only reconnaissance),
// `migrate` (the write path, idempotent), and `verify` (read a published
// artifact back). Every tool returns plain structured JSON; thrown errors are
// compacted into `{ ok: false, error: { code, message, suggestion } }` instead
// of leaking stack traces to the model.
//
// 【工具名只能用 [a-zA-Z0-9_-]，别改回 `zcode.inspect` 这种带点的】
// 模型 API 校验函数名必须匹配 `^[a-zA-Z0-9_-]+$`，带点会直接把整个请求打成 400：
//   Invalid 'tools[0].name': string does not match pattern. Expected a string that
//   matches the pattern '^[a-zA-Z0-9_-]+$'.
// 表现为「本轮运行失败」，整个会话发不出消息（不是工具调用失败，是请求都发不出去）。
// 本仓库的 provider（dsh-llm-deepseek / dsh-llm-pi-ai）有一层 fork 补丁会在出口把
// 非法字符换成 `_`、回程再还原，但那只覆盖这两条已知路径 —— 别的 dsh 构建（如 npm
// 全局装的官方包）、别的 API 形状都不覆盖。同一个坑 cardian 插件踩过两次
// （2026-08-29 / 09-02，日志里是 `tools[N].function.name`），所以这里直接用下划线。
// 仓库侧有守卫测试扫描所有内置插件的 contributes.tools，防复发。

import { toErrorPayload } from '../core/errors.js'
import { inspect, migrate, readArtifact } from '../core/migrate.js'

const strOpt = (description) => ({ type: 'string', description })
const numOpt = (description) => ({ type: 'number', description })
const boolOpt = (description) => ({ type: 'boolean', description })
const arrOpt = (description) => ({
  type: 'array',
  items: { type: 'string' },
  description,
})

function params(properties) {
  return { type: 'object', properties, required: [] }
}

/** Shared filter fields, so inspect and migrate stay in lockstep. */
const FILTER_FIELDS = {
  dbPath: strOpt('zcode 数据库路径，默认 ~/.zcode/cli/db/db.sqlite（支持 ~）'),
  dshRoot: strOpt('dsh 会话根目录，默认 ~/.dsh/sessions（支持 ~）'),
  cwd: strOpt('只迁移工作目录等于该值的会话（不区分大小写）'),
  ids: arrOpt('只迁移这些 zcode 会话 id（sess_…）'),
  since: numOpt('只迁移创建时间不早于该 epoch 毫秒的会话'),
  until: numOpt('只迁移创建时间不晚于该 epoch 毫秒的会话'),
  limit: numOpt('最多迁移多少个会话（默认全部）'),
  includeSubagents: boolOpt('是否包含子代理会话（默认 false，只迁移顶层会话）'),
  snapshot: boolOpt('迁移前先用 SQLite 在线备份做快照（zcode 正在运行时建议开启）'),
  snapshotPath: strOpt('快照文件路径，默认与数据库同目录的 .migrate-snapshot'),
}

function register(ctx, key, def) {
  if (!ctx.tools || typeof ctx.tools.register !== 'function') return
  const { behavior, execute, ...rest } = def
  const wrapped = async (rawArgs) => {
    try {
      return await execute(rawArgs ?? {})
    } catch (err) {
      return toErrorPayload(err)
    }
  }
  // dsh's tools.register() takes a single definition object. The annotation-only
  // schema `{}` accepts any lossless-JSON value the tools return, and `render`
  // produces the host's text content blocks.
  ctx.tools.register({
    ...rest,
    name: key,
    behavior,
    readOnly: behavior === 'read',
    idempotent: behavior === 'read' || behavior === 'idempotent',
    destructive: false,
    output: {
      schema: {},
      render: (_args, value) => [
        { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
      ],
    },
    execute: wrapped,
  })
}

/**
 * Register the migrator's tools on a dsh context.
 * @param {object} ctx - cordis context carrying `ctx.tools`.
 * @param {object} defaults - plugin config, used for fields the model omits.
 */
export function registerTools(ctx, defaults = {}) {
  const withDefaults = (args) => {
    const merged = { ...args }
    for (const key of ['dbPath', 'dshRoot', 'includeSubagents', 'snapshot', 'agentPreset']) {
      if (merged[key] === undefined && defaults[key] !== undefined) merged[key] = defaults[key]
    }
    return merged
  }

  register(ctx, 'zcode_inspect', {
    name: 'zcode_inspect',
    description:
      '只读侦察：查看 zcode 会话库（默认 ~/.zcode/cli/db/db.sqlite）的会话/消息总量、按项目目录分布、将被迁移的会话清单，以及每个会话在 dsh 里是否已有迁移产物。不会写入任何文件。',
    behavior: 'read',
    parameters: params(FILTER_FIELDS),
    async execute(args) {
      return inspect(withDefaults(args))
    },
  })

  register(ctx, 'zcode_migrate', {
    name: 'zcode_migrate',
    description:
      '把 zcode 历史会话迁移成 dsh 原生会话日志，写入 ~/.dsh/sessions/<项目>/<会话>/session.jsonl.zstd，迁移后可在 dsh 的会话列表里直接恢复（resume）。按会话幂等：同一会话重复执行覆盖同一文件，不会产生重复。支持 dryRun 预演。',
    behavior: 'idempotent',
    parameters: params({
      ...FILTER_FIELDS,
      dryRun: boolOpt('只计算将产生的产物与体积，不写入磁盘（默认 false）'),
      includeReasoning: boolOpt('是否保留思考（reasoning）内容块（默认 true）'),
      emitTitle: boolOpt('是否写入 session/title 事件以保留 zcode 会话标题（默认 true）'),
      agentPreset: strOpt('写入会话头的 dsh agent preset id（默认 standard）'),
      maxToolOutputChars: numOpt('单个工具输出截断长度，0 表示不截断（默认 0）'),
      verify: boolOpt('写入后立即回读校验（默认 true）'),
    }),
    async execute(args) {
      return migrate(withDefaults(args))
    },
  })

  register(ctx, 'zcode_verify', {
    name: 'zcode_verify',
    description:
      '回读一个已迁移的 dsh 会话日志（session.jsonl.zstd），返回会话头、事件数、帧数与是否完整可解码，用于确认迁移产物真的能被 dsh 读取。',
    behavior: 'read',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '会话日志文件路径（.jsonl.zstd 或 .jsonl）' },
      },
      required: ['path'],
    },
    async execute(args) {
      if (!args.path) {
        return { ok: false, error: { code: 'CONFIG_ERROR', message: '缺少必填参数: path' } }
      }
      return readArtifact(args.path)
    },
  })
}
