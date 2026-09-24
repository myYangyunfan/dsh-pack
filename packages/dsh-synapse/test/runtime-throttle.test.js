import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { WorkspaceStore } from '../index.js'

// runtime-throttle.test.js — 多子代理高负载合成压力测试。
//
// 用户场景：开 20+ 子代理后客户端白屏/不稳定。这里在 vm 沙箱物化真实的
// app.js / client.js，用手动时钟 + 手动 rAF 队列注入 ≥20 个子代理的高频
// 快照/消息事件，断言渲染与推送被合并到有界速率：
//   · app.js：事件洪水期间 0 次同步全量 render，每 rAF 帧至多 1 次；
//     重复的 workspace 推送不触发任何重载 fetch；pending 回复仍同步渲染。
//   · app.js：document.hidden 暂停渲染，visibilitychange 恢复补刷。
//   · client.js：N 会话 × 高频快照回调合并为每 200ms 窗口每会话一条
//     live-reply；bridge 快照与 sessions/sync POST 有 leading+trailing 上界。
//   · index.js：单条助手消息折叠的工具记录条数有上限（内存面）。
//
// M4 之后 app.js 按需激活：装载即静默（零 fetch/零轮询/零渲染），宿主的
// synapse:map-opened 是唯一激活源。既有用例因此先 activate() 再注入事件；
// 三态（关闭/打开/关闭后）行为矩阵见 view-activation.test.js。

const ORIGIN = 'http://synapse.test'
const AGENTS = 24

// ---------------------------------------------------------------------------
// 手动时钟：setTimeout 收集到时间轮，advance() 推进并按到期顺序执行。
// ---------------------------------------------------------------------------
function makeClock() {
  const clock = { now: 0, timers: new Map(), nextId: 1 }
  const setTimeoutImpl = (fn, delay = 0) => {
    const id = clock.nextId++
    clock.timers.set(id, { fn, at: clock.now + Math.max(0, Number(delay) || 0) })
    return id
  }
  const clearTimeoutImpl = id => { clock.timers.delete(id) }
  const advance = ms => {
    const target = clock.now + ms
    for (;;) {
      let dueId = null
      let due = null
      for (const [id, timer] of clock.timers) {
        if (timer.at <= target && (due === null || timer.at < due.at)) { dueId = id; due = timer }
      }
      if (dueId === null) break
      clock.timers.delete(dueId)
      clock.now = Math.max(clock.now, due.at)
      due.fn()
    }
    clock.now = target
  }
  return { clock, setTimeoutImpl, clearTimeoutImpl, advance }
}

// ---------------------------------------------------------------------------
// 最小 DOM/浏览器环境（参考 scripts/test/ta13-soak-synapse.test.js 形态）。
// rAF 是手动队列：测试显式 flushRaf() 模拟一帧。
// ---------------------------------------------------------------------------
function makeElement(overrides = {}) {
  const listeners = new Map()
  const el = {
    children: [],
    dataset: {},
    style: {},
    scrollTop: 0, scrollHeight: 1000, clientHeight: 100,
    hidden: false,
    innerHTML: '',
    textContent: '',
    className: '',
    addEventListener(type, fn) { const list = listeners.get(type) ?? []; list.push(fn); listeners.set(type, list) },
    removeEventListener(type, fn) { const list = listeners.get(type); if (list === undefined) return; const index = list.indexOf(fn); if (index !== -1) list.splice(index, 1) },
    dispatchEvent(type, event = {}) { for (const fn of [...listeners.get(type) ?? []]) fn({ target: this, currentTarget: this, ...event }) },
    appendChild(child) { this.children.push(child); return child },
    append(child) { this.children.push(child) },
    remove() {},
    closest() { return null },
    querySelector() { return null },
    querySelectorAll() { return [] },
    getAttribute() { return null },
    setAttribute() {},
    hasAttribute() { return false },
    contains() { return false },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 } },
    focus() {},
    ...overrides,
  }
  return el
}

