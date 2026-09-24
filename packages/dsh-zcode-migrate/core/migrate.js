// Migration orchestration: read zcode, convert, publish into dsh's session
// store, then verify what was written.
//
// Publication is atomic per session — the log is encoded fully in memory,
// written to a temporary sibling, and renamed into place. A reader therefore
// never observes a half-written frame, which matters because dsh's own watcher
// may pick the file up at any moment.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { ConvertError, MigrateError } from './errors.js'
import { convertSession } from './convert.js'
import { connect, expandPath, listSessions, readMessages, stats as dbStats } from './zcode.js'
import { encodeSessionLog, hasZstd, readSessionLog } from './zstdlog.js'
import { sessionLogPath, toDshSessionId } from './paths.js'

/** dsh's default sessions root. */
export const DEFAULT_DSH_ROOT = '~/.dsh/sessions'

/**
 * Publish one encoded log atomically.
 * @param {string} target - final log path.
 * @param {Buffer} contents - encoded log bytes.
 */
function writeAtomic(target, contents) {
  mkdirSync(dirname(target), { recursive: true })
  const temp = `${target}.tmp-${process.pid}-${Date.now().toString(36)}`
  try {
    writeFileSync(temp, contents)
    renameSync(temp, target)
  } catch (err) {
    try {
      rmSync(temp, { force: true })
    } catch {
      /* best-effort cleanup */
    }
    throw new MigrateError(`写入会话文件失败: ${target}`, {
      suggestion: '确认 dsh sessions 目录可写、磁盘空间充足',
      cause: err,
    })
  }
}

/**
 * Re-read a published log and assert it is structurally sound.
 * @param {string} path - log path.
 * @param {{ compressed: boolean, expectedEvents: number, expectedId: string }} expected
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function verifyArtifact(path, expected) {
  const problems = []
  if (!existsSync(path)) return { ok: false, problems: ['文件不存在'] }
  let decoded
  try {
    decoded = readSessionLog(readFileSync(path), { compressed: expected.compressed })
  } catch (err) {
    return { ok: false, problems: [`无法解码: ${err.message}`] }
  }
  if (!decoded.header) problems.push('缺少会话头记录')
  else {
    if (decoded.header.id !== expected.expectedId) {
      problems.push(`会话头 id 不匹配: ${decoded.header.id} != ${expected.expectedId}`)
    }
    if (decoded.header.version !== 0) problems.push(`会话头 version 非 0: ${decoded.header.version}`)
  }
  if (decoded.tornStart !== null) problems.push(`存在损坏/截断的帧 (offset ${decoded.tornStart})`)
  const eventCount = Math.max(0, decoded.records.length - (decoded.header ? 1 : 0))
  if (eventCount !== expected.expectedEvents) {
    problems.push(`事件数不匹配: ${eventCount} != ${expected.expectedEvents}`)
  }
  // Sequence numbers must stay contiguous from 0, as dsh's log contract requires.
  let cursor = 0
  for (const record of decoded.records) {
    if (record.type === 'session') continue
    if (record.seq !== cursor) {
      problems.push(`seq 不连续: 期望 ${cursor}，实际 ${record.seq}`)
      break
    }
    cursor += 1
  }
  return { ok: problems.length === 0, problems }
}

/**
 * Resolve the effective migration options, filling defaults and validating.
 * @param {object} input
 * @returns {object} normalized options.
 */
