window.__ModuleLoader__.load({
  id: 'dsh-synapse',
  factory: () => {
    // DSH Desktop 深色适配桥（0.6.3 第三案）：内核深色标志是 body[data-ds-dark-theme]
    // （dsh-client-ui-theme 服务维护，切换整套 --dsw-* token），而本插件的 dark 规则
    // 挂在 [data-theme="dark"] 上——上游没有任何代码设置它，深色宿主下本画布恒浅色
    // 渲染（白块）。镜像属性到 <html> 并跟随切换，让上游 dark 样式真正生效。
    (() => {
      const sync = () => {
        const dark = document.body && document.body.hasAttribute('data-ds-dark-theme');
        const root = document.documentElement;
        const want = dark ? 'dark' : 'light';
        if (root.getAttribute('data-theme') !== want) root.setAttribute('data-theme', want);
      };
      try { sync(); } catch {}
      if (typeof MutationObserver !== 'undefined' && document.body) {
        new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
      } else {
        document.addEventListener('DOMContentLoaded', sync, { once: true });
      }
    })();
    const module = { exports: {} }
    const currentSession = ctx => {
      const snapshot = ctx.sessions.list.getSnapshot()
      const id = snapshot.current
      if (id === undefined) return null
      const session = snapshot.byId[id]
      return session === undefined ? null : { id, title: session.displayTitle, cwd: session.cwd ?? null }
    }
    const sessionSnapshot = ctx => {
      const snapshot = ctx.sessions.list.getSnapshot()
      return snapshot.ids.map(id => {
        const session = snapshot.byId[id]
        return session === undefined ? null : { id, title: session.displayTitle, cwd: session.cwd ?? null, parentId: session.parentId ?? null, blank: session.blank }
      }).filter(Boolean)
    }
    const workspaceSnapshot = ctx => {
      const sessions = ctx.sessions.list.getSnapshot()
      const snapshot = ctx.workspaces.list.getSnapshot()
      const accounted = new Set(snapshot.items.flatMap(workspace => workspace.sessionIds))
      return [
        ...snapshot.items.map(workspace => ({ id: workspace.workspaceId, title: workspace.title, path: workspace.path, sessionIds: workspace.sessionIds })),
        { id: 'dsh-ungrouped', title: '未分组', path: null, sessionIds: sessions.ids.filter(id => !accounted.has(id)) },
      ]
    }

    module.exports.inject = ['sessions', 'workspaces']
    module.exports.apply = ctx => {
      const prompt = async (sessionId, text) => {
        const scope = ctx.sessions.scope(sessionId)
        const session = scope === undefined ? undefined : ctx.sessions.sessionOf(scope)
        if (session === undefined) throw new Error('关联的 DSH 会话已不可用')
        const result = await session.prompt([{ type: 'text', text }], 'queue')
        if (!result.ok) throw new Error(result.error?.message ?? 'DSH 未接受这条消息')
      }
      const style = document.createElement('style')
      style.textContent = '.dsh-synapse-switch{position:fixed;z-index:80;top:12px;left:50%;display:flex;gap:2px;transform:translateX(-50%);border:1px solid #d1d5db;border-radius:999px;background:rgba(255,255,255,.96);padding:3px;backdrop-filter:blur(10px)}.dsh-synapse-switch button{height:28px;border:0;border-radius:999px;background:transparent;padding:0 11px;color:#6b7280;font:600 12px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}.dsh-synapse-switch button:hover{background:#f3f4f6;color:#111827}.dsh-synapse-switch button.active{background:#111827;color:#fff}.dsh-synapse-switch button:focus-visible{outline:2px solid #111827;outline-offset:2px}.dsh-synapse-overlay{position:fixed;z-index:100;inset:0;background:#f5f7fa}.dsh-synapse-overlay.is-opening{visibility:hidden}.dsh-synapse-overlay[hidden]{display:none}.dsh-synapse-overlay iframe{display:block;width:100%;height:100%;border:0}'
      document.head.append(style)
      const host = document.createElement('div')
      host.className = 'dsh-synapse-host'
      host.innerHTML = '<div class="dsh-synapse-switch" role="group" aria-label="视图切换"><button type="button" data-view="dialog" class="active" aria-pressed="true">对话</button><button type="button" data-view="map" aria-pressed="false">会话地图</button></div><section class="dsh-synapse-overlay" hidden><iframe title="会话地图" src="/synapse/"></iframe></section>'
      document.body.append(host)
      const dialogButton = host.querySelector('[data-view="dialog"]')
      const mapButton = host.querySelector('[data-view="map"]')
      const overlay = host.querySelector('.dsh-synapse-overlay')
      const frame = host.querySelector('iframe')

      const setView = view => {
        const showingMap = view === 'map'
        dialogButton.classList.toggle('active', !showingMap)
        dialogButton.setAttribute('aria-pressed', String(!showingMap))
        mapButton.classList.toggle('active', showingMap)
        mapButton.setAttribute('aria-pressed', String(showingMap))
      }
      const close = () => {
        window.clearTimeout(mapOpenFallback)
        mapOpening = false
        overlay.classList.remove('is-opening')
        overlay.hidden = true
        setView('dialog')
        // M4: tell the freshly hidden iframe to tear its runtime down (stop
        // polling, clear timers) and shift the node-side host back to the
        // silent flush cadence.
        send('synapse:map-closed')
        postViewState(false)
      }
      const send = (type, payload) => { frame.contentWindow?.postMessage({ source: 'dsh-synapse', type, ...payload }, location.origin) }
      // --- M4 view-activation signal -----------------------------------------
      // The canvas view is on demand: while it stays closed the iframe runs
      // silent and the node-side host relaxes its workspaces.json flush
      // cadence. viewStateActive starts unknown (null) so boot re-syncs a
      // host that still remembers active=true from before a host-page reload.
      let viewStateActive = null
      const postViewState = active => {
        if (viewStateActive === active) return
        viewStateActive = active
        void fetch('/synapse/api/view-state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active }) }).catch(() => {})
      }
      // --- push-path throttles -------------------------------------------------
      // One subscription per session × N streaming subagents means the raw
      // fan-out below fires many times per token batch. All pushes into the
      // map iframe go through time-windowed fan-ins so the iframe's render
      // scheduler receives bounded batches instead of an event storm.
      const LIVE_FLUSH_MS = 200
      const BRIDGE_FLUSH_MS = 300
      const SESSION_SYNC_MIN_INTERVAL_MS = 500
      // M4: with no view open the sessions/sync POST is pure host-side
      // bookkeeping (workspaces.json still records everything, just slower),
      // so its leading/trailing window relaxes.
      const SESSION_SYNC_IDLE_MIN_INTERVAL_MS = 2_000
      let liveFlushTimer = 0
      let bridgeFlushTimer = 0
      let lastBridgeFlushAt = 0
      let syncTrailingTimer = 0
      let syncMicrotaskScheduled = false
      let lastSyncPostAt = 0
      let syncPending = false
      const liveDirty = new Set()
      const liveSessions = new Map()
      let knownSessionIds = new Set()
      const liveUnsubscribers = new Map()
      const syncLiveSessions = () => {
        const snapshot = ctx.sessions.list.getSnapshot()
        for (const id of snapshot.ids) {
          if (liveUnsubscribers.has(id)) continue
          const scope = ctx.sessions.scope(id)
          const session = scope === undefined ? undefined : ctx.sessions.sessionOf(scope)
          if (session === undefined) continue
          liveSessions.set(id, session)
          // Publishing only marks the session dirty; the flush sends the
          // latest snapshot for every dirty session at most once per window.
          const publish = () => {
            if (overlay.hidden) return
            liveDirty.add(id)
            scheduleLiveFlush()
          }
          liveUnsubscribers.set(id, session.subscribe(publish))
        }
        for (const [id, unsubscribe] of liveUnsubscribers) if (!snapshot.ids.includes(id)) { unsubscribe(); liveUnsubscribers.delete(id); liveSessions.delete(id); liveDirty.delete(id) }
      }
      const flushLive = () => {
        liveFlushTimer = 0
        if (overlay.hidden) { liveDirty.clear(); return }
        // A hidden host page cannot paint; retry from the visibilitychange
        // catch-up instead of pushing messages no one renders.
        if (document.hidden) { scheduleLiveFlush(); return }
        for (const id of liveDirty) {
          const session = liveSessions.get(id)
          if (session === undefined) continue
          const state = session.getSnapshot()
          const text = state.partial?.blocks.filter(block => block.kind === 'text').map(block => block.text).join('\n') ?? ''
          send('synapse:live-reply', { sessionId: id, running: state.running, text })
        }
        liveDirty.clear()
      }
      const scheduleLiveFlush = () => {
        if (liveFlushTimer !== 0) return
        liveFlushTimer = window.setTimeout(flushLive, LIVE_FLUSH_MS)
      }
      const flushBridgeSnapshots = () => {
        bridgeFlushTimer = 0
        lastBridgeFlushAt = Date.now()
        if (overlay.hidden || document.hidden) return
        send('synapse:workspaces', { workspaces: workspaceSnapshot(ctx) })
        send('synapse:current-session', { session: currentSession(ctx) })
      }
      const scheduleBridgeSnapshots = () => {
        if (bridgeFlushTimer !== 0) return
        // Leading send keeps opening the map instant; bursts inside the
        // window coalesce into one trailing send.
        const elapsed = Date.now() - lastBridgeFlushAt
        if (elapsed >= BRIDGE_FLUSH_MS) { flushBridgeSnapshots(); return }
        bridgeFlushTimer = window.setTimeout(flushBridgeSnapshots, BRIDGE_FLUSH_MS - elapsed)
      }
      const doSessionSyncPost = () => {
        syncTrailingTimer = 0
        if (!syncPending) return
        syncPending = false
        lastSyncPostAt = Date.now()
        const sessions = sessionSnapshot(ctx)
        const sessionIds = new Set(sessions.map(session => session.id))
        const removedSessionIds = [...knownSessionIds].filter(id => !sessionIds.has(id))
        knownSessionIds = sessionIds
        void fetch('/synapse/api/sessions/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessions, removedSessionIds }) }).catch(() => {})
      }
      const syncSessions = () => {
        // Leading flush on the microtask boundary keeps the first change
        // instant; changes inside the window coalesce into one trailing POST
        // so N subagent bursts cost O(changes/window) requests, not N. The
        // window widens while every view is closed (M4 silent bookkeeping).
        syncPending = true
        if (syncTrailingTimer !== 0 || syncMicrotaskScheduled) return
        const minInterval = overlay.hidden ? SESSION_SYNC_IDLE_MIN_INTERVAL_MS : SESSION_SYNC_MIN_INTERVAL_MS
        const elapsed = Date.now() - lastSyncPostAt
        if (elapsed >= minInterval) {
          syncMicrotaskScheduled = true
          queueMicrotask(() => { syncMicrotaskScheduled = false; doSessionSyncPost() })
        } else {
          syncTrailingTimer = window.setTimeout(doSessionSyncPost, minInterval - elapsed)
        }
      }
      const syncTheme = () => {
        const dark = document.body?.hasAttribute?.('data-ds-dark-theme') === true
        send('synapse:theme', { dark })
      }
      const syncCurrentSession = () => {
        syncSessions()
        syncLiveSessions()
        syncTheme()
        if (!overlay.hidden) {
          scheduleBridgeSnapshots()
        }
      }
      const onVisibilityChange = () => {
        if (document.hidden) return
        // Catch up everything paused in the background: one bridge snapshot,
        // then the live fan-in flushes its dirty set.
        syncCurrentSession()
        flushLive()
      }
      let mapOpenFallback = 0
      let mapOpening = false
      const showMapOverlay = () => {
        window.clearTimeout(mapOpenFallback)
        mapOpening = false
        overlay.hidden = false
        overlay.classList.remove('is-opening')
        syncCurrentSession()
      }
      const open = () => {
        window.clearTimeout(mapOpenFallback)
        mapOpening = true
        setView('map')
        // M4: an open view is an active view — the host flushes at full speed
        // while someone can actually see the canvas.
        postViewState(true)
        // Keep the iframe laid out while hidden so its canvas can receive a
        // real scroll offset. display:none would clamp scrollTop back to zero.
        overlay.hidden = false
        overlay.classList.add('is-opening')
        window.requestAnimationFrame(() => {
          send('synapse:map-opened')
          syncCurrentSession()
        })
        mapOpenFallback = window.setTimeout(showMapOverlay, 300)
      }
      const onFrameLoad = () => {
        syncCurrentSession()
        if (mapOpening) send('synapse:map-opened')
        // A frame reload while the map is already open (kernel/host-page
        // restart flows that keep the overlay mounted) boots the iframe back
        // into its M4 silent state — re-activate it so the visible map
        // catches up instead of staying blank.
        else if (!overlay.hidden) send('synapse:map-opened')
      }
      const onMessage = event => {
        if (event.origin !== location.origin || event.data?.source !== 'dsh-synapse') return
        if (event.data.type === 'synapse:close') return close()
        if (event.data.type === 'synapse:map-ready') return showMapOverlay()
        if (event.data.type === 'synapse:view-unloaded') return postViewState(false)
        if (event.data.type === 'synapse:request-current') {
          send('synapse:workspaces', { workspaces: workspaceSnapshot(ctx) })
          return send('synapse:current-session', { session: currentSession(ctx) })
        }
        if (event.data.type === 'synapse:open-session') {
          try { ctx.sessions.open(event.data.sessionId); close() } catch { send('synapse:bridge-error', { message: '关联的 DSH 会话已不可用' }) }
          return
        }
        if (event.data.type === 'synapse:activate-session') {
          // Bidirectional current-session sync: switch DSH's current session
          // without closing the map; the sessions-list subscription re-sends
          // synapse:current-session so the map follows the new highlight.
          try { ctx.sessions.open(event.data.sessionId) } catch { send('synapse:bridge-error', { message: '关联的 DSH 会话已不可用' }) }
          return
        }
        if (event.data.type === 'synapse:fork-session') {
          const atSeq = Number.isInteger(event.data.atSeq) ? event.data.atSeq : undefined
          ctx.sessions.fork({ sessionId: event.data.sessionId, atSeq, increaseTitle: true }).then(id => {
            const snapshot = ctx.sessions.list.getSnapshot()
            send('synapse:forked-session', { requestId: event.data.requestId, session: { id, title: snapshot.byId[id]?.displayTitle ?? 'DSH 分支' } })
          }).catch(() => { send('synapse:bridge-error', { message: 'DSH 分支创建失败，请确认源会话已经完成当前轮次' }) })
          return
        }
        if (event.data.type === 'synapse:send-message') {
          const text = typeof event.data.text === 'string' ? event.data.text.trim() : ''
          if (text === '') return send('synapse:bridge-error', { requestId: event.data.requestId, message: '消息不能为空' })
          prompt(event.data.sessionId, text).then(() => {
            send('synapse:message-sent', { requestId: event.data.requestId, sessionId: event.data.sessionId })
          }).catch(error => {
            send('synapse:bridge-error', { requestId: event.data.requestId, message: error instanceof Error ? error.message : 'DSH 消息发送失败' })
          })
          return
        }
        if (event.data.type === 'synapse:create-session') {
          const workspaceId = typeof event.data.workspaceId === 'string' && event.data.workspaceId !== '' && event.data.workspaceId !== 'dsh-ungrouped' ? event.data.workspaceId : undefined
          const cwd = typeof event.data.cwd === 'string' && event.data.cwd !== '' ? event.data.cwd : undefined
          const create = workspaceId === undefined ? ctx.sessions.create(cwd === undefined ? {} : { cwd }) : ctx.sessions.create({ workspaceId })
          create.then(id => {
            const snapshot = ctx.sessions.list.getSnapshot()
            send('synapse:created-session', { requestId: event.data.requestId, session: { id, title: snapshot.byId[id]?.displayTitle ?? '新会话', cwd: snapshot.byId[id]?.cwd ?? cwd ?? null } })
          }).catch(() => { send('synapse:bridge-error', { requestId: event.data.requestId, message: 'DSH 会话创建失败，请先在 DSH 选择工作目录' }) })
        }
      }
      const onKeyDown = event => { if (event.key === 'Escape' && !overlay.hidden) close() }
      document.addEventListener('visibilitychange', onVisibilityChange)
      // Follow DSH's live theme switch: body[data-ds-dark-theme] is the web
      // client's dark-mode signal, mirrored into the map iframe via synapse:theme.
      const themeObserver = typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => syncTheme())
      if (themeObserver !== null && document.body) {
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
      }
      const unsubscribeSessions = ctx.sessions.list.subscribe(syncCurrentSession)
      const unsubscribeWorkspaces = ctx.workspaces.list.subscribe(syncCurrentSession)
      dialogButton.addEventListener('click', close)
      mapButton.addEventListener('click', open)
      frame.addEventListener('load', onFrameLoad)
      window.addEventListener('message', onMessage)
      window.addEventListener('keydown', onKeyDown)
      // M4: a fresh host page boots with the canvas closed; re-assert the
      // silent state so a long-lived host process drops any stale active
      // flag recorded before the reload.
      postViewState(false)
      ctx.effect(() => () => {
        dialogButton.removeEventListener('click', close)
        mapButton.removeEventListener('click', open)
        frame.removeEventListener('load', onFrameLoad)
        window.removeEventListener('message', onMessage)
        window.removeEventListener('keydown', onKeyDown)
        document.removeEventListener('visibilitychange', onVisibilityChange)
        if (liveFlushTimer !== 0) window.clearTimeout(liveFlushTimer)
        if (bridgeFlushTimer !== 0) window.clearTimeout(bridgeFlushTimer)
        if (syncTrailingTimer !== 0) window.clearTimeout(syncTrailingTimer)
        themeObserver?.disconnect()
        unsubscribeSessions()
        unsubscribeWorkspaces()
        for (const unsubscribe of liveUnsubscribers.values()) unsubscribe()
        host.remove()
        style.remove()
      }, 'synapse: web workspace switch')
    }
    return module.exports
  },
})
