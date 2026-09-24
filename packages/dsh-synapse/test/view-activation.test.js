import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { WorkspaceStore, apply } from '../index.js'

// view-activation.test.js — M4 按需激活三态行为矩阵。
//
// 用户诉求：「synapse 不点击会话地图窗口就不刷新」——画布是点开才活的
// 视图，关闭时不得成为主对话的后台负担。三态：
//   · 关闭态（画布未打开）：零轮询（1s 投影 poll 不存在）、零 workspaces
//     fetch、零 postMessage、零渲染；宿主侧 sessions/sync 降到 idle 窗口。
//   · 打开态：恰好一次全量追平，然后恢复 M2 的节流实时（1s poll + 合帧）。
//   · 关闭后：interval/挂起帧/定时器全部清零（防泄漏），洪水零动作；
//     静默期宿主仍在记账，重开后 catch-up 数据完整。
// 物化方式与 runtime-throttle.test.js 相同：vm 沙箱 + 手动时钟/手动 rAF。

const ORIGIN = 'http://synapse.test'

// ---------------------------------------------------------------------------
// 手动时钟（timer 落账可查，用于防泄漏断言）
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

function makeElement(overrides = {}) {
  const listeners = new Map()
  return {
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
}

const storage = () => {
  const map = new Map()
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)) }, removeItem: k => { map.delete(k) }, clear: () => map.clear() }
}

// ---------------------------------------------------------------------------
// app.js 沙箱：宿主数据可变（静默期“记账”后 updatedAt/threads 变化），
// rAF 可取消、interval 落账、外发 postMessage 落账。
// ---------------------------------------------------------------------------
async function loadApp() {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8')
  const { clock, setTimeoutImpl, clearTimeoutImpl, advance } = makeClock()
  const rafQueue = []
  let rafSeq = 0
  const flushRaf = () => { const queue = rafQueue.splice(0); for (const item of queue) if (!item.cancelled) item.fn() }
  const cancelRaf = id => { const item = rafQueue.find(entry => entry.id === id); if (item !== undefined) item.cancelled = true }
  const pendingRaf = () => rafQueue.filter(item => !item.cancelled).length
  const intervals = new Map()
  let intervalSeq = 0
  const setIntervalImpl = (fn, delay = 0) => { const id = ++intervalSeq; intervals.set(id, fn); return id }
  const clearIntervalImpl = id => { intervals.delete(id) }
  const threads = Array.from({ length: 4 }, (_, i) => ({
    id: `thread-${i}`,
    title: `q${i}`,
    dshSessionId: `sess-${i}`,
    dshSessionTitle: `会话 ${i}`,
    parentId: null,
    messages: [
      { id: `m${i}`, kind: 'user', text: `问 ${i}`, at: '2026-08-23T00:00:00.000Z', sourceSeq: 0 },
      { id: `a${i}`, kind: 'assistant', text: `答 ${i}`, at: '2026-08-23T00:00:01.000Z', sourceSeq: 1 },
    ],
  }))
  // 宿主侧投影在静默期继续演进：测试直接改 threads + 摘要 updatedAt。
  let summaryUpdatedAt = '2026-08-23T00:00:00.000Z'
  const fetchLog = []
  const postLog = []
  const documentListeners = {}
  const windowListeners = {}
  const appEl = makeElement()
  let now = 0
  const sandbox = {
    console,
    queueMicrotask,
    setTimeout: setTimeoutImpl,
    clearTimeout: clearTimeoutImpl,
    setInterval: setIntervalImpl,
    clearInterval: clearIntervalImpl,
    requestAnimationFrame: fn => { const item = { id: ++rafSeq, fn, cancelled: false }; rafQueue.push(item); return item.id },
    cancelAnimationFrame: cancelRaf,
    Date: class FakeDate extends Date { static now() { return now } },
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
        return { ok: true, status: 200, json: async () => ({ workspaces: [{ id: 'ws-1', title: 'P', cwd: '/w', createdAt: '', updatedAt: summaryUpdatedAt, threadCount: threads.length }] }) }
      }
      return { ok: true, status: 200, json: async () => ({ workspace: { id: 'ws-1', title: 'P', cwd: '/w', threads } }) }
    },
  }
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
    addEventListener: (type, fn) => { (windowListeners[type] ??= []).push(fn) },
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
  vm.runInContext(`
    const __origRender = render
    __renderCount = 0
    render = function () { __renderCount += 1; return __origRender.apply(this, arguments) }
  `, sandbox)
  const dispatch = data => { for (const fn of windowListeners.message ?? []) fn({ origin: ORIGIN, data }) }
  return {
    sandbox, appEl, threads, fetchLog, postLog, intervals, flushRaf, rafQueue: pendingRaf, advance,
    renderCount: () => Number(vm.runInContext('__renderCount', sandbox)),
    countRender: value => vm.runInContext(`__renderCount = ${value}`, sandbox),
    bumpSummary: value => { summaryUpdatedAt = value },
    dispatch,
    activate: () => dispatch({ source: 'dsh-synapse', type: 'synapse:map-opened' }),
    deactivate: () => dispatch({ source: 'dsh-synapse', type: 'synapse:map-closed' }),
    firePagehide: () => { for (const fn of windowListeners.pagehide ?? []) fn() },
    settle: async () => { for (let i = 0; i < 50; i++) await Promise.resolve() },
    pendingTimers: () => clock.timers.size,
    active: () => vm.runInContext('viewActive', sandbox),
  }
}