export function resolveOptions(input = {}) {
  const dshRoot = expandPath(input.dshRoot || DEFAULT_DSH_ROOT)
  const compressed = input.compressed === undefined ? hasZstd() : Boolean(input.compressed) && hasZstd()
  const limit = input.limit === undefined || input.limit === null ? null : Number(input.limit)
  if (limit !== null && (!Number.isFinite(limit) || limit < 0)) {
    throw new MigrateError(`limit 必须是非负整数，收到 ${input.limit}`, { code: 'CONFIG_ERROR' })
  }
  return {
    dbPath: input.dbPath || undefined,
    dshRoot,
    compressed,
    limit: limit && limit > 0 ? limit : null,
    since: Number.isFinite(input.since) ? input.since : null,
    until: Number.isFinite(input.until) ? input.until : null,
    cwd: input.cwd || null,
    ids: Array.isArray(input.ids) && input.ids.length ? input.ids : null,
    includeSubagents: Boolean(input.includeSubagents),
    snapshot: Boolean(input.snapshot),
    snapshotPath: input.snapshotPath || null,
    includeReasoning: input.includeReasoning !== false,
    emitTitle: input.emitTitle !== false,
    agentPreset: input.agentPreset || 'standard',
    maxToolOutputChars: Number.isFinite(input.maxToolOutputChars) ? input.maxToolOutputChars : 0,
    toolNameMap: input.toolNameMap === undefined ? undefined : input.toolNameMap,
    dryRun: Boolean(input.dryRun),
    verify: input.verify !== false,
    onProgress: typeof input.onProgress === 'function' ? input.onProgress : null,
  }
}

/**
 * Migrate zcode sessions into the dsh session store.
 *
 * @param {object} [input] - see {@link resolveOptions}; `dbPath` and `dshRoot` accept `~`.
 * @returns {Promise<object>} a structured report.
 */
export async function migrate(input = {}) {
  const options = resolveOptions(input)
  const connection = await connect({
    dbPath: options.dbPath,
    snapshot: options.snapshot,
    snapshotPath: options.snapshotPath,
  })

  const report = {
    ok: true,
    dbPath: connection.dbPath,
    snapshotPath: connection.snapshotPath,
    dshRoot: options.dshRoot,
    compressed: options.compressed,
    dryRun: options.dryRun,
    scanned: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    totals: { events: 0, messages: 0, toolResults: 0, turns: 0, bytes: 0 },
    sessions: [],
  }

  try {
    const rows = listSessions(connection.db, {
      limit: options.limit || undefined,
      since: options.since || undefined,
      until: options.until || undefined,
      cwd: options.cwd || undefined,
      ids: options.ids || undefined,
      includeSubagents: options.includeSubagents,
    })
    report.scanned = rows.length

    // Resolve parent linkage within the selected set only: a parent that is not
    // part of this run cannot be named, and naming a nonexistent session would
    // leave a dangling reference in the log.
    const selected = new Set(rows.map((row) => row.id))
    const dshIdOf = (zcodeId) => toDshSessionId(zcodeId)

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]
      const entry = {
        zcodeId: row.id,
        dshId: dshIdOf(row.id),
        title: row.title || '',
        directory: row.directory || '',
        createdAt: row.time_created,
      }
      try {
        const messages = readMessages(connection.db, row.id)
        const parentSessionId = row.parent_id && selected.has(row.parent_id) ? dshIdOf(row.parent_id) : null
        const { header, events, stats } = convertSession(row, messages, {
          toolNameMap: options.toolNameMap,
          includeReasoning: options.includeReasoning,
          emitTitle: options.emitTitle,
          agentPreset: options.agentPreset,
          maxToolOutputChars: options.maxToolOutputChars,
          parentSessionId,
          dshSessionId: entry.dshId,
        })

        if (!events.length) {
          entry.status = 'skipped'
          entry.reason = '会话没有可迁移的消息'
          report.skipped += 1
          report.sessions.push(entry)
          options.onProgress?.({ done: index + 1, total: rows.length, entry })
          continue
        }

        const contents = encodeSessionLog(header, events, { compressed: options.compressed })
        const target = sessionLogPath(options.dshRoot, header.cwd, header.id, {
          compressed: options.compressed,
        })
        entry.path = target
        entry.events = stats.events
        entry.messages = stats.messages
        entry.toolResults = stats.toolResults
        entry.turns = stats.turns
        entry.bytes = contents.length

        if (!options.dryRun) {
          writeAtomic(target, contents)
          if (options.verify) {
            const check = verifyArtifact(target, {
              compressed: options.compressed,
              expectedEvents: events.length,
              expectedId: header.id,
            })
            entry.verified = check.ok
            if (!check.ok) {
              entry.problems = check.problems
              throw new ConvertError(`迁移产物校验失败: ${check.problems.join('; ')}`)
            }
          }
        }

        entry.status = options.dryRun ? 'planned' : 'migrated'
        report.migrated += 1
        report.totals.events += stats.events
        report.totals.messages += stats.messages
        report.totals.toolResults += stats.toolResults
        report.totals.turns += stats.turns
        report.totals.bytes += contents.length
      } catch (err) {
        entry.status = 'failed'
        entry.error = err instanceof MigrateError ? { code: err.code, message: err.message } : { code: 'INTERNAL_ERROR', message: String(err && err.message) }
        report.failed += 1
        report.ok = false
      }
      report.sessions.push(entry)
      options.onProgress?.({ done: index + 1, total: rows.length, entry })
    }
  } finally {
    connection.close()
  }

  return report
}

