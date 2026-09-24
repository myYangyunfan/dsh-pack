import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

// app.js is a classic browser script, so tests extract the relevant slices
// and run them inside a vm with injected time, storage, and DOM stubs —
// exactly the seams the detail-scroll code exposes.

const readSource = async () => readFile(new URL('../app.js', import.meta.url), 'utf8')

function slice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker)
  assert.ok(start !== -1, `missing marker ${startMarker}`)
  assert.ok(end > start, `missing marker ${endMarker}`)
  return source.slice(start, end)
}

async function loadPureHelpers() {
  const source = await readSource()
  const context = { globalThis: {} }
  vm.createContext(context)
  vm.runInContext(`${slice(source, 'function shouldDeferDetailRender', 'let detailRefreshTimer')};globalThis.__pure = { shouldDeferDetailRender, computeRestoreScroll, nextDetailScrollTop, readDetailScroll, writeDetailScroll, forgetDetailScroll, readPersistedDetailView, writePersistedDetailView, clearPersistedDetailView }`, context)
  return context.globalThis.__pure
}

function makeStorage({ failGet = false, failSet = false, failRemove = false } = {}) {
  const map = new Map()
  return {
    map,
    getItem: key => {
      if (failGet) throw new Error('SecurityError')
      return map.has(key) ? map.get(key) : null
    },
    setItem: (key, value) => {
      if (failSet) throw new Error('QuotaExceededError')
      map.set(key, String(value))
    },
    removeItem: key => {
      if (failRemove) throw new Error('SecurityError')
      map.delete(key)
    },
  }
}

// A DOM stub precise enough to drive the double-rAF + ResizeObserver pin.
async function loadPinMachine({ scrollHeight = 1000, clientHeight = 400, threadId = 't1', storage = makeStorage() } = {}) {
  const source = await readSource()
  class FakeHTMLElement {}
  const container = new FakeHTMLElement()
  Object.assign(container, {
    scrollTop: 0,
    dataset: { threadId },
    children: [{}, {}, {}],
    scrollHeight,
    clientHeight,
    isConnected: true,
  })
  const frames = []
  const timeouts = []
  const observers = []
  const context = {
    globalThis: {},
    HTMLElement: FakeHTMLElement,
    sessionStorage: storage,
    document: { querySelector: () => container },
    window: {
      requestAnimationFrame: callback => { frames.push(callback); return frames.length },
      clearTimeout: () => {},
      setTimeout: (callback, delay) => { timeouts.push({ callback, delay }); return timeouts.length },
    },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.observeCount = 0; this.disconnected = false; observers.push(this) }
      observe() { this.observeCount++ }
      disconnect() { this.disconnected = true }
    },
  }
  vm.createContext(context)
  const code = `${slice(source, 'function shouldDeferDetailRender', 'let detailRefreshTimer')}${slice(source, 'function safeSessionStorage', 'let persistedDetailView')};globalThis.__pure = { readDetailScroll, writeDetailScroll };globalThis.__machine = { pinDetailScroll, stopDetailScrollPin, syncDetailScrollFromElement, detailScroll, container: document.querySelector('.detail-scroll'), flags: () => ({ pending: detailPinPending, lastProgrammaticTop: detailLastProgrammaticTop }) }`
  vm.runInContext(code, context)
  return {
    ...context.globalThis.__machine,
    helpers: context.globalThis.__pure,
    flushFrame: () => frames.splice(0).forEach(callback => callback()),
    pendingFrames: () => frames.length,
    timeouts,
    observers: () => observers.at(-1),
    storage,
  }
}

test('defers event-driven renders while the user is scrolling the detail view', async () => {
  const { shouldDeferDetailRender } = await loadPureHelpers()

  assert.equal(shouldDeferDetailRender({ mode: 'thread', detailRefreshAfter: 1000 }, 500), true)
  assert.equal(shouldDeferDetailRender({ mode: 'thread', detailRefreshAfter: 0 }, 500), false)
  // A malformed gate value must fail open, never freeze the UI.
  assert.equal(shouldDeferDetailRender({ mode: 'thread', detailRefreshAfter: undefined }, 0), false)
})

test('releases the defer gate once the user stops scrolling', async () => {
  const { shouldDeferDetailRender } = await loadPureHelpers()
  const state = { mode: 'thread', detailRefreshAfter: 1000 }

  assert.equal(shouldDeferDetailRender(state, 999), true)
  assert.equal(shouldDeferDetailRender(state, 1000), false)
  assert.equal(shouldDeferDetailRender(state, 2500), false)
  assert.equal(shouldDeferDetailRender({ ...state, mode: 'canvas' }, 500), false)
})

