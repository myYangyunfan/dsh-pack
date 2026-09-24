import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { WorkspaceStore } from '../index.js'

// Mirror of the store's debounce window, for the no-op write assertions.
const SAVE_DEBOUNCE_MS = 800

const userEvent = (seq, text) => ({ type: 'user/message', seq, time: seq, data: { content: [{ type: 'text', text }] } })
const assistantEvent = (seq, text, turn, step) => ({ type: 'assistant/message', seq, time: seq, data: { turn, step, message: { content: [{ type: 'text', text }] } } })
const toolCallEvent = (seq, turn, step, callId, args) => ({ type: 'tool/call', seq, time: seq, data: { turn, step, callId, name: 'bash', arguments: args } })
const toolResultEvent = (seq, turn, step, callId, text) => ({
  type: 'tool/result', seq, time: seq,
  data: { turn, step, message: { source: { kind: 'tool', callId }, content: [{ type: 'text', text }] } },
})

function makeSession(events, extra = {}) {
  return { id: 's1', header: { meta: { cwd: 'C:\\work\\synapse' } }, firstLiveSeq: 0, events, ...extra }
}

async function projectAndPersist(store, session) {
  await store.projectSession(session)
  await store.flush()
}

test('replay resumes from the persisted watermark instead of event 0', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-synapse-watermark-'))
  const dataFile = join(directory, 'state.json')
  const events = [userEvent(0, '第一问'), assistantEvent(1, '第一答', 1, 1)]
  const session = makeSession(events)

  const first = new WorkspaceStore(dataFile)
  await projectAndPersist(first, session)

  // Restart: same store content, session grew by two more events.
  const grown = makeSession([...events, userEvent(2, '第二问'), assistantEvent(3, '第二答', 2, 1)])
  const second = new WorkspaceStore(dataFile)
  await projectAndPersist(second, grown)
  const [workspace] = await second.list()
  const graph = await second.get(workspace.id)
  const thread = graph.threads[0]
  assert.equal(thread.messages.length, 4, 'only the unprojected tail is applied')
  assert.deepEqual(thread.messages.map(message => message.text), ['第一问', '第一答', '第二问', '第二答'])
  assert.equal(thread.lastProjectedSeq, 3)
  // The watermark itself is durable state.
  const persisted = JSON.parse(await readFile(dataFile, 'utf8'))
  assert.equal(persisted.workspaces[0].threads[0].lastProjectedSeq, 3)
})

test('an up-to-date replay is a no-op: no duplicate messages and no disk write', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-synapse-noop-'))
  const dataFile = join(directory, 'state.json')
  const session = makeSession([userEvent(0, '问'), assistantEvent(1, '答', 1, 1), toolCallEvent(2, 1, 1, 'c1', '{}'), toolResultEvent(3, 1, 1, 'c1', 'ok')])

  const store = new WorkspaceStore(dataFile)
  await projectAndPersist(store, session)
  const before = (await stat(dataFile)).mtimeMs
  const messagesBefore = JSON.parse(await readFile(dataFile, 'utf8')).workspaces[0].threads[0].messages.length

  // Restart and replay the identical session list.
  const restarted = new WorkspaceStore(dataFile)
  await restarted.projectSession(session)
  await new Promise(resolve => setTimeout(resolve, SAVE_DEBOUNCE_MS + 250))
  const after = (await stat(dataFile)).mtimeMs
  assert.equal(after, before, 'a fully projected session must not trigger a write at startup')
  const persisted = JSON.parse(await readFile(dataFile, 'utf8'))
  assert.equal(persisted.workspaces[0].threads[0].messages.length, messagesBefore)
})

test('live batches at or below the watermark are rejected as duplicates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-synapse-dup-batch-'))
  const store = new WorkspaceStore(join(directory, 'state.json'))
  const session = makeSession([userEvent(0, '问'), assistantEvent(1, '答', 1, 1)])
  await projectAndPersist(store, session)
  // A redelivered batch (same seqs) must not duplicate anything.
  await store.projectEvents(session, [userEvent(0, '问'), assistantEvent(1, '答', 1, 1)])
  await store.flush()
  const [workspace] = await store.list()
  const graph = await store.get(workspace.id)
  assert.equal(graph.threads[0].messages.length, 2)
  assert.equal(graph.threads[0].lastProjectedSeq, 1)
})