// ---------------------------------------------------------------------------
// app.js 状态 1：关闭态 —— 装载即静默，事件洪水零 fetch / 零渲染 / 零轮询。
// ---------------------------------------------------------------------------
test('app.js 关闭态：装载即静默，洪水下零 fetch、零渲染、零轮询、零外发消息', async () => {
  const app = await loadApp()
  await app.settle()
  assert.equal(app.active(), false, '装载后视图必须是未激活态')
  assert.equal(app.fetchLog.length, 0, '装载不得预取 workspaces 摘要')
  assert.equal(app.postLog.length, 0, '装载不得外发任何 postMessage（含 request-current）')
  assert.equal(app.renderCount(), 0, '装载不得渲染')
  assert.equal(app.intervals.size, 0, '装载不得挂 1s 投影轮询')

  const workspace = { id: 'dsh-ws', title: 'W', path: '/w', sessionIds: app.threads.map(thread => thread.dshSessionId) }
  for (let i = 0; i < 500; i++) app.dispatch({ source: 'dsh-synapse', type: 'synapse:workspaces', workspaces: [workspace] })
  for (let i = 0; i < 500; i++) app.dispatch({ source: 'dsh-synapse', type: 'synapse:current-session', session: { id: 'sess-1', title: 't', cwd: '/w' } })
  for (let i = 0; i < 1000; i++) app.dispatch({ source: 'dsh-synapse', type: 'synapse:live-reply', sessionId: `sess-${i % 4}`, running: true, text: `关闭态流 ${i}` })
  app.dispatch({ source: 'dsh-synapse', type: 'synapse:theme', dark: true })
  app.advance(10_000)
  await app.settle()
  app.flushRaf()

  assert.equal(app.fetchLog.length, 0, '关闭态事件洪水不得触发任何 fetch')
  assert.equal(app.renderCount(), 0, '关闭态事件洪水不得触发任何渲染')
  assert.equal(app.intervals.size, 0, '关闭态不得存在轮询 interval')
  assert.equal(app.rafQueue(), 0, '关闭态不得留下挂起帧')
  assert.equal(app.postLog.length, 0, '关闭态不得外发任何消息')
})