test('never defers urgent pending-reply renders', async () => {
  const { shouldDeferDetailRender } = await loadPureHelpers()
  const state = { mode: 'thread', detailRefreshAfter: Number.MAX_SAFE_INTEGER }

  assert.equal(shouldDeferDetailRender(state, 0, true), false)
})

test('clamps restored offsets to what the container can currently show', async () => {
  const { computeRestoreScroll } = await loadPureHelpers()

  assert.equal(computeRestoreScroll({ top: 500 }, { scrollHeight: 1000, clientHeight: 400 }), 500)
  assert.equal(computeRestoreScroll({ top: 900 }, { scrollHeight: 1000, clientHeight: 400 }), 600)
  // Not yet laid out (iframe still display:none): clamp to 0, retry later.
  assert.equal(computeRestoreScroll({ top: 500 }, { scrollHeight: 0, clientHeight: 0 }), 0)
  assert.equal(computeRestoreScroll({ top: 100 }, null), 0)
  assert.equal(computeRestoreScroll({ top: 0 }, { scrollHeight: 800, clientHeight: 300 }), 0)
  assert.equal(computeRestoreScroll(null, { scrollHeight: 800, clientHeight: 300 }), null)
  assert.equal(computeRestoreScroll({ top: -5 }, { scrollHeight: 800, clientHeight: 300 }), null)
  assert.equal(computeRestoreScroll({ top: 'x' }, { scrollHeight: 800, clientHeight: 300 }), null)
  assert.equal(computeRestoreScroll({ top: Number.NaN }, { scrollHeight: 800, clientHeight: 300 }), null)
})

test('keeps the remembered offset when the programmatic restore echoes back', async () => {
  const { nextDetailScrollTop } = await loadPureHelpers()

  // Our own clamped restore (500 -> 300 because content was short) echoing
  // back must not overwrite the remembered 500.
  assert.equal(nextDetailScrollTop(500, { scrollTop: 300 }, 300), 500)
  // A genuine user scroll to a different offset is adopted.
  assert.equal(nextDetailScrollTop(500, { scrollTop: 730 }, 300), 730)
  assert.equal(nextDetailScrollTop(500, { scrollTop: 500 }, null), 500)
})

test('reads and writes per-thread scroll offsets tolerantly', async () => {
  const { readDetailScroll, writeDetailScroll, forgetDetailScroll } = await loadPureHelpers()
  const storage = makeStorage()

  writeDetailScroll(storage, 't1', 123.7)
  writeDetailScroll(storage, 't2', 40)
  // vm-realm objects never match host prototypes under deepEqual, so compare
  // the one meaningful field.
  assert.equal(readDetailScroll(storage, 't1')?.top, 124)
  assert.equal(readDetailScroll(storage, 't2')?.top, 40)
  assert.equal(readDetailScroll(storage, 'missing'), null)

  // Corrupt payloads and hostile storages degrade to "no saved offset".
  storage.map.set('dsh-synapse:detail-scroll:v1:bad', '{not json')
  assert.equal(readDetailScroll(storage, 'bad'), null)
  storage.map.set('dsh-synapse:detail-scroll:v1:shape', '{"top":"high"}')
  assert.equal(readDetailScroll(storage, 'shape'), null)
  assert.equal(readDetailScroll(makeStorage({ failGet: true }), 't1'), null)
  assert.equal(readDetailScroll(null, 't1'), null)
  assert.equal(readDetailScroll(storage, 42), null)

  // Invalid offsets are never persisted; quota errors are swallowed.
  writeDetailScroll(storage, 't1', -3)
  writeDetailScroll(storage, 't1', Number.POSITIVE_INFINITY)
  assert.equal(readDetailScroll(storage, 't1')?.top, 124)
  assert.doesNotThrow(() => writeDetailScroll(makeStorage({ failSet: true }), 't1', 10))
  assert.doesNotThrow(() => writeDetailScroll(null, 't1', 10))

  forgetDetailScroll(storage, 't1')
  assert.equal(readDetailScroll(storage, 't1'), null)
  assert.doesNotThrow(() => forgetDetailScroll(makeStorage({ failRemove: true }), 't1'))
  assert.doesNotThrow(() => forgetDetailScroll(null, 't1'))
})