/**
 * Inspect the zcode database and the dsh sessions root without writing.
 * @param {object} [input] - same filters as {@link migrate}.
 * @returns {Promise<object>}
 */
export async function inspect(input = {}) {
  const options = resolveOptions(input)
  const connection = await connect({
    dbPath: options.dbPath,
    snapshot: options.snapshot,
    snapshotPath: options.snapshotPath,
  })
  try {
    const counts = dbStats(connection.db)
    const rows = listSessions(connection.db, {
      limit: options.limit || undefined,
      since: options.since || undefined,
      until: options.until || undefined,
      cwd: options.cwd || undefined,
      ids: options.ids || undefined,
      includeSubagents: options.includeSubagents,
    })
    const directories = new Map()
    for (const row of rows) {
      const dir = row.directory || '(无工作目录)'
      directories.set(dir, (directories.get(dir) || 0) + 1)
    }
    // 目录是否还在：迁移本身只写会话日志（目录没了也照迁），但**归组**要靠工作区注册表，
    // 而 registry.create 要求目录真实存在。这里把存在性一并报出来，页面才能明确标注
    // 「目录已不存在（跳过登记）」——否则用户每次登记都只看到一堆 ENOENT 红字。
    const dirExists = new Map()
    const existsOf = (dir) => {
      if (dir === '' || dir === '(无工作目录)') return false
      if (!dirExists.has(dir)) dirExists.set(dir, existsSync(dir))
      return dirExists.get(dir)
    }
    return {
      ok: true,
      dbPath: connection.dbPath,
      dshRoot: options.dshRoot,
      dshRootExists: existsSync(options.dshRoot),
      runtime: { zstd: hasZstd() },
      database: counts,
      selected: rows.length,
      directories: [...directories.entries()]
        .map(([directory, sessions]) => ({ directory, sessions, exists: existsOf(directory) }))
        .sort((a, b) => b.sessions - a.sessions),
      sessions: rows.map((row) => ({
        zcodeId: row.id,
        dshId: toDshSessionId(row.id),
        title: row.title || '',
        directory: row.directory || '',
        directoryExists: existsOf(row.directory || ''),
        createdAt: row.time_created,
        parentId: row.parent_id || null,
        alreadyMigrated: existsSync(
          sessionLogPath(options.dshRoot, row.directory, toDshSessionId(row.id), {
            compressed: options.compressed,
          }),
        ),
      })),
    }
  } finally {
    connection.close()
  }
}

/**
 * Read one migrated dsh session back from disk.
 * @param {string} logPath - path to the `.jsonl.zstd` / `.jsonl` artifact.
 * @returns {{ ok: boolean, header: object|null, records: object[], frameCount: number, bytes: number }}
 */
export function readArtifact(logPath) {
  const resolved = expandPath(logPath)
  if (!existsSync(resolved)) {
    throw new MigrateError(`会话文件不存在: ${resolved}`, { code: 'NOT_FOUND' })
  }
  const buffer = readFileSync(resolved)
  const compressed = resolved.endsWith('.zstd')
  const decoded = readSessionLog(buffer, { compressed })
  return {
    ok: true,
    path: resolved,
    header: decoded.header,
    records: decoded.records,
    eventCount: Math.max(0, decoded.records.length - (decoded.header ? 1 : 0)),
    frameCount: decoded.frameCount,
    tornStart: decoded.tornStart,
    bytes: statSync(resolved).size,
  }
}
