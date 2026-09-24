// dsh-zcode-migrate — 客户端半（设置页）。
//
// 契约：内核的模块加载器按 `window.__ModuleLoader__.load({ id, factory })` 取用；
// id 必须等于 dsh.plugin.json 的 id（注册表频道靠 id === 插件 id 判定到货）。
// 本文件是**手写**产物（无打包器，和 dsh-synapse / dsh-wsl-settings 同路数）：
// 只用 require 拿 react 与内核 primitive，其余逻辑自带。
//
// 页面做四件事：侦察（列出 zcode 里的会话，按项目分组、标出已迁）→ 勾选（支持
// 仅未迁/全选/反选）→ 迁移（默认先预演；真迁按批 3 条推进度）→ 结果（逐条状态 + 汇总）。
// 所有数据都走宿主半的 /zcode-migrate/api/{inspect,migrate,verify}，客户端不碰文件系统。
window.__ModuleLoader__.load({
  id: 'dsh-zcode-migrate',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const react = require('react')
    const { Button } = require('@deepseek-ai/dsh-client-ui-primitives')

    const API = '/zcode-migrate/api'
    const BATCH = 3

    const L = {
      nav: 'zcode 迁移',
      title: '把 zcode 的历史会话迁移进 dsh',
      desc: '从 zcode CLI 的会话库里读取历史会话，写成 dsh 原生会话日志；迁完刷新/重启 dsh，就能在会话列表里直接打开。源库只读，重复迁移按会话幂等。',
      recon: '侦察',
      reconning: '读取中…',
      total: '库内总量',
      selected: '本次选中',
      migrated: '已迁移',
      dbPath: 'zcode 库',
      dshRoot: 'dsh 会话根',
      project: '项目',
      sessions: '会话',
      selectAll: '全选',
      selectNone: '清空',
      onlyPending: '只选未迁移',
      dryRun: '先预演（不写盘）',
      migrate: '迁移选中',
      migrating: '迁移中…',
      stop: '停止',
      done: '完成',
      restartHint: '迁移已完成。刷新页面或重启 dsh 后，新会话会出现在左侧会话列表里。',
      noSession: '没有可迁移的会话（或都已迁移）。',
      needPick: '先勾选要迁移的会话。',
      already: '已迁移',
      parent: '子代理',
      failed: '失败',
      skipped: '跳过',
      verifyOk: '产物可读',
      groupAll: '全选此组',
      groupMigrate: '迁移此组',
      registerWs: '登记工作区',
      registerWsAll: '登记全部工作区',
      registering: '登记中…',
      wsRegistered: '工作区已登记',
      wsAttached: '会话已归组',
      wsRestartHint: '会话已挂进工作区。刷新页面或重启 dsh 后，左侧会话列表里它们就会出现在对应工作区下面。',
      wsSkipped: '跳过（目录已不存在）',
      wsFailed: '失败',
      dirGone: '目录已不存在',
      dirGoneHint: '目录已不存在：这些会话仍会迁移，但无法登记成工作区，会留在「未分组」。',
      wsHint: '会话按「工作区」归组：迁移只写会话日志，不登记工作区的话，迁来的会话会全部掉进「未分组」。点「登记工作区」把这些目录补登记即可（迁移时会自动登记）。',
    }

    const fmtTime = (ms) => {
      if (!Number.isFinite(ms)) return ''
      const d = new Date(ms)
      const p = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    }

    const call = async (action, body) => {
      const res = await fetch(`${API}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`)
      return json
    }

    function ZcodeMigrateCard() {
      const [report, setReport] = react.useState(null)
      const [picked, setPicked] = react.useState(() => new Set())
      const [busy, setBusy] = react.useState(null) // null | 'inspect' | 'migrate'
      const [error, setError] = react.useState(null)
      const [dryRun, setDryRun] = react.useState(true)
      const [progress, setProgress] = react.useState(null)
      const [results, setResults] = react.useState(null)
      const [wsResult, setWsResult] = react.useState(null)
      const stopRef = react.useRef(false)

      const sessions = report?.sessions ?? []

      const recon = async () => {
        setBusy('inspect')
        setError(null)
        setResults(null)
        try {
          const next = await call('inspect')
          setReport(next)
          // 默认勾选「未迁移」的那批，已迁移的不重复迁。
          setPicked(new Set(next.sessions.filter((s) => !s.alreadyMigrated).map((s) => s.zcodeId)))
        } catch (err) {
          setError(err.message)
        } finally {
          setBusy(null)
        }
      }

      const toggle = (id) => {
        setPicked((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }

      const run = async (explicitIds) => {
        // 只有「迁移此组」会显式传 id 列表；主按钮必须写成 `onClick: () => run()`。
        // 【别再挂裸函数】`onClick: run` 会把点击事件当 explicitIds 传进来：事件不是数组，
        // `ids.length` 是 undefined → 批循环整个不执行 → 预演模式下静默「0 成功」，
        // 关掉预演则死在 `ids.map is not a function`（用户实报）。这里再兜一道：
        // 拿到的不是数组就退回勾选集。
        const ids = Array.isArray(explicitIds) ? explicitIds : [...picked]
        if (ids.length === 0) {
          setError(L.needPick)
          return
        }
        stopRef.current = false
        setBusy('migrate')
        setError(null)
        setResults([])
        const all = []
        try {
          for (let i = 0; i < ids.length; i += BATCH) {
            if (stopRef.current) break
            const batch = ids.slice(i, i + BATCH)
            setProgress({ done: i, total: ids.length })
            const out = await call('migrate', { ids: batch, dryRun })
            for (const row of out.sessions ?? []) all.push(row)
            setResults([...all])
          }
          setProgress({ done: ids.length, total: ids.length })
          if (!dryRun) {
            // 迁移只写会话日志，**不会**让会话出现在工作区里：工作区归组靠工作区记录里的
            // sessionIds（内核只在首次启动时按 cwd 自动归组一次，之后必须显式挂）。
            // 所以真迁之后自动把涉及的目录登记成工作区**并把会话挂进去**（用户实报
            // 「迁移后也没到工作区」，就是因为这里以前只建了空工作区）。
            const migrated = new Set(ids)
            const dirs = [...new Set(sessions.filter((s) => migrated.has(s.zcodeId)).map((s) => s.directory).filter((d) => typeof d === 'string' && d !== ''))]
            if (dirs.length > 0) await registerWorkspaces(groupsFor(dirs))
            const next = await call('inspect')
            setReport(next)
            setPicked(new Set(next.sessions.filter((s) => !s.alreadyMigrated).map((s) => s.zcodeId)))
          }
        } catch (err) {
          setError(err.message)
        } finally {
          setBusy(null)
        }
      }

      /**
       * 目录 → `{directory, sessionIds}`：把该目录下**已知的**会话都带上（不只刚迁的那批），
       * 这样重复点等于顺手修好历史上「建了工作区但会话没挂进去」的残留。
       * 宿主侧 create 按路径去重、attachSession 幂等，所以重复提交是安全的。
       */
      const groupsFor = (dirs) => dirs.map((dir) => ({
        directory: dir,
        sessionIds: sessions.filter((s) => (s.directory || '(无工作目录)') === dir).map((s) => s.dshId).filter(Boolean),
      }))

      /** 登记工作区 + 把会话挂进去（重复登记/重复挂载都由宿主侧去重）。 */
      const registerWorkspaces = async (groups) => {
        setBusy('workspaces')
        setError(null)
        try {
          const out = await call('workspaces', { groups })
          setWsResult(out.results ?? [])
        } catch (err) {
          setError(err.message)
        } finally {
          setBusy(null)
        }
      }

      const groups = react.useMemo(() => {
        const map = new Map()
        for (const s of sessions) {
          const key = s.directory || '(无工作目录)'
          if (!map.has(key)) map.set(key, [])
          map.get(key).push(s)
        }
        return [...map.entries()]
      }, [sessions])

      const pendingCount = sessions.filter((s) => !s.alreadyMigrated).length
      const migratedCount = sessions.length - pendingCount
      // 可登记工作区的目录（目录还在 + 有工作目录）；与「登记全部工作区」按钮同口径。
      const wsDirs = groups
        .filter(([dir, rows]) => dir !== '(无工作目录)' && rows[0]?.directoryExists !== false)
        .map(([dir]) => dir)
      const summary = results === null ? null : results.reduce((acc, row) => {
        const key = row.status === 'failed' ? 'failed' : row.status === 'skipped' ? 'skipped' : 'migrated'
        acc[key] = (acc[key] ?? 0) + 1
        return acc
      }, {})

      const box = { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 12, marginTop: 10 }
      const rowStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 13 }
      const dim = { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 }
      const tag = (text, color) => react.createElement('span', {
        style: { marginLeft: 6, fontSize: 11, padding: '0 6px', borderRadius: 999, border: `1px solid ${color}`, color },
      }, text)

      return react.createElement('div', { style: { maxWidth: 760 } }, [
        react.createElement('h3', { key: 't', style: { margin: '0 0 4px' } }, L.title),
        react.createElement('p', { key: 'd', style: { ...dim, margin: '0 0 10px' } }, L.desc),

        react.createElement('div', { key: 'bar', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, [
          react.createElement(Button, {
            key: 'recon',
            onClick: recon,
            disabled: busy !== null,
          }, busy === 'inspect' ? L.reconning : L.recon),
          report !== null && react.createElement('span', { key: 'stat', style: dim },
            `${L.total} ${report.database?.sessions ?? '?'} 会话 · ${L.selected} ${sessions.length} · ${L.migrated} ${migratedCount}`),
        ]),

        report !== null && react.createElement('div', { key: 'paths', style: { ...dim, marginTop: 6 } }, [
          react.createElement('div', { key: 'db' }, `${L.dbPath}：${report.dbPath}`),
          react.createElement('div', { key: 'root' }, `${L.dshRoot}：${report.dshRoot}${report.dshRootExists ? '' : '（尚不存在，迁移时创建）'}`),
          react.createElement('div', { key: 'zstd' }, `zstd：${report.runtime?.zstd ? '可用' : '不可用（将退化为未压缩）'}`),
        ]),

        report !== null && react.createElement('div', { key: 'tools', style: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' } }, [
          react.createElement(Button, { key: 'all', onClick: () => setPicked(new Set(sessions.map((s) => s.zcodeId))) }, L.selectAll),
          react.createElement(Button, { key: 'none', onClick: () => setPicked(new Set()) }, L.selectNone),
          react.createElement(Button, {
            key: 'pending',
            onClick: () => setPicked(new Set(sessions.filter((s) => !s.alreadyMigrated).map((s) => s.zcodeId))),
          }, `${L.onlyPending}（${pendingCount}）`),
          react.createElement(Button, {
            key: 'wsall',
            // 只登记**目录还在**的那批：目录已不存在的登记不进去（注册表要求目录真实存在），
            // 发过去只会换来一排「跳过」，不如不发。计数与按钮同口径，免得数字对不上。
            onClick: () => registerWorkspaces(groupsFor(wsDirs)),
            disabled: busy !== null || wsDirs.length === 0,
          }, busy === 'workspaces' ? L.registering : `${L.registerWsAll}（${wsDirs.length}）`),
        ]),

        report !== null && react.createElement('div', { key: 'wshint', style: { ...dim, marginTop: 6 } }, L.wsHint),

        report !== null && react.createElement('div', { key: 'list', style: { ...box, maxHeight: 320, overflowY: 'auto' } },
          sessions.length === 0
            ? react.createElement('div', { style: dim }, L.noSession)
            : groups.map(([dir, rows]) => react.createElement('div', { key: dir, style: { marginBottom: 8 } }, [
                react.createElement('div', { key: 'h', style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' } }, [
                  react.createElement('span', { key: 't', style: { fontWeight: 600, fontSize: 12, flex: 1 } },
                    `${L.project}：${dir}（${rows.length}）`),
                  rows[0]?.directoryExists === false && tag(L.dirGone, 'var(--dsw-alias-state-warn-primary)'),
                  react.createElement(Button, {
                    key: 'gsel',
                    onClick: () => setPicked((prev) => new Set([...prev, ...rows.map((r) => r.zcodeId)])),
                  }, L.groupAll),
                  react.createElement(Button, {
                    key: 'ggo',
                    onClick: () => run(rows.filter((r) => !r.alreadyMigrated).map((r) => r.zcodeId)),
                    disabled: busy !== null,
                  }, `${L.groupMigrate}（${rows.filter((r) => !r.alreadyMigrated).length}）`),
                  dir !== '(无工作目录)' && rows[0]?.directoryExists !== false && react.createElement(Button, {
                    key: 'gws',
                    onClick: () => registerWorkspaces(groupsFor([dir])),
                    disabled: busy !== null,
                  }, L.registerWs),
                ]),
                ...rows.map((s) => react.createElement('label', { key: s.zcodeId, style: rowStyle }, [
                  react.createElement('input', {
                    key: 'c',
                    type: 'checkbox',
                    checked: picked.has(s.zcodeId),
                    onChange: () => toggle(s.zcodeId),
                  }),
                  react.createElement('span', { key: 't', style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                    s.title || s.zcodeId),
                  react.createElement('span', { key: 'time', style: dim }, fmtTime(s.createdAt)),
                  s.parentId !== null && tag(L.parent, 'var(--dsw-alias-border-l2)'),
                  s.alreadyMigrated && tag(L.already, 'var(--dsw-alias-state-success-primary)'),
                ])),
              ]))),

        wsResult !== null && react.createElement('div', { key: 'ws', style: { ...box, borderColor: 'var(--dsw-alias-border-l2)' } }, [
          react.createElement('div', { key: 'h', style: { fontWeight: 600, marginBottom: 4 } },
            `${L.wsRegistered}：${wsResult.filter((r) => r.ok).length}`
            + ` · ${L.wsAttached}：${wsResult.reduce((n, r) => n + (r.attached ?? 0), 0)}`
            + ` · ${L.wsSkipped}：${wsResult.filter((r) => r.skipped === true).length}`
            + ` · ${L.wsFailed}：${wsResult.filter((r) => !r.ok && r.skipped !== true).length}`),
          // 目录已不存在 → 灰字（这不是错误，是「没什么可登记的」）；真失败才用 ✗ 红字。
          ...wsResult.filter((r) => r.skipped === true).slice(0, 12).map((r, i) => react.createElement('div', { key: 's' + i, style: dim },
            `· ${r.directory} —— ${r.reason ?? L.dirGone}`)),
          ...wsResult.filter((r) => !r.ok && r.skipped !== true).slice(0, 8).map((r, i) => react.createElement('div', { key: 'f' + i, style: dim },
            `✗ ${r.directory} —— ${r.error ?? ''}`)),
          // 工作区建好了但个别会话没挂上：逐条给原因（最常见是会话头的 cwd 已失效）。
          ...wsResult.flatMap((r) => (r.attachFailed ?? []).map((f, i) => react.createElement('div', { key: `af-${r.directory}-${i}`, style: dim },
            `· ${r.directory} 未归组：${f.sessionId} —— ${f.error}`))).slice(0, 8),
          wsResult.some((r) => r.skipped === true) && react.createElement('div', { key: 'note', style: { ...dim, marginTop: 4 } }, L.dirGoneHint),
          wsResult.some((r) => r.ok) && react.createElement('div', { key: 'note2', style: { ...dim, marginTop: 4 } }, L.wsRestartHint),
        ]),

        report !== null && react.createElement('div', { key: 'go', style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' } }, [
          react.createElement('label', { key: 'dry', style: rowStyle }, [
            react.createElement('input', {
              key: 'c',
              type: 'checkbox',
              checked: dryRun,
              onChange: () => setDryRun((v) => !v),
            }),
            react.createElement('span', { key: 'l' }, L.dryRun),
          ]),
          react.createElement(Button, { key: 'run', onClick: () => run(), disabled: busy !== null }, busy === 'migrate' ? L.migrating : `${L.migrate}（${picked.size}）`),
          busy === 'migrate' && react.createElement(Button, { key: 'stop', onClick: () => { stopRef.current = true } }, L.stop),
          progress !== null && react.createElement('span', { key: 'p', style: dim }, `${L.done} ${progress.done}/${progress.total}`),
        ]),

        summary !== null && react.createElement('div', { key: 'sum', style: { ...box, borderColor: 'var(--dsw-alias-state-success-primary)' } }, [
          react.createElement('div', { key: 'h', style: { fontWeight: 600, marginBottom: 4 } },
            `${dryRun ? '预演' : '迁移'}结果：${summary.migrated ?? 0} 成功 / ${summary.skipped ?? 0} ${L.skipped} / ${summary.failed ?? 0} ${L.failed}`),
          dryRun === false && (summary.migrated ?? 0) > 0 && react.createElement('div', { key: 'hint', style: dim }, L.restartHint),
          ...(results ?? []).slice(-40).map((row, i) => react.createElement('div', { key: i, style: dim },
            `${row.status === 'failed' ? '✗' : row.status === 'skipped' ? '·' : '✓'} ${row.title || row.zcodeId || ''} ${row.error ?? row.reason ?? ''}`)),
        ]),

        error !== null && react.createElement('div', { key: 'err', style: { ...box, borderColor: 'var(--dsw-alias-state-error-primary)', color: 'var(--dsw-alias-state-error-primary)' } }, error),
      ])
    }

    function apply(ctx) {
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'zcode-migrate',
        order: 95,
        label: () => L.nav,
        inject: () => ({}),
      }, ZcodeMigrateCard), 'zcode-migrate: settings section')
    }

    const inject = ['slots']
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