// ---------------------------------------------------------------------------
// app.js 状态 2：打开 —— 恰好一次全量追平，然后恢复节流实时。
// ---------------------------------------------------------------------------
test('app.js 打开=激活：恰好一次全量追平并挂上实时轮询', async () => {
  const app = await loadApp()
  app.activate()
  await app.settle()
  app.flushRaf()

  assert.equal(app.active(), true)
  assert.deepEqual(app.fetchLog, ['/synapse/api/workspaces', '/synapse/api/workspaces/ws-1'],
    '追平预算恰好是 1 次摘要 + 1 次当前工作区重载')
  assert.equal(app.intervals.size, 1, '激活后挂上唯一的 1s 投影轮询')
  assert.ok(app.postLog.some(message => message.type === 'synapse:request-current'), '激活时向宿主要一次桥状态')
  assert.ok(app.appEl.innerHTML.length > 100, '激活追平后应有画布 DOM')

  // 实时链路恢复：手动驱动 3 个轮询 tick，数据未变时每 tick 恰好 1 个摘要
  // fetch、零重载。
  app.countRender(0)
  for (let i = 0; i < 3; i++) {
    ;[...app.intervals.values()][0]()
    await app.settle()
  }
  assert.equal(app.fetchLog.filter(url => url === '/synapse/api/workspaces').length, 4, '3 个 tick 各拉一次摘要')
  assert.equal(app.fetchLog.filter(url => url === '/synapse/api/workspaces/ws-1').length, 1, '未变化不得重复重载工作区')
})

// ---------------------------------------------------------------------------
// app.js 状态 3：关闭后 —— 定时器/帧/interval 清零（防泄漏），之后零动作。
// ---------------------------------------------------------------------------
test('app.js 关闭=回静默：interval、挂起帧、定时器全部清零，pagehide 通知宿主', async () => {
  const app = await loadApp()
  app.activate()
  await app.settle()
  // 制造挂起工作：流式卡片补丁帧 + 合帧 render。
  app.dispatch({ source: 'dsh-synapse', type: 'synapse:live-reply', sessionId: 'sess-0', running: true, text: '流' })
  app.dispatch({ source: 'dsh-synapse', type: 'synapse:current-session', session: { id: 'sess-0', title: 't', cwd: '/w' } })
  await app.settle()
  assert.ok(app.rafQueue() >= 1, '激活期应有挂起帧（供关闭时撤销）')
  assert.equal(app.intervals.size, 1)

  app.deactivate()
  assert.equal(app.active(), false)
  assert.equal(app.intervals.size, 0, '投影轮询 interval 必须清除')
  assert.equal(app.rafQueue(), 0, '挂起 rAF 必须全部撤销')
  assert.equal(app.pendingTimers(), 0, '不得残留任何 setTimeout（防泄漏）')

  // 帧整体卸载（tab 关闭/iframe 卸载）也要通知宿主降档。
  app.firePagehide()
  assert.ok(app.postLog.some(message => message.type === 'synapse:view-unloaded'), 'pagehide 应通知宿主回静默档')

  // 关闭后洪水 + 推进时间：零 fetch、零渲染。
  const fetches = app.fetchLog.length
  const renders = app.renderCount()
  for (let i = 0; i < 500; i++) app.dispatch({ source: 'dsh-synapse', type: 'synapse:live-reply', sessionId: 'sess-0', running: true, text: `关闭后 ${i}` })
  for (let i = 0; i < 100; i++) app.dispatch({ source: 'dsh-synapse', type: 'synapse:workspaces', workspaces: [{ id: 'dsh-ws', title: 'W', path: '/w', sessionIds: app.threads.map(thread => thread.dshSessionId) }] })
  app.advance(10_000)
  await app.settle()
  app.flushRaf()
  assert.equal(app.fetchLog.length, fetches, '关闭后不得产生任何 fetch')
  assert.equal(app.renderCount(), renders, '关闭后不得产生任何渲染')
})