test('persists the detail view selection across reloads', async () => {
  const { readPersistedDetailView, writePersistedDetailView, clearPersistedDetailView } = await loadPureHelpers()
  const storage = makeStorage()

  writePersistedDetailView(storage, { mode: 'thread', activeId: 'session-9' })
  const view = readPersistedDetailView(storage)
  assert.equal(view?.mode, 'thread')
  assert.equal(view?.activeId, 'session-9')
  clearPersistedDetailView(storage)
  assert.equal(readPersistedDetailView(storage), null)

  storage.map.set('dsh-synapse:detail-view:v1', '{oops')
  assert.equal(readPersistedDetailView(storage), null)
  storage.map.set('dsh-synapse:detail-view:v1', '{"mode":"canvas","activeId":"x"}')
  assert.equal(readPersistedDetailView(storage), null)
  assert.equal(readPersistedDetailView(makeStorage({ failGet: true })), null)
  assert.equal(readPersistedDetailView(null), null)
  assert.doesNotThrow(() => writePersistedDetailView(makeStorage({ failSet: true }), { mode: 'thread', activeId: 'x' }))
  assert.doesNotThrow(() => clearPersistedDetailView(makeStorage({ failRemove: true })))
})

test('restores after two frames and re-pins when late content grows', async () => {
  const machine = await loadPinMachine({ scrollHeight: 300, clientHeight: 400, storage: makeStorage() })
  machine.helpers.writeDetailScroll(machine.storage, 't1', 500)

  machine.pinDetailScroll()
  assert.equal(machine.flags().pending, true)
  machine.flushFrame()
  machine.flushFrame()
  // Content is still shorter than the saved offset: clamped, not restored.
  assert.equal(machine.container.scrollTop, 0)
  assert.equal(machine.observers() instanceof Object, true)
  assert.equal(machine.observers().observeCount, 4) // container plus three children
  assert.equal(machine.timeouts.at(-1).delay, 300)

  // An image finishes loading and the content grows past the saved offset.
  machine.container.scrollHeight = 1000
  machine.observers().callback()
  assert.equal(machine.container.scrollTop, 500)
  assert.equal(machine.flags().lastProgrammaticTop, 500)
  assert.equal(machine.flags().pending, false)
})

test('an event-flood render never resets the remembered offset', async () => {
  const machine = await loadPinMachine({ scrollHeight: 1000, clientHeight: 400 })
  machine.helpers.writeDetailScroll(machine.storage, 't1', 500)

  // First render enters the thread and starts a pin.
  machine.pinDetailScroll()
  // A second render lands before the restore was applied: the fresh element
  // sits at scrollTop 0, but the pin is in flight so it must not be trusted.
  machine.syncDetailScrollFromElement(machine.container)
  assert.equal(machine.detailScroll.top, 500)

  machine.flushFrame()
  machine.flushFrame()
  assert.equal(machine.container.scrollTop, 500)
  assert.equal(machine.flags().pending, false)

  // In steady state the element is trusted again: user scrolling updates.
  machine.container.scrollTop = 730
  machine.syncDetailScrollFromElement(machine.container)
  assert.equal(machine.detailScroll.top, 730)
  assert.equal(machine.helpers.readDetailScroll(machine.storage, 't1')?.top, 730)
})

test('a clamp forced by short content never overwrites the remembered offset', async () => {
  // Saved 500, but the container can only show 300 right now: the pin must
  // clamp without letting the clamped value (or its echo) become the truth.
  const machine = await loadPinMachine({ scrollHeight: 700, clientHeight: 400 })
  machine.helpers.writeDetailScroll(machine.storage, 't1', 500)

  machine.pinDetailScroll()
  machine.flushFrame()
  machine.flushFrame()
  assert.equal(machine.container.scrollTop, 300)

  // A render before the clamp's scroll echo, and the echo itself, both keep 500.
  machine.syncDetailScrollFromElement(machine.container)
  assert.equal(machine.detailScroll.top, 500)

  machine.container.scrollHeight = 2000
  machine.observers().callback()
  assert.equal(machine.container.scrollTop, 500)
  assert.equal(machine.detailScroll.top, 500)

  // A genuine user scroll away from the programmatic value is still adopted.
  machine.container.scrollTop = 90
  machine.syncDetailScrollFromElement(machine.container)
  assert.equal(machine.detailScroll.top, 90)
  assert.equal(machine.helpers.readDetailScroll(machine.storage, 't1')?.top, 90)
})