function makeThreads(count) {
  const at = '2026-08-23T00:00:00.000Z'
  return Array.from({ length: count }, (_, i) => ({
    id: `thread-${i}`,
    title: `q${i}`,
    dshSessionId: `sess-${i}`,
    dshSessionTitle: `会话 ${i}`,
    parentId: null,
    messages: [
      { id: `m${i}`, kind: 'user', text: `问 ${i}`, at, sourceSeq: 0 },
      { id: `a${i}`, kind: 'assistant', text: `答 ${i} ${'正文 '.repeat(60)}`, at, sourceSeq: 1 },
    ],
  }))
}

async function loadApp() {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')
  const { setTimeoutImpl, clearTimeoutImpl, advance } = makeClock()
  // rAF 句柄可取消（deactivateView 会 cancelAnimationFrame 撤掉挂起帧）。
  const rafQueue = []
  let rafSeq = 0
  const flushRaf = () => { const queue = rafQueue.splice(0); for (const item of queue) if (!item.cancelled) item.fn() }
  const cancelRaf = id => { const item = rafQueue.find(entry => entry.id === id); if (item !== undefined) item.cancelled = true }
  const pendingRaf = () => rafQueue.filter(item => !item.cancelled).length
  // setInterval 落账（M4：关闭态必须 0 个轮询 interval，关闭后必须清零）。
  const intervals = new Map()
  let intervalSeq = 0
  const setIntervalImpl = (fn, delay = 0) => { const id = ++intervalSeq; intervals.set(id, fn); return id }
  const clearIntervalImpl = id => { intervals.delete(id) }
  const storage = () => {
    const map = new Map()
    return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)) }, removeItem: k => { map.delete(k) }, clear: () => map.clear() }
  }
  const threads = makeThreads(AGENTS)
  const fetchLog = []
  const postLog = []
  const documentListeners = {}
  const messageListeners = []
  const appEl = makeElement()
  const sandbox = {
    console,
    queueMicrotask,
    setTimeout: setTimeoutImpl,
    clearTimeout: clearTimeoutImpl,
    setInterval: setIntervalImpl,
    clearInterval: clearIntervalImpl,
    requestAnimationFrame: fn => { const item = { id: ++rafSeq, fn, cancelled: false }; rafQueue.push(item); return item.id },
    cancelAnimationFrame: cancelRaf,
    Date: class FakeDate extends Date { static now() { return fakeClockNow() } },
    Math, JSON, Map, Set, Promise, Array, Object, String, Number, Boolean, Error,
    CSS: { escape: value => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&') },
    crypto: { randomUUID: () => 'u-' + Math.random().toString(36).slice(2) },
    localStorage: storage(),
    sessionStorage: storage(),
    history: { scrollRestoration: 'manual' },
    HTMLElement: function HTMLElement() {},
    HTMLTextAreaElement: function HTMLTextAreaElement() {},
    fetch: async url => {
      fetchLog.push(String(url))
      if (String(url) === '/synapse/api/workspaces') {
        return { ok: true, status: 200, json: async () => ({ workspaces: [{ id: 'ws-1', title: 'P', cwd: '/w', createdAt: '', updatedAt: '', threadCount: threads.length }] }) }
      }
      return { ok: true, status: 200, json: async () => ({ workspace: { id: 'ws-1', title: 'P', cwd: '/w', threads } }) }
    },
  }
  let now = 0
  const fakeClockNow = () => now
  const doc = {
    hidden: false,
    documentElement: makeElement(),
    body: makeElement(),
    head: makeElement(),
    querySelector: selector => (selector === '#app' ? appEl : null),
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => makeElement(),
    addEventListener: (type, fn) => { (documentListeners[type] ??= []).push(fn) },
    removeEventListener: () => {},
  }
  sandbox.document = doc
  const bridge = { postMessage: message => postLog.push(message) }
  const win = {
    location: { origin: ORIGIN, pathname: '/synapse/' },
    parent: bridge,
    addEventListener: (type, fn) => { if (type === 'message') messageListeners.push(fn) },
    removeEventListener: () => {},
    setTimeout: setTimeoutImpl,
    clearTimeout: clearTimeoutImpl,
    setInterval: setIntervalImpl,
    clearInterval: clearIntervalImpl,
    requestAnimationFrame: sandbox.requestAnimationFrame,
    cancelAnimationFrame: cancelRaf,
    postMessage: () => {},
  }
  sandbox.window = win
  sandbox.location = win.location
  sandbox.self = win
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'dsh-synapse/app.js' })
  // render 是经典脚本的顶层函数声明 → 挂在全局对象上；换成计数包装后，
  // app.js 内部所有 render() 调用点（含闭包）都会经过包装。
  vm.runInContext(`
    const __origRender = render
    __renderCount = 0
    render = function () { __renderCount += 1; return __origRender.apply(this, arguments) }
  `, sandbox)
  const countRender = value => vm.runInContext(`__renderCount = ${value}`, sandbox)
  const renderCount = () => Number(vm.runInContext('__renderCount', sandbox))
  const dispatch = data => { for (const fn of messageListeners) fn({ origin: ORIGIN, data }) }
  return {
    sandbox, appEl, threads, fetchLog, postLog, flushRaf, rafQueue: pendingRaf,
    renderCount, countRender, advance, setNow: value => { now = value },
    doc, documentListeners, intervals,
    dispatch,
    activate: async () => { dispatch({ source: 'dsh-synapse', type: 'synapse:map-opened' }) },
    deactivate: () => dispatch({ source: 'dsh-synapse', type: 'synapse:map-closed' }),
    settle: async () => { for (let i = 0; i < 50; i++) await Promise.resolve() },
    hidden: value => { doc.hidden = value },
    fireVisibilityChange: () => { for (const fn of documentListeners.visibilitychange ?? []) fn() },
  }
}