// ---------------------------------------------------------------------------
// app.js：关闭很久后再开 —— catch-up 必须包含静默期宿主记下的全部数据。
// ---------------------------------------------------------------------------
test('app.js 关闭很久后再开：追平包含静默期宿主记账的新数据（一致性）', async () => {
  const app = await loadApp()
  app.activate()
  await app.settle()
  app.flushRaf()
  const baselineFetches = app.fetchLog.length

  // 关闭，宿主侧继续记账（投影新增一条回答，摘要 updatedAt 前移）。
  app.deactivate()
  app.threads[0].messages.push({ id: 'late-1', kind: 'assistant', text: '静默期新答案 MARK-LATE', at: '2026-08-23T01:00:00.000Z', sourceSeq: 42 })
  app.bumpSummary('2026-08-23T01:00:00.000Z')
  for (let i = 0; i < 300; i++) app.dispatch({ source: 'dsh-synapse', type: 'synapse:live-reply', sessionId: 'sess-0', running: true, text: `静默期噪声 ${i}` })
  app.advance(60_000)
  await app.settle()
  assert.equal(app.fetchLog.length, baselineFetches, '长时间关闭期间零 fetch')

  // 重新打开：一次性追平，静默期数据完整可见。
  app.activate()
  await app.settle()
  app.flushRaf()
  assert.equal(app.fetchLog.length, baselineFetches + 2, '重开恰好再来一轮追平 fetch（摘要 + 工作区）')
  assert.equal(vm.runInContext('state.workspace.threads[0].messages.at(-1).text', app.sandbox), '静默期新答案 MARK-LATE')
  assert.ok(app.appEl.innerHTML.includes('MARK-LATE'), '重开后的渲染必须包含静默期数据')
})

// ---------------------------------------------------------------------------
// client.js 沙箱：宿主页一侧的激活信号（map-opened/map-closed + view-state）。
// ---------------------------------------------------------------------------
async function loadClient() {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const { clock, setTimeoutImpl, clearTimeoutImpl, advance } = makeClock()
  const posted = []
  const fetchCalls = []
  const documentListeners = {}
  const windowListeners = {}
  const sessionListeners = new Map()
  const sessionsListSubscribers = []
  const sessionSnapshots = new Map()
  const sessions = Array.from({ length: 2 }, (_, i) => {
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
    current: sessions[0].id,
  })
  const ctx = {
    sessions: {
      list: { getSnapshot: snapshot, subscribe: fn => { sessionsListSubscribers.push(fn); return () => {} } },
      scope: id => ({ id }),
      sessionOf: scope => sessions.find(entry => entry.id === scope.id)?.session,
      open: () => {}, fork: async () => 'forked', create: async () => 'created',
    },
    workspaces: { list: { getSnapshot: () => ({ items: [] }), subscribe: () => () => {} } },
    effect: () => {},
    logger: { warn() {}, error() {} },
  }
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
  advance(1000)
  return {
    advance, posted, fetchCalls, overlayStub, frameStub, mapButton: mapButtonStub, dialogButton: dialogButtonStub,
    triggerListChange: () => { for (const fn of sessionsListSubscribers) fn() },
    dispatchHostMessage: data => { for (const fn of windowListeners.message ?? []) fn({ origin: ORIGIN, data }) },
    viewStatePosts: () => fetchCalls.filter(call => call.url.endsWith('/synapse/api/view-state')).map(call => JSON.parse(call.body)),
    syncPosts: () => fetchCalls.filter(call => call.url.endsWith('/synapse/api/sessions/sync')).length,
  }
}

test('client.js 激活信号：boot 复位宿主档位，打开/关闭 POST active 并转发 map-opened/map-closed', async () => {
  const client = await loadClient()
  // 装载即静默：把宿主（可能在页面重载前记过 active=true）复位。
  await Promise.resolve()
  assert.deepEqual(client.viewStatePosts(), [{ active: false }], '装载时应向宿主 POST 一次静默复位')
  assert.equal(client.posted.filter(message => message.type === 'synapse:map-opened').length, 0)

  // 打开画布 = 激活。
  client.mapButton.dispatchEvent('click')
  assert.equal(client.overlayStub.hidden, false)
  assert.ok(client.posted.some(message => message.type === 'synapse:map-opened'), '打开时必须通知 iframe 激活')
  assert.deepEqual(client.viewStatePosts(), [{ active: false }, { active: true }], '打开时宿主切换快档')

  // 关闭画布（iframe 内点击「对话」按钮发 synapse:close）= 回静默。
  client.dispatchHostMessage({ source: 'dsh-synapse', type: 'synapse:close' })
  assert.equal(client.overlayStub.hidden, true)
  assert.ok(client.posted.some(message => message.type === 'synapse:map-closed'), '关闭时必须通知 iframe 停机')
  assert.deepEqual(client.viewStatePosts(), [{ active: false }, { active: true }, { active: false }], '关闭时宿主切换静默档')

  // 重复关闭幂等：不再重复 POST。
  client.dispatchHostMessage({ source: 'dsh-synapse', type: 'synapse:close' })
  assert.equal(client.viewStatePosts().length, 3)
})

