// 回归锁：tools/audit/session-api.js —— 拦「按已移除的内核 Session 形状读数据」。
//
// 为什么这条门禁必须存在（2026-09-26 真机取证）：
//   · billion-context-dsh 的 agent/pre-step 读 `session.events.some(...)` ⇒ 每个回合
//     都抛 TypeError，官方客户端里整条对话不可用（HTTP 500）；
//   · synapse 投影 / graph-memory 回填用 `?? []`、`Array.isArray()` 兜底 ⇒ 静默空转；
//   · dsh-subagent-lens 页内读 `binding.session.events`（真身是 SessionEventStream）
//     ⇒ Array.isArray 恒假，子代理活动明细整块功能被守卫吞掉。
// 三处都不报错、`--dump-config` 全绿，只有真跑 UI 才看得出来。
//
// 反证要求（仓库纪律）：每项判据都要有「拆掉它，结论必须翻转」的用例。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const gate = require(resolve(here, '..', '..', '..', 'tools', 'audit', 'session-api.js'));

const home = mkdtempSync(join(tmpdir(), 'session-api-'));

/** 造一个只有一个包的假 workspace，返回能直接喂给 run() 的 pack。 */
function packWith(relPath, source) {
  const dir = join(home, 'pkg-' + Math.random().toString(36).slice(2));
  const file = join(dir, relPath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@dsh-pack/fake', version: '1.0.0' }));
  writeFileSync(file, source);
  return { exists: true, packages: [{ dir, label: '@dsh-pack/fake', manifest: { name: '@dsh-pack/fake' } }] };
}

const errs = (relPath, source) => gate.run({ pack: packWith(relPath, source) }).filter((f) => f.severity === 'error');

test('基线：现行读取口（兼容 helper + 下标回退）零 error', () => {
  assert.deepEqual(
    errs(
      'lib/index.js',
      `
      function sessionEvents(session) {
        if (!session) return [];
        if (typeof session.snapshotEvents === "function") return session.snapshotEvents();
        const legacy = session["events"];
        return Array.isArray(legacy) ? legacy : [];
      }
      export function apply(ctx) {
        ctx.on("session/event", (session, event) => { void event; });
        return sessionEvents;
      }
    `
    ),
    []
  );
});

test('当数组用：session.events.some(...) ⇒ error（billion-context 的 P0 形态）', () => {
  const found = errs('dist/index.js', `export function a(session) { return session.events.some((e) => e.type === "compaction/summary"); }`);
  assert.equal(found.length, 1, '必须报且只报一条');
  assert.match(found[0].message, /session\.events/);
  assert.match(found[0].message, /dist\/index\.js:1/);
});

test('遍历：for (const event of agent.session.events) ⇒ error（宿主任意接收者都要拦）', () => {
  const found = errs('lib/index.js', `export function backfill(agent) { for (const event of agent.session.events) void event; }`);
  assert.equal(found.length, 1);
  assert.match(found[0].message, /session\.events/);
});

test('已移除字段：session.meta?.cwd ⇒ error，且报语指向 header', () => {
  const found = errs('lib/index.js', `export function cwdOf(session) { return session.meta?.cwd || "?"; }`);
  assert.equal(found.length, 1);
  assert.match(found[0].message, /session\.meta/);
  assert.match(found[0].message, /session\.header/);
});

test('反证：注释里提到 session.events 不算违规（否则各包的解释性注释全被打成 error）', () => {
  assert.deepEqual(
    errs(
      'lib/index.js',
      `
      // 这里刻意不再读 session.events（内核 0.1.7-rc.1 已移除），改为订阅 session/event。
      /* 也不能读 session.meta：cwd 在 session.header 上。 */
      export function apply(ctx) { return ctx; }
    `
    ),
    []
  );
});

test('反证：测试夹具允许造旧形状（mock 是「真机形状守卫」的素材，不该被门禁拦）', () => {
  assert.deepEqual(errs('test/legacy-shape.test.js', `const session = { events: [{ type: "x" }], meta: { cwd: "/" } };`), []);
  assert.deepEqual(errs('lib/mock/index.js', `export const legacy = { session: { events: [] } };`), []);
});

test('反证：门禁真在扫（同一段代码换个路径就该报）—— 排除规则不能把功能一起排掉', () => {
  const source = `export function a(session) { return session.events.length; }`;
  assert.equal(errs('lib/index.js', source).length, 1, 'lib/ 下必须报');
  assert.equal(errs('client.js', source).length, 1, '包根 client.js 也必须报');
  assert.equal(errs('test/x.test.js', source).length, 0, '只有测试路径才豁免');
});

test('仓库现状：所有包都过这条门禁', () => {
  const all = gate.run({});
  assert.deepEqual(
    all.filter((f) => f.severity === 'error').map((f) => `${f.pkg}: ${f.message}`),
    []
  );
});

test.after(() => rmSync(home, { recursive: true, force: true }));
