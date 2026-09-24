#!/usr/bin/env node
// Standalone CLI for the zcode → dsh migrator.
//
// The same `core/` used by the dsh plugin, so it works without a running dsh
// (useful for a first bulk migration, for CI, or for scripting).
//
//   node cli.mjs inspect
//   node cli.mjs migrate --dry-run
//   node cli.mjs migrate --limit 20
//   node cli.mjs verify "<path to session.jsonl.zstd>"

import { inspect, migrate, readArtifact, DEFAULT_DSH_ROOT } from './core/migrate.js'
import { DEFAULT_DB_PATH } from './core/zcode.js'
import { MigrateError } from './core/errors.js'

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      args._.push(token)
      continue
    }
    const [rawKey, inline] = token.slice(2).split('=')
    const key = rawKey.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())
    if (inline !== undefined) args[key] = inline
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) args[key] = argv[++i]
    else args[key] = true
  }
  return args
}

function toNumber(value) {
  if (value === undefined || value === null || value === true) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

const human = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

function printInspect(report) {
  console.log(`zcode 数据库 : ${report.dbPath}`)
  console.log(`dsh 会话根   : ${report.dshRoot}${report.dshRootExists ? '' : '（尚不存在，迁移时会创建）'}`)
  console.log(`运行时 zstd  : ${report.runtime.zstd ? '可用' : '不可用（将退化为未压缩 session.jsonl）'}`)
  console.log(
    `库内总量     : ${report.database.sessions} 会话 / ${report.database.messages} 消息 / ${report.database.parts} 片段 / ${report.database.directories} 个项目`,
  )
  console.log(`本次选中     : ${report.selected} 会话`)
  console.log('')
  console.log('按项目目录：')
  for (const row of report.directories.slice(0, 25)) {
    console.log(`  ${String(row.sessions).padStart(5)}  ${row.directory}`)
  }
  if (report.directories.length > 25) console.log(`  … 另有 ${report.directories.length - 25} 个项目`)
  const done = report.sessions.filter((s) => s.alreadyMigrated).length
  console.log('')
  console.log(`已迁移过     : ${done} / ${report.sessions.length}`)
}

function printMigrate(report) {
  const mode = report.dryRun ? '[dry-run] ' : ''
  console.log(
    `${mode}扫描 ${report.scanned} 会话 → 迁移 ${report.migrated} / 跳过 ${report.skipped} / 失败 ${report.failed}`,
  )
  console.log(
    `事件 ${report.totals.events} · 消息 ${report.totals.messages} · 工具结果 ${report.totals.toolResults} · 轮次 ${report.totals.turns} · 体积 ${human(report.totals.bytes)}`,
  )
  console.log(`输出根目录: ${report.dshRoot}`)
  const failures = report.sessions.filter((s) => s.status === 'failed')
  if (failures.length) {
    console.log('')
    console.log('失败明细：')
    for (const failure of failures.slice(0, 20)) {
      console.log(`  ${failure.zcodeId}  ${failure.error?.code}: ${failure.error?.message}`)
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const command = args._[0] || 'help'

  const shared = {
    dbPath: typeof args.db === 'string' ? args.db : undefined,
    dshRoot: typeof args.root === 'string' ? args.root : undefined,
    cwd: typeof args.cwd === 'string' ? args.cwd : undefined,
    ids: typeof args.ids === 'string' ? args.ids.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    since: toNumber(args.since),
    until: toNumber(args.until),
    limit: toNumber(args.limit),
    includeSubagents: Boolean(args.includeSubagents),
    snapshot: Boolean(args.snapshot),
    snapshotPath: typeof args.snapshotPath === 'string' ? args.snapshotPath : undefined,
  }

  if (command === 'inspect') {
    printInspect(await inspect(shared))
    return 0
  }

  if (command === 'migrate') {
    const report = await migrate({
      ...shared,
      dryRun: Boolean(args.dryRun),
      verify: args.noVerify ? false : true,
      includeReasoning: args.noReasoning ? false : true,
      emitTitle: args.noTitle ? false : true,
      agentPreset: typeof args.agentPreset === 'string' ? args.agentPreset : undefined,
      maxToolOutputChars: toNumber(args.maxToolOutputChars),
    })
    printMigrate(report)
    return report.failed ? 1 : 0
  }

  if (command === 'verify') {
    const target = args._[1]
    if (!target) {
      console.error('用法: node cli.mjs verify "<session.jsonl.zstd 路径>"')
      return 2
    }
    const result = readArtifact(target)
    console.log(`文件   : ${result.path}`)
    console.log(`会话头 : ${JSON.stringify(result.header)}`)
    console.log(`事件数 : ${result.eventCount}（zstd 帧 ${result.frameCount}）`)
    console.log(`体积   : ${human(result.bytes)}`)
    console.log(`完整   : ${result.tornStart === null ? '是' : `否（损坏帧 @ ${result.tornStart}）`}`)
    return result.tornStart === null ? 0 : 1
  }

  console.log(`dsh-zcode-migrate — 把 zcode 历史会话迁移成 dsh 原生会话日志

用法:
  node cli.mjs inspect [--db <路径>] [--cwd <目录>] [--limit N] [--include-subagents]
  node cli.mjs migrate [--dry-run] [--db <路径>] [--root <目录>] [--cwd <目录>]
                       [--ids <sess_a,sess_b>] [--since <ms>] [--until <ms>] [--limit N]
                       [--include-subagents] [--snapshot] [--no-verify] [--no-reasoning]
                       [--no-title] [--agent-preset <id>] [--max-tool-output-chars N]
  node cli.mjs verify <session.jsonl.zstd 路径>

默认值:
  --db    ${DEFAULT_DB_PATH}
  --root  ${DEFAULT_DSH_ROOT}`)
  return 0
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    if (err instanceof MigrateError) {
      console.error(`错误 [${err.code}]: ${err.message}`)
      if (err.suggestion) console.error(`建议: ${err.suggestion}`)
    } else {
      console.error(err)
    }
    process.exitCode = 1
  })