test('client.js 静默期 sessions/sync 降档：idle 窗口 2s 内零 POST，到期合并补一次', async () => {
  const client = await loadClient()
  assert.equal(client.overlayStub.hidden, true, '视图未打开')
  // 时钟已预热到 t=1000（lastSyncPostAt=0）：首变化 elapsed=1000 < 2000，
  // 旧活跃窗口（500ms）会立即 leading POST——这里必须被 idle 窗口挡住。
  for (let i = 0; i < 100; i++) client.triggerListChange()
  client.advance(999)
  assert.equal(client.syncPosts(), 0, '静默期首变化后 999ms 内不得 POST（idle 窗口生效）')
  client.advance(1)
  assert.equal(client.syncPosts(), 1, 'idle 窗口到期必须补一次 POST（记账不丢）')
  // 后续变化仍按 idle 窗口合并：2s 内不再 POST。
  for (let i = 0; i < 100; i++) client.triggerListChange()
  client.advance(1999)
  assert.equal(client.syncPosts(), 1, 'idle 窗口内的新变化不得再 POST')
  client.advance(1)
  assert.equal(client.syncPosts(), 2, '到期只合并补一次')
})

test('client.js 帧重载/卸载：打开态重发 map-opened，静默态不发，view-unloaded 复位宿主档', async () => {
  const client = await loadClient()
  // 静默态帧重载：不得激活。
  client.frameStub.dispatchEvent('load')
  assert.equal(client.posted.filter(message => message.type === 'synapse:map-opened').length, 0, '视图关闭时帧重载不得发 map-opened')

  // 打开（rAF 同步执行 → map-opened；fallback 到期后 mapOpening=false）。
  client.mapButton.dispatchEvent('click')
  client.advance(300)
  // 打开态帧重载：重发 map-opened，重新激活静默启动的 iframe。
  const before = client.posted.filter(message => message.type === 'synapse:map-opened').length
  assert.equal(before, 1)
  client.frameStub.dispatchEvent('load')
  assert.equal(client.posted.filter(message => message.type === 'synapse:map-opened').length, before + 1, '打开态帧重载必须重发 map-opened')

  // iframe 卸载（pagehide）→ 宿主回静默档。
  client.dispatchHostMessage({ source: 'dsh-synapse', type: 'synapse:view-unloaded' })
  assert.deepEqual(client.viewStatePosts().at(-1), { active: false })
})

// ---------------------------------------------------------------------------
// index.js：view-state 路由 + WorkspaceStore 双档 flush。
// ---------------------------------------------------------------------------
async function mountedApi() {
  const registered = []
  const ctx = {
    on: () => () => {},
    effect: fn => { fn() },
    logger: { warn: () => {}, error: () => {} },
    sessions: { list: () => [] },
    webServer: { register: entry => { registered.push(entry) } },
  }
  const directory = await mkdtemp(join(tmpdir(), 'dsh-synapse-view-activation-'))
  const dataFile = join(directory, 'state.json')
  apply(ctx, { dataFile })
  const apiEntry = registered.find(entry => entry.path === '/synapse/api' && entry.kind === 'prefix')
  assert.ok(apiEntry !== undefined)
  return { api: apiEntry.handler, dataFile }
}

const jsonRequest = (path, body) => ({
  method: 'POST',
  url: path,
  headers: { host: 'localhost:3210' },
  [Symbol.asyncIterator]: async function* () { yield Buffer.from(JSON.stringify(body)) },
})

const captureResponse = () => {
  const response = { status: 0, body: '' }
  response.writeHead = (status, headers) => { response.status = status; response.headers = headers }
  response.end = body => { response.body = body === undefined ? '' : String(body) }
  return response
}

