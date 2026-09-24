// zcode CLI session store reader.
//
// zcode keeps everything in one SQLite database (default
// `~/.zcode/cli/db/db.sqlite`) with a small schema:
//
//   session  — one row per conversation (id, parent_id, directory, title, …)
//   message  — one row per role turn; `data` is JSON (role, time, finish, tokens…)
//   part     — one row per content block inside a message; `data` is JSON
//              (text / reasoning / tool / step-start / step-finish / file / …)
//
// Ordering is `(sequence, time_created, id)` — the same rule zcode's own
// exporter uses, because `sequence` alone is not guaranteed dense.
//
// Reading goes through Node's built-in `node:sqlite`, so the plugin needs no
// third-party dependency. The live database is opened read-only; when zcode is
// running, callers should take a snapshot first (see `snapshotDatabase`) so a
// concurrent WAL write cannot produce a torn read.

import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { RuntimeError, ZcodeDbError } from './errors.js'

// `node:sqlite` is exposed as a CommonJS builtin; resolve it through
// createRequire so this ESM module can load it on every supported Node version.
const require = createRequire(import.meta.url)

/** Default zcode database path. */
export const DEFAULT_DB_PATH = '~/.zcode/cli/db/db.sqlite'

/** Milliseconds a query waits on a locked database before failing. */
const BUSY_TIMEOUT_MS = 8000

/** Expand a leading `~` and resolve to an absolute path. */
export function expandPath(input) {
  if (!input) return input
  let text = String(input)
  if (text === '~') text = homedir()
  else if (text.startsWith('~/') || text.startsWith('~\\')) text = resolve(homedir(), text.slice(2))
  return resolve(text)
}

function loadSqlite() {
  try {
    return require('node:sqlite')
  } catch (err) {
    throw new RuntimeError('当前 Node 运行时没有内置的 node:sqlite 模块', {
      suggestion: '升级到 Node >= 22.5（推荐 Node 24，dsh 本身也需要它）后重试',
      cause: err,
    })
  }
}

/**
 * Open the zcode database read-only.
 * @param {string} dbPath - path to `db.sqlite` (may contain `~`).
 * @returns {import('node:sqlite').DatabaseSync}
 */
export function openDatabase(dbPath) {
  const sqlite = loadSqlite()
  const resolved = expandPath(dbPath)
  if (!existsSync(resolved)) {
    throw new ZcodeDbError(`zcode 数据库不存在: ${resolved}`, {
      suggestion: '确认 zcode CLI 已使用过（默认路径 ~/.zcode/cli/db/db.sqlite），或用 dbPath 指定实际位置',
    })
  }
  let db
  try {
    db = new sqlite.DatabaseSync(resolved, { readOnly: true })
  } catch (err) {
    throw new ZcodeDbError(`无法打开 zcode 数据库: ${resolved}`, {
      suggestion: '数据库可能被独占锁定；关闭正在运行的 zcode 后重试，或开启 snapshot 选项',
      cause: err,
    })
  }
  try {
    db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
  } catch {
    /* busy_timeout is best-effort */
  }
  return db
}

/**
 * Copy the live database to a consistent snapshot using SQLite's online backup
 * API, so a running zcode cannot tear the read.
 * @param {import('node:sqlite').DatabaseSync} db - open source database.
 * @param {string} snapshotPath - destination file (overwritten).
 * @returns {Promise<string>} the resolved snapshot path.
 */
export async function snapshotDatabase(db, snapshotPath) {
  const sqlite = loadSqlite()
  const target = expandPath(snapshotPath)
  mkdirSync(dirname(target), { recursive: true })
  if (existsSync(target)) rmSync(target, { force: true })
  try {
    await sqlite.backup(db, target)
  } catch (err) {
    throw new ZcodeDbError(`创建数据库快照失败: ${target}`, {
      suggestion: '确认目标目录可写、磁盘空间充足',
      cause: err,
    })
  }
  return target
}

/**
 * Default snapshot destination.
 *
 * Snapshots are as large as the source database (over a gigabyte on a
 * long-lived install), so the default deliberately avoids the database's own
 * directory: the caller must not leave multi-gigabyte artifacts behind in a
 * place they never asked about. `connect()` deletes what it created.
 *
 * @param {string} [dbPath] - source database path, used to name the snapshot.
 * @returns {string} an absolute path under the OS temp directory.
 */
export function defaultSnapshotPath(dbPath) {
  const stem = dbPath ? basename(dbPath).replace(/[^\w.-]+/g, '_') : 'db.sqlite'
  return join(tmpdir(), `dsh-zcode-migrate-${stem}-${process.pid}-${Date.now().toString(36)}.snapshot`)
}