test('app.js 消息洪水：洪水期 0 次同步 render，每帧至多 1 次，重复 workspace 推送零重载', async () => {
  const app = await loadApp()
  await app.activate()
  await app.settle()
  app.flushRaf()
  app.countRender(0)
  app.fetchLog.length = 0
  assert.ok(app.appEl.innerHTML.length > 100, '激活后应有画布 DOM')

  // A. current-session 风暴：1000 条推送，帧内不渲染。
  for (let i = 0; i < 1000; i++) app.dispatch({ source: 'dsh-synapse', type: 'synapse:current-session', session: { id: 'sess-1', title: 't', cwd: '/w' } })
  assert.equal(app.renderCount(), 0, '洪水期间不得同步全量 render（旧实现每条事件渲染一次）')
  assert.ok(app.rafQueue() >= 1, '应有挂起的合帧 render')
  app.flushRaf()
  assert.equal(app.renderCount(), 1, '一帧只渲染一次')
  app.countRender(0)

  // B. workspaces 风暴：500 条相同推送只允许第一轮 reload 的 fetch。
  const workspace = { id: 'dsh-ws', title: 'W', path: '/w', sessionIds: app.threads.map(thread => thread.dshSessionId) }
  app.dispatch({ source: 'dsh-synapse', type: 'synapse:workspaces', workspaces: [workspace] })
  await app.settle()
  const reloadFetches = app.fetchLog.length
  assert.equal(reloadFetches, 1, '第一轮 reload 只应有 1 个 projection workspace GET')
  for (let i = 0; i < 499; i++) app.dispatch({ source: 'dsh-synapse', type: 'synapse:workspaces', workspaces: [workspace] })
  await app.settle()
  app.flushRaf()
  assert.equal(app.fetchLog.length, reloadFetches, '499 条重复推送不得触发任何重载 fetch')
  const rendersAfterB = app.renderCount()
  assert.ok(rendersAfterB <= 2, `重复推送期间的 render 次数应有界（实际 ${rendersAfterB}）`)
  app.countRender(0)

  // C. 流式块风暴：2000 条 running 回复，画布零全量 render。
  for (let i = 0; i < 2000; i++) app.dispatch({ source: 'dsh-synapse', type: 'synapse:live-reply', sessionId: `sess-${i % AGENTS}`, running: true, text: `流式块 ${i}` })
  assert.equal(app.renderCount(), 0, '流式块必须走卡片原位 patch，不得全量 render')
  app.flushRaf()
  assert.equal(app.renderCount(), 0)
  app.countRender(0)

  // D. 24 个会话同轮流结束：非 pending 合帧为一次 render。
  for (let i = 0; i < AGENTS; i++) app.dispatch({ source: 'dsh-synapse', type: 'synapse:live-reply', sessionId: `sess-${i}`, running: false })
  assert.equal(app.renderCount(), 0, '非 pending 的流结束应合帧，不得同步 render')
  app.flushRaf()
  assert.equal(app.renderCount(), 1, '一轮流结束合并为一次 render（旧实现 24 次）')
})

