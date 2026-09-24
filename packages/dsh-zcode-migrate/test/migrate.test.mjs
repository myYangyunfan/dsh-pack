// End-to-end tests against a synthetic zcode database.
//
// Hermetic on purpose: the suite builds its own `db.sqlite` with zcode's real
// schema, so it runs anywhere without touching the user's live zcode store.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

import { migrate, inspect, readArtifact, verifyArtifact } from '../core/migrate.js'
import { projectKey } from '../core/paths.js'
import { hasZstd } from '../core/zstdlog.js'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')

const T = 1_700_000_000_000
const CWD_A = 'C:\\work\\alpha'
const CWD_B = 'C:\\work\\beta'

/** Build a throwaway zcode database with the tables the reader depends on. */
function buildDatabase(dir) {
  const path = join(dir, 'db.sqlite')
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE session (
      id text primary key, project_id text not null, workspace_id text, parent_id text,
      slug text not null, directory text not null, path text, title text not null,
      version text not null, share_url text, summary_additions integer, summary_deletions integer,
      summary_files integer, summary_diffs text, revert text, permission text,
      time_created integer not null, time_updated integer not null, time_compacting integer,
      time_archived integer, task_type text, title_source text, title_message_id text,
      time_title_updated integer, trace_id text
    );
    CREATE TABLE message (
      id text primary key, session_id text not null, time_created integer not null,
      time_updated integer not null, data text not null, sequence integer
    );
    CREATE TABLE part (
      id text primary key, message_id text not null, session_id text not null,
      time_created integer not null, time_updated integer not null, data text not null, sequence integer
    );
  `)

  const insertSession = db.prepare(
    `INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated, task_type, parent_id)
     VALUES (?, ?, ?, ?, ?, '0.16.5', ?, ?, 'coding', ?)`,
  )
  const insertMessage = db.prepare(
    'INSERT INTO message (id, session_id, time_created, time_updated, data, sequence) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const insertPart = db.prepare(
    'INSERT INTO part (id, message_id, session_id, time_created, time_updated, data, sequence) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )

  const addMessage = (sessionId, index, id, data, parts) => {
    insertMessage.run(id, sessionId, T + index, T + index, JSON.stringify(data), index)
    parts.forEach((part, partIndex) => {
      insertPart.run(`${id}_p${partIndex}`, id, sessionId, T + index, T + index, JSON.stringify(part), partIndex)
    })
  }

  // Session A: one full turn with a tool call, plus a second turn.
  insertSession.run('sess_aaa', 'p1', 'aaa', CWD_A, 'Alpha session', T, T + 10, null)
  addMessage('sess_aaa', 0, 'a_u1', { role: 'user', time: { created: T } }, [{ type: 'text', text: 'do the thing' }])
  addMessage('sess_aaa', 1, 'a_a1', { role: 'assistant', time: { created: T + 1 }, modelID: 'm1', providerID: 'p', finish: 'tool-calls', tokens: { total: 9, input: 5, output: 4 } }, [
    { type: 'reasoning', text: 'thinking' },
    { type: 'text', text: 'on it' },
    { type: 'tool', callID: 'call_a', tool: 'Bash', state: { status: 'completed', input: { command: 'ls' }, output: 'files' } },
  ])
  addMessage('sess_aaa', 2, 'a_a2', { role: 'assistant', time: { created: T + 2 }, modelID: 'm1', providerID: 'p', finish: 'stop' }, [{ type: 'text', text: 'done' }])
  addMessage('sess_aaa', 3, 'a_u2', { role: 'user', time: { created: T + 3 } }, [{ type: 'text', text: 'again' }])
  addMessage('sess_aaa', 4, 'a_a3', { role: 'assistant', time: { created: T + 4 }, modelID: 'm1', providerID: 'p', finish: 'stop' }, [{ type: 'text', text: 'ok' }])

  // Session B: a different project directory.
  insertSession.run('sess_bbb', 'p2', 'bbb', CWD_B, 'Beta session', T + 100, T + 110, null)
  addMessage('sess_bbb', 0, 'b_u1', { role: 'user', time: { created: T + 100 } }, [{ type: 'text', text: 'beta' }])
  addMessage('sess_bbb', 1, 'b_a1', { role: 'assistant', time: { created: T + 101 }, modelID: 'm2', providerID: 'p', finish: 'stop' }, [{ type: 'text', text: 'beta reply' }])

  // Session C: a subagent child of A, in the same project.
  insertSession.run('sess_subagent_agent_ccc', 'p1', 'ccc', CWD_A, 'Subagent', T + 200, T + 210, 'sess_aaa')
  addMessage('sess_subagent_agent_ccc', 0, 'c_u1', { role: 'user', time: { created: T + 200 } }, [{ type: 'text', text: 'sub task' }])
  addMessage('sess_subagent_agent_ccc', 1, 'c_a1', { role: 'assistant', time: { created: T + 201 }, modelID: 'm1', providerID: 'p', finish: 'stop' }, [{ type: 'text', text: 'sub done' }])

  // Session D: no messages at all — must be skipped, not written.
  insertSession.run('sess_empty', 'p3', 'ddd', CWD_B, 'Empty', T + 300, T + 300, null)

  db.close()
  return path
}

function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'zcode-migrate-'))
  const dbPath = buildDatabase(dir)
  const root = join(dir, 'dsh-sessions')
  return {
    dir,
    dbPath,
    root,
    // Windows can hold a brief lock on the sqlite file after close; retry
    // rather than failing a passing test during teardown.
    cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }),
  }
}

test('migrate publishes dsh-shaped artifacts for every selected session', async () => {
  const fx = makeFixture()
  try {
    const report = await migrate({ dbPath: fx.dbPath, dshRoot: fx.root })
    assert.equal(report.ok, true)
    assert.equal(report.scanned, 3, 'subagent excluded by default')
    assert.equal(report.migrated, 2)
    assert.equal(report.skipped, 1, 'the message-less session is skipped')
    assert.equal(report.failed, 0)
    assert.ok(report.totals.events > 0)
    assert.ok(report.totals.toolResults >= 1)

    // Exact dsh layout: <root>/--<projectKey>--/<encoded id>/session.jsonl.zstd
    const expected = join(fx.root, projectKey(CWD_A), 'zcode-aaa', hasZstd() ? 'session.jsonl.zstd' : 'session.jsonl')
    assert.ok(existsSync(expected), expected)

    // Alpha's two turns and one tool result survive the round trip.
    const artifact = readArtifact(expected)
    assert.equal(artifact.header.id, 'zcode-aaa')
    assert.equal(artifact.header.cwd, CWD_A)
    assert.equal(artifact.header.version, 0)
    assert.equal(artifact.tornStart, null)
    const counts = {}
    for (const record of artifact.records) counts[record.type] = (counts[record.type] || 0) + 1
    assert.equal(counts['turn/start'], 2)
    assert.equal(counts['turn/end'], 2)
    assert.equal(counts['tool/call'], 1)
    assert.equal(counts['tool/result'], 1)
    assert.equal(counts['session/title'], 1)
    assert.equal(counts.session, 1)
  } finally {
    fx.cleanup()
  }
})

test('migration is idempotent: re-running overwrites one file per session', async () => {
  const fx = makeFixture()
  try {
    const first = await migrate({ dbPath: fx.dbPath, dshRoot: fx.root })
    const target = join(fx.root, projectKey(CWD_A), 'zcode-aaa', hasZstd() ? 'session.jsonl.zstd' : 'session.jsonl')
    const before = readFileSync(target)
    const second = await migrate({ dbPath: fx.dbPath, dshRoot: fx.root })
    const after = readFileSync(target)

    assert.equal(first.migrated, second.migrated)
    assert.deepEqual(before, after, 'deterministic output')
    const files = readdirSync(join(fx.root, projectKey(CWD_A)))
    assert.deepEqual(files.sort(), ['zcode-aaa'])
  } finally {
    fx.cleanup()
  }
})

test('subagent sessions are migrated with lineage when requested', async () => {
  const fx = makeFixture()
  try {
    const report = await migrate({ dbPath: fx.dbPath, dshRoot: fx.root, includeSubagents: true })
    assert.equal(report.scanned, 4)
    const artifact = readArtifact(join(fx.root, projectKey(CWD_A), 'zcode-subagent_agent_ccc', hasZstd() ? 'session.jsonl.zstd' : 'session.jsonl'))
    assert.equal(artifact.header.parentSession, 'zcode-aaa')
    assert.equal(artifact.header.origin, 'subagent')
    assert.equal(artifact.header.delegationDepth, 1)
  } finally {
    fx.cleanup()
  }
})

test('filters narrow the selected sessions', async () => {
  const fx = makeFixture()
  try {
    const byCwd = await migrate({ dbPath: fx.dbPath, dshRoot: fx.root, cwd: CWD_B })
    assert.deepEqual(byCwd.sessions.map((s) => s.zcodeId).sort(), ['sess_bbb', 'sess_empty'])
    assert.equal(byCwd.migrated, 1, 'the message-less session in that project is skipped')

    const byId = await migrate({ dbPath: fx.dbPath, dshRoot: fx.root, ids: ['sess_bbb'] })
    assert.equal(byId.scanned, 1)
    assert.equal(byId.migrated, 1)

    const limited = await migrate({ dbPath: fx.dbPath, dshRoot: fx.root, limit: 1 })
    assert.equal(limited.scanned, 1)
  } finally {
    fx.cleanup()
  }
})

test('dryRun reports the plan without writing anything', async () => {
  const fx = makeFixture()
  try {
    const report = await migrate({ dbPath: fx.dbPath, dshRoot: fx.root, dryRun: true })
    assert.equal(report.dryRun, true)
    assert.equal(report.migrated, 2)
    assert.equal(report.skipped, 1)
    assert.ok(report.totals.bytes > 0, 'size is still estimated')
    assert.equal(existsSync(fx.root), false, 'no directory created')
  } finally {
    fx.cleanup()
  }
})

test('verifyArtifact checks the artifact against its declared shape', async () => {
  const fx = makeFixture()
  try {
    await migrate({ dbPath: fx.dbPath, dshRoot: fx.root, ids: ['sess_bbb'] })
    const target = join(fx.root, projectKey(CWD_B), 'zcode-bbb', hasZstd() ? 'session.jsonl.zstd' : 'session.jsonl')
    const artifact = readArtifact(target)
    assert.ok(artifact.eventCount > 0)
    assert.equal(verifyArtifact(target, { compressed: hasZstd(), expectedEvents: artifact.eventCount, expectedId: 'zcode-bbb' }).ok, true)
    // A wrong event count is reported rather than silently accepted.
    const wrongCount = verifyArtifact(target, { compressed: hasZstd(), expectedEvents: artifact.eventCount + 1, expectedId: 'zcode-bbb' })
    assert.equal(wrongCount.ok, false)
    assert.ok(wrongCount.problems.some((p) => p.includes('事件数不匹配')))
    // A wrong session id is reported too.
    assert.equal(verifyArtifact(target, { compressed: hasZstd(), expectedEvents: artifact.eventCount, expectedId: 'zcode-other' }).ok, false)
    assert.equal(verifyArtifact(join(fx.root, 'nope'), { compressed: true, expectedEvents: 0, expectedId: 'x' }).ok, false)
  } finally {
    fx.cleanup()
  }
})

test('inspect reports the database, distribution and prior migrations', async () => {
  const fx = makeFixture()
  try {
    const before = await inspect({ dbPath: fx.dbPath, dshRoot: fx.root })
    assert.equal(before.database.sessions, 4)
    assert.equal(before.selected, 3)
    assert.equal(before.directories.length, 2)
    assert.equal(before.sessions.every((s) => s.alreadyMigrated === false), true)
    // 存在性预检：fixture 的 cwd 是虚构路径，逐条都要如实报 false（页面靠它决定是否
    // 显示「登记工作区」按钮），且目录级与会话级口径必须一致。
    assert.equal(before.sessions.every((s) => s.directoryExists === false), true)
    assert.equal(before.directories.every((d) => d.exists === false), true)

    await migrate({ dbPath: fx.dbPath, dshRoot: fx.root })
    const after = await inspect({ dbPath: fx.dbPath, dshRoot: fx.root })
    const migrated = after.sessions.filter((s) => s.alreadyMigrated).map((s) => s.zcodeId).sort()
    assert.deepEqual(migrated, ['sess_aaa', 'sess_bbb'])
  } finally {
    fx.cleanup()
  }
})

test('snapshotting never leaves artifacts beside the source database', async () => {
  const fx = makeFixture()
  try {
    const report = await migrate({ dbPath: fx.dbPath, dshRoot: fx.root, snapshot: true, ids: ['sess_bbb'] })

    assert.equal(report.migrated, 1)
    assert.ok(report.snapshotPath, 'a snapshot was used')
    // The snapshot must not land in the database's own directory, and must be
    // gone once the run finishes — it can be larger than the source database.
    assert.ok(!report.snapshotPath.startsWith(fx.dir), 'snapshot lives outside the db directory')
    assert.equal(existsSync(report.snapshotPath), false, 'snapshot is cleaned up')
    const dbSidecars = readdirSync(fx.dir).filter((name) => name.startsWith('db.sqlite') && name !== 'db.sqlite')
    assert.deepEqual(dbSidecars, [], 'no snapshot residue beside the database')
  } finally {
    fx.cleanup()
  }
})

test('migrate fails loudly on a database that is not a zcode store', async () => {
  const fx = makeFixture()
  try {
    const empty = join(fx.dir, 'empty.sqlite')
    const db = new DatabaseSync(empty)
    db.exec('CREATE TABLE unrelated (x integer)')
    db.close()
    await assert.rejects(() => migrate({ dbPath: empty, dshRoot: fx.root }), /缺少表/)
  } finally {
    fx.cleanup()
  }
})

test('migrate fails loudly when the database is missing', async () => {
  const fx = makeFixture()
  try {
    await assert.rejects(() => migrate({ dbPath: join(fx.dir, 'nope.sqlite'), dshRoot: fx.root }), /数据库不存在/)
  } finally {
    fx.cleanup()
  }
})