test('a superseded pin hands control to the newest restore', async () => {
  const machine = await loadPinMachine({ scrollHeight: 1000, clientHeight: 400 })
  machine.helpers.writeDetailScroll(machine.storage, 't1', 500)

  machine.pinDetailScroll()
  machine.flushFrame()
  // A newer render re-pins before the older restore applied.
  machine.pinDetailScroll()
  machine.flushFrame()
  machine.flushFrame()
  assert.equal(machine.container.scrollTop, 500)
  assert.equal(machine.flags().pending, false)

  // The stale frame chain from the first pin is dead: no further frames.
  assert.equal(machine.pendingFrames(), 0)
  machine.stopDetailScrollPin()
  assert.equal(machine.observers().disconnected, true)
})

test('enables native scroll anchoring on the detail scroll container', async () => {
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')

  assert.match(styles, /\.detail-scroll \{[^}]*overflow-anchor: auto/)
  assert.match(styles, /\.detail-scroll \{[^}]*overscroll-behavior: contain/)
  assert.match(styles, /\.detail-scroll \{[^}]*overflow-y: auto/)
})

test('gates event-driven renders on the detail defer and keeps the pending-reply bypass', async () => {
  const source = await readSource()
  const gate = slice(source, 'function canReplaceView', 'function deferCanvasRefresh')
  const liveReply = slice(source, "data.type === 'synapse:live-reply'", "if (data.type === 'synapse:forked-session'")

  assert.match(gate, /shouldDeferDetailRender\(state, Date\.now\(\)\)/)
  // Pending replies settle synchronously (urgent bypass); every other
  // stream end coalesces into one render per animation frame.
  assert.match(liveReply, /state\.pendingReplies\.has\(data\.sessionId\)\) renderPreservingDetailScroll\(\)/)
  assert.match(liveReply, /else scheduleRender\(\)/)
  assert.match(source, /function deferDetailRefresh\(delay = 700\)/)
  assert.match(source, /function scheduleRender\(\)/)
})

test('defers re-renders on wheel, touch, pointer and keyboard scrolling', async () => {
  const source = await readSource()
  const defer = slice(source, 'const detailScrollTarget', 'app.addEventListener(\'scroll\'')

  assert.match(defer, /app\.addEventListener\('wheel'/)
  assert.match(defer, /app\.addEventListener\('touchmove'/)
  assert.match(defer, /app\.addEventListener\('pointerdown'/)
  assert.match(defer, /window\.addEventListener\('keydown'/)
  assert.match(defer, /deferDetailRefresh\(\)/)
  // The composer must keep receiving keystrokes undisrupted.
  assert.match(defer, /closest\('textarea, input, select'\)/)
})

test('captures detail scroll events through #app with capture phase', async () => {
  const source = await readSource()
  const capture = slice(source, "app.addEventListener('scroll'", 'let pointerDownPosition')

  // scroll does not bubble; only a capturing listener on an ancestor sees it.
  assert.match(capture, /\}, true\)/)
  assert.match(capture, /classList\.contains\('detail-scroll'\)/)
  assert.match(capture, /nextDetailScrollTop\(/)
  assert.match(capture, /writeDetailScroll\(safeSessionStorage\(\)/)
})

test('keys the scroll container by thread and restores the persisted view after reloads', async () => {
  const source = await readSource()
  const thread = slice(source, 'function renderThread', 'function render() {')
  const render = slice(source, 'function render() {', 'function renderPreservingDetailScroll')
  const mapOpened = slice(source, "if (data.type === 'synapse:map-opened')", "if (data.type === 'synapse:theme')")

  assert.match(thread, /class="detail-scroll" data-thread-id="\$\{escapeHtml\(thread\.id\)\}"/)
  assert.match(render, /syncDetailScrollFromElement\(document\.querySelector\('\.detail-scroll'\)\)/)
  assert.match(render, /pinDetailScroll\(\)/)
  assert.match(render, /writePersistedDetailView\(safeSessionStorage\(\)/)
  assert.match(mapOpened, /restorePersistedDetailView\(\)/)
  assert.match(source, /persistedDetailView = readPersistedDetailView\(safeSessionStorage\(\)\)/)
  // Returning to the canvas explicitly forgets the saved view.
  assert.match(render, /clearPersistedDetailView\(safeSessionStorage\(\)\)/)
})