test('app.js pending 回复落定保持同步渲染（urgent 不被合帧延迟）', async () => {
  const app = await loadApp()
  await app.activate()
  await app.settle()
  app.flushRaf()
  app.countRender(0)
  vm.runInContext(`state.pendingReplies.set('sess-1', { text: '问', at: 1 })`, app.sandbox)
  app.dispatch({ source: 'dsh-synapse', type: 'synapse:live-reply', sessionId: 'sess-1', running: false })
  assert.equal(app.renderCount(), 1, '用户等待的回复完成必须立即渲染')
  assert.equal(vm.runInContext(`state.liveReplies.size`, app.sandbox), 0, '流结束仍需清理 live 状态')
})

test('app.js 页面不可见暂停渲染与轮询，visibilitychange 恢复补刷', async () => {
  const app = await loadApp()
  await app.activate()
  await app.settle()
  app.flushRaf()
  app.countRender(0)
  app.fetchLog.length = 0

  app.hidden(true)
  for (let i = 0; i < 10; i++) app.dispatch({ source: 'dsh-synapse', type: 'synapse:current-session', session: { id: 'sess-2', title: 't', cwd: '/w' } })
  app.advance(1000)
  app.flushRaf()
  assert.equal(app.renderCount(), 0, 'hidden 时合帧 render 必须跳过')

  app.hidden(false)
  app.fireVisibilityChange()
  await app.settle()
  app.flushRaf()
  assert.equal(app.renderCount(), 1, '恢复可见后补刷一次')
  assert.ok(app.fetchLog.length >= 1, '恢复可见后应立即补一次投影轮询')
})

