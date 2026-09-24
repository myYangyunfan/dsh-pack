// Hermetic tests for the host-side HTTP surface (the settings page's only backend).
//
// 这些用例刻意自己造一个最小 zcode 库（与 migrate.test.mjs 同 schema），全程只碰临时
// 目录 —— 不读真实 ~/.zcode，也不写真实 ~/.dsh。
//
// 覆盖：Host 信任（DNS rebinding 防线）、方法/路径/参数校验、inspect→migrate→inspect
// 的端到端（HTTP 面本身，而不是直接调 core），以及「请求体不得改落点」这条不变量。

import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { API_PREFIX, createApiHandler } from '../src/rpc.js'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')

const T = 1_760_000_000_000
const CWD = 'C:\\Users\\tester\\Desktop\\proj'

/** 最小 zcode 库：一个完整会话 + 一个空会话（后者应被跳过）。 */
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
  insertSession.run('sess_rpc1', 'p1', 'rpc1', CWD, 'RPC session', T, T + 10, null)
  insertMessage.run('r1_u1', 'sess_rpc1', T, T, JSON.stringify({ role: 'user', time: { created: T } }), 0)
  insertPart.run('r1_u1_p0', 'r1_u1', 'sess_rpc1', T, T, JSON.stringify({ type: 'text', text: 'hi' }), 0)
  insertMessage.run('r1_a1', 'sess_rpc1', T + 1, T + 1, JSON.stringify({ role: 'assistant', time: { created: T + 1 }, modelID: 'm', providerID: 'p', finish: 'stop' }), 1)
  insertPart.run('r1_a1_p0', 'r1_a1', 'sess_rpc1', T + 1, T + 1, JSON.stringify({ type: 'text', text: 'hello' }), 0)
  insertSession.run('sess_rpc_empty', 'p1', 'rpcE', CWD, 'Empty', T + 5, T + 5, null)
  db.close()
  return path
}

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'zcode-rpc-'))
  return {
    dbPath: buildDatabase(dir),
    root: join(dir, 'sessions'),
    cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }),
  }
}

/** Fake IncomingMessage：按需触发 data/end。 */
function mockReq({ method = 'POST', path, host = '127.0.0.1', body = {} } = {}) {
  const listeners = {}
  const payload = Buffer.from(JSON.stringify(body))
  const req = {
    method,
    url: path,
    headers: { host },
    on(event, cb) {
      ;(listeners[event] ??= []).push(cb)
      return req
    },
  }
  queueMicrotask(() => {
    for (const cb of listeners.data ?? []) cb(payload)
    for (const cb of listeners.end ?? []) cb()
  })
  return req
}

/** Fake ServerResponse：记录状态码与 JSON 体。 */
function mockRes() {
  const res = {
    status: null,
    headers: null,
    body: null,
    writeHead(status, headers) {
      res.status = status
      res.headers = headers
    },
    end(text) {
      res.body = text === undefined || text === '' ? null : JSON.parse(text)
    },
  }
  return res
}

async function call(handler, options) {
  const res = mockRes()
  await handler(mockReq(options), res)
  return res
}

test('Host 信任：非本机 Host 一律 403（这条路由能往会话目录写文件）', async () => {
  const handler = createApiHandler({ dbPath: 'x', dshRoot: 'y' })
  for (const host of ['evil.example', 'dsh.local', '10.0.0.7:1234']) {
    const res = await call(handler, { path: `${API_PREFIX}/inspect`, host })
    assert.equal(res.status, 403, `${host} 必须被拒`)
  }
  for (const host of ['127.0.0.1:54221', 'localhost', 'LOCALHOST:1']) {
    const res = await call(handler, { path: '/nope', host })
    assert.notEqual(res.status, 403, `${host} 必须放行（进到路由判定）`)
  }
})

test('方法与路径校验：GET → 405，未知路径 → 404，verify 缺参 → 400', async () => {
  const handler = createApiHandler({ dbPath: 'x', dshRoot: 'y' })
  assert.equal((await call(handler, { method: 'GET', path: `${API_PREFIX}/inspect` })).status, 405)
  assert.equal((await call(handler, { path: `${API_PREFIX}/whatever` })).status, 404)
  assert.equal((await call(handler, { path: `${API_PREFIX}/verify`, body: {} })).status, 400)
})