test('threads written before the watermark derive their cursor from projected sourceSeq', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-synapse-legacy-cursor-'))
  const dataFile = join(directory, 'state.json')
  await writeFile(dataFile, JSON.stringify({
    version: 4,
    hiddenSessionIds: [],
    workspaces: [{
      id: 'w-1', kind: 'dsh', cwd: 'C:\\work\\synapse', title: 'synapse',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      threads: [{
        id: 't-1', title: 's', parentId: null, dshSessionId: 's1', dshSessionTitle: null,
        color: '#0f766e', position: { x: 86, y: 82 }, sourceSeedLength: null,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        messages: [
          { id: 'm-1', kind: 'user', text: '旧问题', sourceSeq: 0, at: '2026-01-01T00:00:00.000Z' },
          { id: 'm-2', kind: 'assistant', text: '旧回答', sourceSeq: 1, turn: 1, step: 1, process: [], at: '2026-01-01T00:00:00.001Z' },
        ],
      }],
    }],
  }))
  const events = [userEvent(0, '旧问题'), assistantEvent(1, '旧回答', 1, 1), userEvent(2, '新问题'), assistantEvent(3, '新回答', 2, 1)]
  const store = new WorkspaceStore(dataFile)
  await projectAndPersist(store, makeSession(events))
  const graph = await store.get('w-1')
  const thread = graph.threads[0]
  assert.deepEqual(thread.messages.map(message => message.text), ['旧问题', '旧回答', '新问题', '新回答'], 'no re-replay of pre-watermark history')
  assert.equal(thread.lastProjectedSeq, 3)
})

test('fork sessions replay only their live tail and keep it across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-synapse-fork-watermark-'))
  const dataFile = join(directory, 'state.json')
  const store = new WorkspaceStore(dataFile)
  const parent = makeSession([userEvent(0, '父问'), assistantEvent(1, '父答', 1, 1)], { id: 'parent' })
  await projectAndPersist(store, parent)
  const child = makeSession([userEvent(4, '子问'), assistantEvent(5, '子答', 2, 1)], { id: 'child', header: { parentSession: 'parent' }, firstLiveSeq: 4 })
  await projectAndPersist(store, child)

  // Restart: replay both sessions exactly as the plugin does at startup.
  const restarted = new WorkspaceStore(dataFile)
  await restarted.projectSession(parent, 0)
  await restarted.projectSession(child, child.firstLiveSeq)
  await restarted.flush()
  const [workspace] = await restarted.list()
  const graph = await restarted.get(workspace.id)
  const childThread = graph.threads.find(thread => thread.dshSessionId === 'child')
  assert.deepEqual(childThread.messages.map(message => message.text), ['子问', '子答'])
})

test('projected threads keep a bounded tail so workspaces.json stops growing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-synapse-growth-'))
  const dataFile = join(directory, 'state.json')
  const events = []
  for (let seq = 0; seq < 1_000; seq += 1) {
    events.push(userEvent(seq, `问${seq}`))
    events.push(assistantEvent(seq + 1_000, `答${seq}`, seq + 1, 1))
  }
  const store = new WorkspaceStore(dataFile)
  await projectAndPersist(store, makeSession(events))
  const [workspace] = await store.list()
  const graph = await store.get(workspace.id)
  const thread = graph.threads[0]
  assert.equal(thread.messages.length, 400, 'the projection keeps only a bounded tail')
  assert.deepEqual(thread.messages.map(message => message.text).slice(0, 2), ['问800', '答800'], 'the newest messages survive')
  assert.equal(thread.lastProjectedSeq, 1_999)
  // Restarting must not resurrect trimmed history nor duplicate the tail.
  const restarted = new WorkspaceStore(dataFile)
  await projectAndPersist(restarted, makeSession(events))
  const reGraph = await restarted.get((await restarted.list())[0].id)
  assert.equal(reGraph.threads[0].messages.length, 400)
})