test('index.js view-state 路由：激活即落盘静默期待写状态，非法请求 400', async () => {
  const { api, dataFile } = await mountedApi()
  // 静默期记账：sessions/sync 是 deferred 写，落在 idle 档（2.5s）。
  const sync = captureResponse()
  await api(jsonRequest('/synapse/api/sessions/sync', { sessions: [{ id: 's1', title: '静默期会话', cwd: 'C:\\w', blank: false }], removedSessionIds: [] }), sync)
  assert.equal(sync.status, 200)
  await new Promise(resolve => setTimeout(resolve, 60))
  const silent = JSON.parse(await readFile(dataFile, 'utf8'))
  assert.ok(!silent.workspaces.some(workspace => workspace.threads.some(thread => thread.dshSessionId === 's1')),
    'idle 档窗口内不得写盘（记账暂存内存）')

  // 打开视图 → setViewActive(true) 立即 flush。
  const activate = captureResponse()
  await api(jsonRequest('/synapse/api/view-state', { active: true }), activate)
  assert.equal(activate.status, 200)
  assert.deepEqual(JSON.parse(activate.body), { viewActive: true })
  await new Promise(resolve => setTimeout(resolve, 120))
  const opened = JSON.parse(await readFile(dataFile, 'utf8'))
  assert.ok(opened.workspaces.some(workspace => workspace.threads.some(thread => thread.dshSessionId === 's1')),
    '激活必须立即落盘静默期记账，追平读到完整数据')

  // 非法 JSON → 400；GET → 404（路由只收 POST）。
  const bad = captureResponse()
  await api({ method: 'POST', url: '/synapse/api/view-state', headers: { host: 'localhost:3210' }, [Symbol.asyncIterator]: async function* () { yield Buffer.from('{oops') } }, bad)
  assert.equal(bad.status, 400)
  const get = captureResponse()
  await api({ method: 'GET', url: '/synapse/api/view-state', headers: { host: 'localhost:3210' } }, get)
  assert.equal(get.status, 404)
})

test('index.js 静默记账：idle 档合并写盘（900ms 未写），数据完整且 seq 幂等', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-synapse-silent-accounting-'))
  const dataFile = join(directory, 'state.json')
  const store = new WorkspaceStore(dataFile)
  const session = { id: 's-silent', header: { meta: { cwd: 'C:\\silent' } }, firstLiveSeq: 0 }
  for (let i = 0; i < 30; i++) {
    await store.projectEvents(session, [
      { type: 'user/message', seq: i * 2, time: i * 2, data: { content: [{ type: 'text', text: `问 ${i}` }] } },
      { type: 'assistant/message', seq: i * 2 + 1, time: i * 2 + 1, data: { turn: i + 1, step: 1, message: { content: [{ type: 'text', text: `答 ${i}` }] } } },
    ])
  }
  const before = (await stat(dataFile)).mtimeMs
  await new Promise(resolve => setTimeout(resolve, 900))
  assert.equal((await stat(dataFile)).mtimeMs, before, '静默期 900ms 内不得写盘（活跃档 800ms 会写——证明已降档）')

  // 激活：待写状态立即落盘。
  store.setViewActive(true)
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.notEqual((await stat(dataFile)).mtimeMs, before, '打开视图必须立即落盘')

  // 重开（新 store 实例模拟重启后打开画布）：60 条消息一条不少。
  const reopened = new WorkspaceStore(dataFile)
  const [workspace] = await reopened.list()
  const graph = await reopened.get(workspace.id)
  const thread = graph.threads.find(item => item.dshSessionId === 's-silent')
  assert.equal(thread.messages.length, 60, '静默期记账必须完整')
  assert.equal(thread.messages[0].text, '问 0')
  assert.equal(thread.messages.at(-1).text, '答 29')
  // seq 幂等：重放同 seq 不得重复入账。
  await reopened.projectEvents(session, [{ type: 'user/message', seq: 0, time: 0, data: { content: [{ type: 'text', text: '问 0' }] } }])
  const reloaded = await reopened.get(workspace.id)
  assert.equal(reloaded.threads.find(item => item.dshSessionId === 's-silent').messages.length, 60, '重复 seq 不得重复入账')
})
