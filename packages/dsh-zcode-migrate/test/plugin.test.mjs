// Plugin-adapter contract tests.
//
// The dsh host loads this module and calls `apply(ctx, config)`. These tests
// assert the parts of that contract the host relies on: the exported shape, the
// tools that get registered, the behavior hints, and that a tool never throws
// at the model (errors come back as structured payloads).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

import { apply, name, inject, Config, SLASH_GUIDE } from '../src/index.js'
import { projectKey } from '../core/paths.js'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')

/** A cordis context stub that records what the plugin registers. */
function mockContext() {
  const tools = []
  const sections = []
  const routes = []
  const provided = {}
  return {
    tools: { register: (definition) => tools.push(definition) },
    systemPrompt: { section: (fn) => sections.push(fn) },
    // 设置页（客户端半）的数据入口：HTTP 路由必须挂在这个前缀上。
    webServer: { register: (route) => { routes.push(route); return () => {} } },
    effect: (fn) => { fn(); return () => {} },
    provide: (key, value) => {
      provided[key] = value
    },
    logger: { warn() {} },
    registered: tools,
    sections,
    routes,
    provided,
  }
}

test('the module exports the dsh plugin contract', () => {
  assert.equal(name, 'zcode-migrate')
  // webServer 是设置页的后端：缺它设置页不会出现，所以声明成硬依赖而不是可选读。
  assert.deepEqual(inject, ['tools', 'webServer', 'workspaceRegistry'])
  assert.equal(typeof apply, 'function')
  assert.ok(Config, 'Config schema is exported')
  // The schema must satisfy Standard Schema v1 for hosts that validate it.
  assert.equal(typeof Config['~standard']?.validate, 'function')
})

test('apply 挂载设置页的 HTTP 面（prefix 路由，带 handler）', () => {
  const ctx = mockContext()
  apply(ctx, {})
  const route = ctx.routes.find((r) => r.path === '/zcode-migrate/api')
  assert.ok(route !== undefined, '必须挂 /zcode-migrate/api 前缀路由')
  assert.equal(route.kind, 'prefix')
  assert.equal(typeof route.handler, 'function')
})

test('apply registers the three tools with their behavior hints', () => {
  const ctx = mockContext()
  apply(ctx, {})
  assert.deepEqual(
    ctx.registered.map((tool) => tool.name).sort(),
    ['zcode_inspect', 'zcode_migrate', 'zcode_verify'],
  )
  const byName = Object.fromEntries(ctx.registered.map((tool) => [tool.name, tool]))
  assert.equal(byName['zcode_inspect'].behavior, 'read')
  assert.equal(byName['zcode_inspect'].readOnly, true)
  assert.equal(byName['zcode_inspect'].destructive, false)
  assert.equal(byName['zcode_migrate'].behavior, 'idempotent')
  assert.equal(byName['zcode_migrate'].idempotent, true)
  assert.equal(byName['zcode_verify'].behavior, 'read')
  for (const tool of ctx.registered) {
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 10)
    assert.equal(typeof tool.execute, 'function')
    assert.equal(typeof tool.output.render, 'function')
    assert.equal(tool.parameters.type, 'object')
  }
})

test('apply registers the slash-command guide and the service handle', () => {
  const ctx = mockContext()
  apply(ctx, {})
  assert.equal(ctx.sections.length, 1)
  assert.ok(SLASH_GUIDE.includes('/zcode migrate'))
  assert.ok(ctx.provided.zcodeMigrate)
  assert.equal(typeof ctx.provided.zcodeMigrate.migrate, 'function')
})

test('slashCommand: false skips the system-prompt section', () => {
  const ctx = mockContext()
  apply(ctx, { slashCommand: false })
  assert.equal(ctx.sections.length, 0)
})

test('the rendered output of a tool is a text content block', () => {
  const ctx = mockContext()
  apply(ctx, {})
  const tool = ctx.registered.find((entry) => entry.name === 'zcode_verify')
  const rendered = tool.output.render({}, { ok: true, eventCount: 3 })
  assert.equal(Array.isArray(rendered), true)
  assert.equal(rendered[0].type, 'text')
  assert.ok(rendered[0].text.includes('"eventCount": 3'))
})

test('a tool surfaces failures as a structured payload instead of throwing', async () => {
  const ctx = mockContext()
  apply(ctx, {})
  const verify = ctx.registered.find((entry) => entry.name === 'zcode_verify')
  const result = await verify.execute({ path: join(tmpdir(), 'definitely-not-here.jsonl.zstd') })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'NOT_FOUND')
  assert.ok(result.error.message)

  const missingArg = await verify.execute({})
  assert.equal(missingArg.ok, false)
  assert.equal(missingArg.error.code, 'CONFIG_ERROR')
})