// ---------------------------------------------------------------------------
// client.js：订阅扇入节流。物化 __ModuleLoader__ 工厂 + mock 宿主 ctx。
// ---------------------------------------------------------------------------
async function loadClient(sessionCount) {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const { clock, setTimeoutImpl, clearTimeoutImpl, advance } = makeClock()
  const posted = []
  const fetchCalls = []
  const documentListeners = {}
  const windowListeners = {}
  const sessionListeners = new Map()
  const sessionsListSubscribers = []
  const sessionSnapshots = new Map()
  const sessions = Array.from({ length: sessionCount }, (_, i) => {
    const id = `sess-${i}`
    const session = {
      getSnapshot: () => sessionSnapshots.get(id) ?? { running: false, partial: undefined },
      subscribe: fn => { const list = sessionListeners.get(id) ?? []; list.push(fn); sessionListeners.set(id, list); return () => {} },
      prompt: async () => ({ ok: true }),
    }
    sessionSnapshots.set(id, { running: false, partial: undefined })
    return { id, session }
  })
  const snapshot = () => ({
    ids: sessions.map(entry => entry.id),
    byId: Object.fromEntries(sessions.map(({ id }) => [id, { displayTitle: `会话 ${id}`, cwd: '/w', parentId: null, blank: false }])),
    current: sessions[0]?.id,
  })
  const ctx = {
    sessions: {
      list: { getSnapshot: snapshot, subscribe: fn => { sessionsListSubscribers.push(fn); return () => {} } },
      scope: id => ({ id }),
      sessionOf: () => sessions[0].session,
      open: () => {}, fork: async () => 'forked', create: async () => 'created',
    },
    workspaces: { list: { getSnapshot: () => ({ items: [] }), subscribe: () => () => {} } },
    effect: () => {},
    logger: { warn() {}, error() {} },
  }
  ctx.sessions.sessionOf = scope => sessions.find(entry => entry.id === scope.id)?.session
  const overlayStub = makeElement({ classList: { add() {}, remove() {}, toggle() {} }, hidden: true })
  const frameStub = makeElement({ contentWindow: { postMessage: message => posted.push(message) } })
  const dialogButtonStub = makeElement({ classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {} })
  const mapButtonStub = makeElement({ classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {} })
  const hostStub = makeElement({
    querySelector: selector => {
      if (selector === '[data-view="dialog"]') return dialogButtonStub
      if (selector === '[data-view="map"]') return mapButtonStub
      if (selector === '.dsh-synapse-overlay') return overlayStub
      if (selector === 'iframe') return frameStub
      return null
    },
  })
  const sandbox = {
    console, queueMicrotask,
    setTimeout: setTimeoutImpl, clearTimeout: clearTimeoutImpl,
    setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: fn => { fn(); return 0 },
    Date: class FakeDate extends Date { static now() { return clock.now } },
    Math, JSON, Map, Set, Promise, Array, Object, String, Number, Boolean, Error,
    fetch: async (url, options = {}) => { fetchCalls.push({ url: String(url), body: String(options.body ?? '') }); return { ok: true, json: async () => ({ workspaces: [] }) } },
  }
  let factoryResult = null
  const win = {
    location: { origin: ORIGIN },
    parent: {},
    __ModuleLoader__: { load: definition => { factoryResult = definition.factory() } },
    addEventListener: (type, fn) => { (windowListeners[type] ??= []).push(fn) },
    removeEventListener: () => {},
    setTimeout: setTimeoutImpl, clearTimeout: clearTimeoutImpl,
    requestAnimationFrame: sandbox.requestAnimationFrame,
  }
  const doc = {
    hidden: false,
    documentElement: makeElement(),
    body: makeElement({ hasAttribute: () => false }),
    head: makeElement(),
    createElement: tag => (tag === 'div' ? hostStub : makeElement()),
    addEventListener: (type, fn) => { (documentListeners[type] ??= []).push(fn) },
    removeEventListener: () => {},
    querySelector: () => hostStub,
  }
  sandbox.window = win
  sandbox.document = doc
  sandbox.location = win.location
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'dsh-synapse/client.js' })
  factoryResult.apply(ctx)
  // 预热时钟：真实浏览器里插件装载已久（Date.now() 远大于 0），leading
  // 分支因此可用；假钟从 0 开始会让首次触发看起来落在窗口内。
  advance(1000)
  const emit = (id, snapshotValue) => {
    sessionSnapshots.set(id, snapshotValue)
    for (const fn of sessionListeners.get(id) ?? []) fn()
  }
  return {
    advance, posted, fetchCalls, overlayStub, frameStub, documentListeners,
    mapButton: mapButtonStub, dialogButton: dialogButtonStub, windowListeners,
    triggerListChange: () => { for (const fn of sessionsListSubscribers) fn() },
    emit,
    sessionIds: sessions.map(entry => entry.id),
    setHidden: value => { doc.hidden = value },
    fireVisibilityChange: () => { for (const fn of documentListeners.visibilitychange ?? []) fn() },
    dispatchHostMessage: data => { for (const fn of windowListeners.message ?? []) fn({ origin: ORIGIN, data }) },
    viewStatePosts: () => fetchCalls.filter(call => call.url.endsWith('/synapse/api/view-state')).map(call => JSON.parse(call.body)),
    syncPosts: () => fetchCalls.filter(call => call.url.endsWith('/synapse/api/sessions/sync')).length,
  }
}

test('client.js live 扇入：24 会话 × 100 快照回调合并为每窗口每会话一条 live-reply', async () => {
  const client = await loadClient(AGENTS)
  client.overlayStub.hidden = false
  client.triggerListChange()
  await Promise.resolve()
  const liveBefore = client.posted.filter(message => message.type === 'synapse:live-reply').length
  assert.equal(liveBefore, 0, '订阅建立期不发流式消息')

  for (let round = 0; round < 100; round++) {
    for (const id of client.sessionIds) {
      client.emit(id, { running: true, partial: { blocks: [{ kind: 'text', text: `块 ${round}` }] } })
    }
  }
  assert.equal(client.posted.filter(message => message.type === 'synapse:live-reply').length, 0, '窗口内 2400 次快照回调不得逐条转发（旧实现 2400 条 postMessage）')
  client.advance(200)
  const flushed = client.posted.filter(message => message.type === 'synapse:live-reply')
  assert.equal(flushed.length, AGENTS, '一个窗口只发每会话最新一条')
  assert.ok(flushed.every(message => message.text === '块 99'), '转发的是每会话的最新快照')
})