test('folded tool arguments and results are capped instead of stored verbatim', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-synapse-process-cap-'))
  const store = new WorkspaceStore(join(directory, 'state.json'))
  const hugeResult = 'x'.repeat(20_000)
  const session = makeSession([
    userEvent(0, '问'),
    assistantEvent(1, '答', 1, 1),
    toolCallEvent(2, 1, 1, 'c1', 'y'.repeat(20_000)),
    toolResultEvent(3, 1, 1, 'c1', hugeResult),
  ])
  await projectAndPersist(store, session)
  const [workspace] = await store.list()
  const graph = await store.get(workspace.id)
  const entry = graph.threads[0].messages[1].process[0]
  assert.equal(entry.arguments.length, 4_000 + '\n——…（已截断）'.length)
  assert.ok(entry.arguments.endsWith('——…（已截断）'))
  assert.equal(entry.result.length, 4_000 + '\n——…（已截断）'.length)
  assert.ok(entry.result.endsWith('——…（已截断）'))
})

test('removing a DSH session prunes its archive marker from hiddenSessionIds', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-synapse-hidden-prune-'))
  const dataFile = join(directory, 'state.json')
  const store = new WorkspaceStore(dataFile)
  const session = { id: 'archived', title: '归档', cwd: 'C:\\work\\canvas', blank: false }
  await store.syncSessions([session])
  await store.flush()
  const [workspace] = await store.list()
  const graph = await store.get(workspace.id)
  await store.removeThread(graph.threads[0].id)
  await store.flush()
  assert.deepEqual(JSON.parse(await readFile(dataFile, 'utf8')).hiddenSessionIds, ['archived'])

  // DSH later confirms the session is gone: the dead marker must be dropped.
  await store.syncSessions([], ['archived'])
  await store.flush()
  assert.deepEqual(JSON.parse(await readFile(dataFile, 'utf8')).hiddenSessionIds, [])
})

test('a replay that only changes the session title still persists', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-synapse-title-persist-'))
  const dataFile = join(directory, 'state.json')
  const store = new WorkspaceStore(dataFile)
  await projectAndPersist(store, makeSession([userEvent(0, '问')]))
  const before = (await stat(dataFile)).mtimeMs
  await new Promise(resolve => setTimeout(resolve, 60))
  await store.projectSession(makeSession([userEvent(0, '问')], { title: '新标题' }))
  await store.flush()
  const after = (await stat(dataFile)).mtimeMs
  assert.notEqual(after, before)
  const graph = await store.get((await store.list())[0].id)
  assert.equal(graph.threads[0].title, '新标题')
})

test('projects a 50k-event session in a bounded, non-quadratic runtime', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-synapse-bulk-'))
  const dataFile = join(directory, 'state.json')
  const events = []
  for (let turn = 0; turn < 10_000; turn += 1) {
    const base = turn * 5
    events.push(userEvent(base, `问${turn}`))
    events.push(assistantEvent(base + 1, `答${turn}`, turn + 1, 1))
    events.push(toolCallEvent(base + 2, turn + 1, 1, `c${turn}`, '{"cmd":"ls"}'))
    events.push(toolResultEvent(base + 3, turn + 1, 1, `c${turn}`, 'ok'))
    events.push({ type: 'turn/end', seq: base + 4, time: base + 4, data: { reason: { kind: 'stop' } } })
  }
  const session = makeSession(events)
  const started = Date.now()
  const store = new WorkspaceStore(dataFile)
  await projectAndPersist(store, session)
  const firstMs = Date.now() - started

  const restartStarted = Date.now()
  const restarted = new WorkspaceStore(dataFile)
  await restarted.projectSession(session)
  await restarted.flush()
  const restartMs = Date.now() - restartStarted

  const [workspace] = await restarted.list()
  const graph = await restarted.get(workspace.id)
  assert.equal(graph.threads[0].messages.length, 400, 'tail cap holds for bulk sessions')
  assert.equal(graph.threads[0].lastProjectedSeq, 49_999)
  assert.ok(firstMs < 15_000, `initial projection of 50k events took ${firstMs}ms`)
  assert.ok(restartMs < firstMs / 2 + 50, `watermark replay (${restartMs}ms) must beat the initial projection (${firstMs}ms)`)
})
