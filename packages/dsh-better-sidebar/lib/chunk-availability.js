/**
 * chunk-availability.js — compiled mirror of src/client/chunk-availability.ts
 * (hand-kept in sync; the repo vendors the built bundle without its tsdown
 * toolchain). Pure availability probes + the injectable auto-retry loop for
 * lazy chunk loads, unit tested by
 * dsh-desktop/scripts/test/unit-better-sidebar-chunk-retry.test.js.
 *
 * Background (0.5.0 user report): while the kernel process dies/restarts,
 * the client module system is briefly missing, so a lazy chunk load threw
 * `chunk "editor": client module system unavailable` and the view stayed on
 * its manual-retry error state forever — to a user the sidebar looked
 * bricked. The loop keeps probing with exponential backoff (2s/4s/8s/…
 * capped at 30s, unlimited rounds) and wakes subscribed views when the
 * module system and chunk come back, so recovery is automatic.
 */

/** First auto-retry delay (ms) after the initial load failure. */
const CHUNK_RETRY_BASE_DELAY_MS = 2000
/** Backoff ceiling (ms) for chunk auto-retry. */
const CHUNK_RETRY_MAX_DELAY_MS = 30000

/**
 * Delay before the next auto-retry attempt: base * 2^(failedAttempts-1),
 * capped at max. `failedAttempts` counts loads that already failed
 * (1 = right after the first failure → base). Non-positive/non-finite
 * input is treated as 1 (never 0 / NaN / Infinity delay).
 */
function nextDelayMs(failedAttempts, base = CHUNK_RETRY_BASE_DELAY_MS, max = CHUNK_RETRY_MAX_DELAY_MS) {
	const n = Number.isFinite(failedAttempts) && failedAttempts >= 1 ? Math.floor(failedAttempts) : 1
	const b = Number.isFinite(base) && base > 0 ? base : CHUNK_RETRY_BASE_DELAY_MS
	const m = Number.isFinite(max) && max > 0 ? max : CHUNK_RETRY_MAX_DELAY_MS
	return Math.min(b * 2 ** (n - 1), Math.max(b, m))
}

/**
 * Whether the client module system is present with a callable import —
 * the cheap probe every retry round runs first; while it is down the
 * chunk script is not even fetched. On DSH 0.1.0-rc.8 the shell no longer
 * exposes `window.__DSH_MODULES__`; it injects the system through
 * `ctx.modules`, which the client half mirrors onto the plugin-owned
 * `__dshSidebarModuleSystem__` page global. The legacy `__DSH_MODULES__`
 * global stays a fallback for rc.7-era hosts and the test harness.
 */
function isModuleSystemAvailable(globalLike = globalThis) {
	if (globalLike === null || typeof globalLike !== "object") return false
	const modules = globalLike.__DSH_MODULES__ ?? globalLike.__dshSidebarModuleSystem__
	return typeof modules === "object" && modules !== null && typeof modules.import === "function"
}

/**
 * Whether a chunk script already executed and registered its factory on
 * the plugin-owned `__dshChunks__` registry (true → a retry only needs
 * the externals require, not a re-fetch).
 */
function isChunkRegistered(globalLike, name) {
	if (globalLike === null || typeof globalLike !== "object") return false
	return typeof globalLike.__dshChunks__?.[name] === "function"
}

/** Shared error copy for the unavailable case (load + tests assert this). */
function moduleSystemUnavailableMessage(chunk) {
	return `[dsh-better-sidebar] chunk "${chunk}": client module system unavailable`
}

/**
 * One shared auto-retry loop per chunk: exponential backoff, unlimited
 * rounds, exactly one pending timer however many views subscribe. The
 * loop self-disposes when its last subscriber unsubscribes (a view
 * unmounting can never leak a timer), on success (ready event), or via
 * dispose() (plugin HMR reset).
 *
 * Subscriber callbacks are isolated: a throwing view breaks nothing.
 */
function createChunkRetryLoop(name, options) {
	const { isAvailable = () => isModuleSystemAvailable(globalThis), attemptLoad, schedule } = options
	const timer = schedule
		?? ((fn, delayMs) => {
			const id = setTimeout(fn, delayMs)
			return () => {
				clearTimeout(id)
			}
		})
	// Starts at 1: the caller's initial load already failed once.
	let fails = 1
	let pending
	let inFlight = false
	let done = false
	const subscribers = /* @__PURE__ */ new Set()
	const emit = (event) => {
		for (const onEvent of [...subscribers]) {
			try {
				onEvent(event)
			} catch (error) {
				// A crashing subscriber (a view already torn down mid-render) must
				// not kill the loop for the remaining views.
				console.error(`[dsh-better-sidebar] chunk "${name}" retry subscriber error:`, error)
			}
		}
	}
	const cancelPending = () => {
		if (pending !== void 0) {
			pending()
			pending = void 0
		}
	}
	const scheduleProbe = () => {
		cancelPending()
		pending = timer(() => {
			void probe()
		}, nextDelayMs(fails))
	}
	const finish = () => {
		done = true
		cancelPending()
	}
	const probe = async () => {
		pending = void 0
		if (done) return
		if (!isAvailable()) {
			// Module system still down: count the round, keep the views' waiting
			// copy fresh, back off again. No script fetch is attempted yet.
			fails += 1
			emit({ attempt: fails, ready: false })
			scheduleProbe()
			return
		}
		inFlight = true
		try {
			await attemptLoad()
		} catch {
			inFlight = false
			if (done) return
			fails += 1
			emit({ attempt: fails, ready: false })
			scheduleProbe()
			return
		}
		inFlight = false
		// Success: the chunk is materialized (loadChunk memoizes it), wake every
		// view — they re-run their load effect and render without user action.
		finish()
		emit({ attempt: fails, ready: true })
	}
	return {
		subscribe(onEvent) {
			if (done) throw new Error(`[dsh-better-sidebar] chunk "${name}" retry loop already finished`)
			subscribers.add(onEvent)
			// First subscriber (or first after a manual-retry reset) arms the loop.
			if (pending === void 0 && !inFlight) scheduleProbe()
			let subscribed = true
			return () => {
				if (!subscribed) return
				subscribed = false
				subscribers.delete(onEvent)
				// Last view gone → terminal: no timer survives an unmounted view.
				if (subscribers.size === 0) finish()
			}
		},
		get active() {
			return !done
		},
		poke() {
			if (done || inFlight) return
			// Drop the pending backoff timer and probe right now (page became
			// visible again / shell reloaded — browsers throttle hidden-tab
			// timers, so the scheduled tick may still be far away).
			cancelPending()
			void probe()
		},
		dispose() {
			subscribers.clear()
			finish()
		}
	}
}

export { CHUNK_RETRY_BASE_DELAY_MS, CHUNK_RETRY_MAX_DELAY_MS, createChunkRetryLoop, isChunkRegistered, isModuleSystemAvailable, moduleSystemUnavailableMessage, nextDelayMs }