/**
 * Verify the tables this migrator depends on are present.
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function assertSchema(db) {
  let names
  try {
    names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name)
  } catch (err) {
    throw new ZcodeDbError('无法读取数据库结构', { cause: err })
  }
  const missing = ['session', 'message', 'part'].filter((table) => !names.includes(table))
  if (missing.length) {
    throw new ZcodeDbError(`zcode 数据库缺少表: ${missing.join(', ')}`, {
      suggestion: '该文件可能不是 zcode 会话库（期望的表：session / message / part）',
    })
  }
}

const SESSION_COLUMNS = `id, parent_id, directory, title, task_type, version, slug, path, time_created, time_updated`

/**
 * List sessions, newest first.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} [options]
 * @param {number} [options.limit] - cap the number of sessions returned.
 * @param {number} [options.since] - only sessions created at/after this epoch ms.
 * @param {number} [options.until] - only sessions created at/before this epoch ms.
 * @param {string} [options.cwd] - only sessions whose directory matches (case-insensitive).
 * @param {string[]} [options.ids] - only these zcode session ids.
 * @param {boolean} [options.includeSubagents] - include subagent/child sessions.
 * @returns {object[]} session rows.
 */
export function listSessions(db, options = {}) {
  const { limit, since, until, cwd, ids, includeSubagents = true } = options
  const where = []
  const params = []
  if (Number.isFinite(since)) {
    where.push('time_created >= ?')
    params.push(since)
  }
  if (Number.isFinite(until)) {
    where.push('time_created <= ?')
    params.push(until)
  }
  if (cwd) {
    where.push('lower(directory) = lower(?)')
    params.push(cwd)
  }
  if (Array.isArray(ids) && ids.length) {
    where.push(`id IN (${ids.map(() => '?').join(', ')})`)
    params.push(...ids)
  }
  if (!includeSubagents) where.push('parent_id IS NULL')

  const sql = [
    `SELECT ${SESSION_COLUMNS} FROM session`,
    where.length ? `WHERE ${where.join(' AND ')}` : '',
    'ORDER BY time_created DESC',
    Number.isFinite(limit) && limit > 0 ? 'LIMIT ?' : '',
  ]
    .filter(Boolean)
    .join(' ')
  if (Number.isFinite(limit) && limit > 0) params.push(limit)

  try {
    return db.prepare(sql).all(...params)
  } catch (err) {
    throw new ZcodeDbError('查询会话列表失败', { cause: err })
  }
}

/**
 * Count sessions and messages without materializing them.
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ sessions: number, messages: number, parts: number, directories: number }}
 */
export function stats(db) {
  const one = (sql) => db.prepare(sql).get().c
  return {
    sessions: one('SELECT count(*) AS c FROM session'),
    messages: one('SELECT count(*) AS c FROM message'),
    parts: one('SELECT count(*) AS c FROM part'),
    directories: one('SELECT count(DISTINCT directory) AS c FROM session'),
  }
}

/**
 * Read one session's messages with their parts, in zcode's own order.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} sessionId - zcode session id.
 * @returns {{ id: string, data: object, timeCreated: number, parts: {data: object, timeCreated: number}[] }[]}
 */
export function readMessages(db, sessionId) {
  const messageRows = db
    .prepare(
      'SELECT id, data, time_created FROM message WHERE session_id = ? ORDER BY sequence, time_created, id',
    )
    .all(sessionId)
  const partStatement = db.prepare(
    'SELECT data, time_created FROM part WHERE message_id = ? ORDER BY sequence, time_created, id',
  )

  const messages = []
  for (const row of messageRows) {
    let data
    try {
      data = JSON.parse(row.data)
    } catch {
      continue // a malformed message row is skipped, not fatal
    }
    const parts = []
    for (const partRow of partStatement.all(row.id)) {
      try {
        parts.push({ data: JSON.parse(partRow.data), timeCreated: partRow.time_created })
      } catch {
        /* skip malformed part */
      }
    }
    messages.push({ id: row.id, data, timeCreated: row.time_created, parts })
  }
  return messages
}

/**
 * Resolve the zcode database path and open it, optionally from a snapshot.
 *
 * @param {object} options
 * @param {string} [options.dbPath] - database path (default {@link DEFAULT_DB_PATH}).
 * @param {boolean} [options.snapshot] - snapshot before reading.
 * @param {string} [options.snapshotPath] - snapshot destination.
 * @returns {Promise<{ db: object, dbPath: string, snapshotPath: string|null, close: () => void }>}
 */
export async function connect({ dbPath = DEFAULT_DB_PATH, snapshot = false, snapshotPath } = {}) {
  const resolved = expandPath(dbPath)
  let db = openDatabase(resolved)
  let usedSnapshot = null
  try {
    if (snapshot) {
      usedSnapshot = expandPath(snapshotPath || defaultSnapshotPath(resolved))
      await snapshotDatabase(db, usedSnapshot)
      db.close()
      db = openDatabase(usedSnapshot)
    }
    assertSchema(db)
  } catch (err) {
    // Never leak the handle: an open DatabaseSync keeps a lock on the file,
    // which on Windows also blocks deleting or replacing it.
    try {
      db.close()
    } catch {
      /* already closed */
    }
    removeSnapshot(usedSnapshot)
    throw err
  }
  return {
    db,
    dbPath: resolved,
    snapshotPath: usedSnapshot,
    close() {
      try {
        db.close()
      } catch {
        /* already closed */
      }
      removeSnapshot(usedSnapshot)
    },
  }
}

/** Delete a snapshot and its SQLite sidecars. Best-effort by design. */
function removeSnapshot(snapshotPath) {
  if (!snapshotPath) return
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      rmSync(`${snapshotPath}${suffix}`, { force: true })
    } catch {
      /* a leftover snapshot is not worth failing the run over */
    }
  }
}