test('tool parameter schemas comply with strict JSON schema (no boolean required in properties)', () => {
  const ctx = mockContext()
  apply(ctx, {})
  for (const tool of ctx.registered) {
    assert.equal(Array.isArray(tool.parameters.required), true, `${tool.name}.parameters.required must be an array`)
    for (const [propName, propDef] of Object.entries(tool.parameters.properties || {})) {
      assert.equal(propDef.required, undefined, `${tool.name}.parameters.properties.${propName} must not declare 'required'`)
    }
  }
})

test('plugin config reaches the tools as defaults', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zcode-plugin-'))
  try {
    const dbPath = join(dir, 'db.sqlite')
    const db = new DatabaseSync(dbPath)
    db.exec(`
      CREATE TABLE session (id text primary key, project_id text, slug text, directory text,
        title text, version text, time_created integer, time_updated integer, task_type text,
        parent_id text, workspace_id text, path text, share_url text, summary_additions integer,
        summary_deletions integer, summary_files integer, summary_diffs text, revert text,
        permission text, time_compacting integer, time_archived integer, title_source text,
        title_message_id text, time_title_updated integer, trace_id text);
      CREATE TABLE message (id text primary key, session_id text, time_created integer,
        time_updated integer, data text, sequence integer);
      CREATE TABLE part (id text primary key, message_id text, session_id text,
        time_created integer, time_updated integer, data text, sequence integer);
      INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated)
        VALUES ('sess_p1', 'p', 's', 'C:\\cfg', 'Configured', '1', 100, 100);
      INSERT INTO message (id, session_id, time_created, time_updated, data, sequence)
        VALUES ('m1', 'sess_p1', 100, 100, '{"role":"user","time":{"created":100}}', 0);
      INSERT INTO part (id, message_id, session_id, time_created, time_updated, data, sequence)
        VALUES ('pt1', 'm1', 'sess_p1', 100, 100, '{"type":"text","text":"hi"}', 0);
      INSERT INTO message (id, session_id, time_created, time_updated, data, sequence)
        VALUES ('m2', 'sess_p1', 101, 101, '{"role":"assistant","time":{"created":101},"finish":"stop"}', 1);
      INSERT INTO part (id, message_id, session_id, time_created, time_updated, data, sequence)
        VALUES ('pt2', 'm2', 'sess_p1', 101, 101, '{"type":"text","text":"ok"}', 0);
    `)
    db.close()

    const root = join(dir, 'sessions')
    const ctx = mockContext()
    apply(ctx, { dbPath, dshRoot: root })

    const inspectTool = ctx.registered.find((entry) => entry.name === 'zcode_inspect')
    const inspected = await inspectTool.execute({})
    assert.equal(inspected.ok, true)
    assert.equal(inspected.selected, 1, 'config dbPath is used when the model omits it')
    assert.equal(inspected.dshRoot, root)

    const migrateTool = ctx.registered.find((entry) => entry.name === 'zcode_migrate')
    const report = await migrateTool.execute({})
    assert.equal(report.migrated, 1)
    assert.ok(report.sessions[0].path.includes(projectKey('C:\\cfg')))
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
})

test('apply 不得直接给 ctx 赋属性（cordis 的 ctx 是 Proxy，会抛 cannot set … without provide）', () => {
  // 实测现场：内核日志里 `[loader-isolation] entry zcode-migrate failed: cannot set
  // property "zcodeMigrate" without provide` —— 插件曾在 apply 里写 ctx.zcodeMigrate = …，
  // 于是整个宿主半加载失败（设置页在、工具/命令/路由全都没有）。
  // 这里把 mock 换成「对未声明属性赋值即抛」的 Proxy，复刻 cordis 的行为当回归锁。
  const base = mockContext()
  const strict = new Proxy(base, {
    set(target, prop, value) {
      if (prop in target) {
        target[prop] = value
        return true
      }
      throw new Error(`cannot set property "${String(prop)}" without provide`)
    },
  })
  assert.doesNotThrow(() => apply(strict, {}))
  assert.ok(strict.provided.zcodeMigrate, '服务面必须经 provide 暴露')
  assert.equal(strict.zcodeMigrate, undefined, '不得在 ctx 上留裸属性')
})