test('inspect → migrate(dryRun) → migrate → inspect：HTTP 面端到端', async () => {
  const fx = fixture()
  try {
    const handler = createApiHandler({ dbPath: fx.dbPath, dshRoot: fx.root })

    const first = await call(handler, { path: `${API_PREFIX}/inspect` })
    assert.equal(first.status, 200)
    assert.equal(first.body.ok, true)
    assert.equal(first.body.selected, 2, '空会话也在清单里（迁移时才跳过）')
    const target = first.body.sessions.find((s) => s.zcodeId === 'sess_rpc1')
    assert.equal(target.alreadyMigrated, false, '尚未迁移')
    assert.equal(target.directory, CWD)
    // 存在性随侦察一起报出：页面靠它标注「目录已不存在」并藏掉登记按钮（fixture 里的
    // CWD 是虚构路径，必须如实为 false；不存在时不许瞎猜成 true）。
    assert.equal(target.directoryExists, false, '虚构目录必须报不存在')
    assert.equal(first.body.directories.find((d) => d.directory === CWD).exists, false, '目录级也要带 exists')

    const dry = await call(handler, { path: `${API_PREFIX}/migrate`, body: { ids: ['sess_rpc1'], dryRun: true } })
    assert.equal(dry.status, 200)
    assert.equal(dry.body.dryRun, true)
    assert.equal(existsSync(fx.root) && readdirSync(fx.root).length > 0, false, '预演不得写盘')

    const real = await call(handler, { path: `${API_PREFIX}/migrate`, body: { ids: ['sess_rpc1'] } })
    assert.equal(real.status, 200)
    assert.equal(real.body.migrated, 1, '真迁写出一份产物')

    const after = await call(handler, { path: `${API_PREFIX}/inspect` })
    assert.equal(after.body.sessions.find((s) => s.zcodeId === 'sess_rpc1').alreadyMigrated, true, '再侦察应标记已迁移')
  } finally {
    fx.cleanup()
  }
})