test('client.js bridge 快照与 sessions/sync POST 有 leading+trailing 上界', async () => {
  const client = await loadClient(AGENTS)
  client.overlayStub.hidden = false
  client.triggerListChange()
  await Promise.resolve()
  const bridgeAfterOpen = client.posted.filter(message => message.type === 'synapse:workspaces' || message.type === 'synapse:current-session').length
  assert.equal(bridgeAfterOpen, 2, '打开时 leading 立即发送 workspaces + current-session')
  const syncAfterOpen = client.fetchCalls.filter(call => call.url.endsWith('/sessions/sync')).length
  assert.equal(syncAfterOpen, 1, '首次变化 leading microtask 立即 POST')

  for (let i = 0; i < 100; i++) client.triggerListChange()
  await Promise.resolve()
  client.advance(600)
  const bridgeTotal = client.posted.filter(message => message.type === 'synapse:workspaces' || message.type === 'synapse:current-session').length
  assert.ok(bridgeTotal <= 4, `100 次列表变化后 bridge 消息应有界（实际 ${bridgeTotal}）`)
  const syncTotal = client.fetchCalls.filter(call => call.url.endsWith('/sessions/sync')).length
  assert.ok(syncTotal <= 3, `100 次列表变化后 sync POST 应有界（实际 ${syncTotal}）`)
})

test('client.js 页面不可见暂停流式转发，恢复可见时补发', async () => {
  const client = await loadClient(AGENTS)
  client.overlayStub.hidden = false
  client.triggerListChange()
  await Promise.resolve()
  client.advance(600)

  client.setHidden(true)
  for (const id of client.sessionIds) client.emit(id, { running: true, partial: { blocks: [{ kind: 'text', text: 'hidden 块' }] } })
  client.advance(2000)
  assert.equal(client.posted.filter(message => message.type === 'synapse:live-reply').length, 0, 'hidden 期间不得堆流式消息')

  client.setHidden(false)
  client.fireVisibilityChange()
  await Promise.resolve()
  client.advance(400)
  const flushed = client.posted.filter(message => message.type === 'synapse:live-reply')
  assert.equal(flushed.length, AGENTS, '恢复可见后每会话补发最新一条')
})

test('index.js 折叠工具记录条数有上限，最新的调用与结果保留', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-synapse-throttle-'))
  const store = new WorkspaceStore(join(directory, 'state.json'))
  const events = [
    { type: 'assistant/message', seq: 0, time: 1, data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: '长任务' }] } } },
  ]
  for (let i = 1; i <= 200; i++) {
    events.push({ type: 'tool/call', seq: i * 2 - 1, time: i, data: { turn: 1, step: 1, callId: `c${i}`, name: 'bash', arguments: `{"cmd":"run ${i}"}` } })
    events.push({ type: 'tool/result', seq: i * 2, time: i, data: { turn: 1, step: 1, message: { source: { callId: `c${i}` }, content: [{ type: 'text', text: `r${i}` }] } } })
  }
  const session = { id: 'session-tool-storm', header: { meta: { cwd: 'C:\\storm' } }, firstLiveSeq: 0, events }
  await store.projectSession(session)
  const [workspace] = await store.list()
  const graph = await store.get(workspace.id)
  const thread = graph.threads.find(item => item.dshSessionId === 'session-tool-storm')
  const process = thread.messages.find(message => message.kind === 'assistant').process
  assert.ok(process.length <= 120, `400 个工具事件折叠后条目应有界（实际 ${process.length}）`)
  assert.ok(process.some(entry => entry.callId === 'c200' && entry.result === 'r200'), '最新的调用与结果必须保留')
  assert.ok(process.some(entry => entry.callId === 'c199' && entry.result === 'r199'), '次新的调用与结果必须保留')
})