test('请求体不得改落点（dbPath/dshRoot 只认插件 config）', async () => {
  const fx = fixture()
  try {
    const handler = createApiHandler({ dbPath: fx.dbPath, dshRoot: fx.root })
    const res = await call(handler, {
      path: `${API_PREFIX}/inspect`,
      body: { dbPath: 'C:\\evil\\db.sqlite', dshRoot: 'C:\\evil\\sessions' },
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.dbPath, fx.dbPath, 'dbPath 必须来自 config')
    assert.equal(res.body.dshRoot, fx.root, 'dshRoot 必须来自 config')
  } finally {
    fx.cleanup()
  }
})

test('verify：产物路径存在/缺失两种结果都走 200 且带 ok 字段', async () => {
  const fx = fixture()
  try {
    const handler = createApiHandler({ dbPath: fx.dbPath, dshRoot: fx.root })
    await call(handler, { path: `${API_PREFIX}/migrate`, body: { ids: ['sess_rpc1'] } })
    const dir = readdirSync(fx.root)[0]
    const idDir = readdirSync(join(fx.root, dir))[0]
    const files = readdirSync(join(fx.root, dir, idDir))
    const artifact = join(fx.root, dir, idDir, files[0])

    const good = await call(handler, { path: `${API_PREFIX}/verify`, body: { path: artifact } })
    assert.equal(good.status, 200)
    assert.equal(good.body.ok, true, '刚写出的产物必须能被回读')

    const missing = await call(handler, { path: `${API_PREFIX}/verify`, body: { path: join(fx.root, 'nope.jsonl.zstd') } })
    assert.equal(missing.status, 200)
    assert.equal(missing.body.ok, false, '缺失文件返回 ok:false 而不是 500')
  } finally {
    fx.cleanup()
  }
})

test('workspaces：登记真实目录 + 把会话挂进工作区，目录没了 → skipped（不碰注册表）', async () => {
  // 注册表要求目录真实存在，所以成功路径必须用**真实临时目录**（曾经的用例拿
  // 'C:/a/proj-a' 这种假路径当成功样例，一旦加上存在性预检就会全线变 skipped）。
  const root = mkdtempSync(join(tmpdir(), 'zcode-ws-'))
  const realA = join(root, 'proj-a')
  const realB = join(root, 'proj-boom')
  mkdirSync(realA)
  mkdirSync(realB)
  const gone = join(root, 'deleted-long-ago')

  const creates = []
  const attaches = []
  const registry = {
    async create(dir, title) {
      creates.push({ dir, title })
      if (dir.includes('boom')) throw new Error('目录不存在')
      return {
        id: 'ws-' + title,
        title,
        // 只有挂上去的会话才会出现在工作区里 —— 光 create 出来的是**空**工作区
        // （用户实报「迁移后也没到工作区」的根因）。
        async attachSession(sessionId) {
          attaches.push({ dir, sessionId })
          if (sessionId.includes('bad')) throw new Error(`会话头的 cwd 已失效`)
        },
      }
    },
  }
  const handler = createApiHandler({ dbPath: 'x', dshRoot: 'y' }, { workspaceRegistry: registry })

  const ok = await call(handler, {
    path: `${API_PREFIX}/workspaces`,
    body: {
      groups: [
        { directory: realA, sessionIds: ['zcode-a1', 'zcode-bad', 'zcode-a2'] },
        { directory: realB, sessionIds: ['zcode-b1'] },
        gone,
      ],
    },
  })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.ok, true, '请求成功即 ok:true，逐条成败在 results 里')
  assert.deepEqual(creates, [{ dir: realA, title: 'proj-a' }, { dir: realB, title: 'proj-boom' }], '标题取末级目录名')
  // 每个会话都要试着挂进它目录的工作区；proj-boom 的 create 就失败了，所以它的会话不该被 attach。
  assert.deepEqual(attaches.map((a) => a.sessionId), ['zcode-a1', 'zcode-bad', 'zcode-a2'])
  assert.equal(ok.body.results[0].ok, true)
  assert.equal(ok.body.results[0].id, 'ws-proj-a')
  assert.equal(ok.body.results[0].attached, 2, '成功挂上 2 条')
  assert.equal(ok.body.results[0].attachFailed.length, 1, '挂不上的逐条上报，不吞')
  assert.equal(ok.body.results[0].attachFailed[0].sessionId, 'zcode-bad')
  assert.match(ok.body.results[0].attachFailed[0].error, /cwd 已失效/)
  assert.equal(ok.body.results[1].ok, false, '注册表抛错 → 真失败')
  assert.match(ok.body.results[1].error, /目录不存在/)
  // 目录已不存在：报 skipped（不是失败），且**根本不碰注册表** —— 这是「别每次登记都刷
  // 一排 ENOENT」的关键，否则页面又变成满屏红字。
  assert.equal(ok.body.results[2].ok, false)
  assert.equal(ok.body.results[2].skipped, true, '不存在的目录标记为 skipped')
  assert.match(ok.body.results[2].reason, /目录已不存在/)
  assert.equal(ok.body.results[2].error, undefined, 'skipped 不带 error，页面才能与真失败分开渲染')

  // 兼容旧的 `directories: string[]`（只登记、不带会话）
  const legacy = await call(handler, { path: `${API_PREFIX}/workspaces`, body: { directories: [realA] } })
  assert.equal(legacy.body.results[0].ok, true)
  assert.equal(legacy.body.results[0].attached, 0)

  // 缺参数 → 400；服务缺席 → ok:false 且说明原因（不许假装成功）
  assert.equal((await call(handler, { path: `${API_PREFIX}/workspaces`, body: {} })).status, 400)
  const noRegistry = createApiHandler({ dbPath: 'x', dshRoot: 'y' })
  const degraded = await call(noRegistry, { path: `${API_PREFIX}/workspaces`, body: { groups: [{ directory: realA, sessionIds: ['zcode-a1'] }] } })
  assert.equal(degraded.status, 200)
  assert.equal(degraded.body.results[0].ok, false)
  assert.match(degraded.body.results[0].error, /工作区服务不可用/)
  rmSync(root, { recursive: true, force: true })
})
