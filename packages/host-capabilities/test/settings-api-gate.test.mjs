// 回归锁：tools/audit/settings-api.js —— 拦「对不存在的服务名/方法名的调用」。
//
// 为什么这条门禁必须存在：本仓库此前只核 @deepseek-ai **包名**，不核**服务名**。
// 真实事故全是服务层面的 —— `ctx.settings.register(...)`（SettingsForms 没这方法）、
// `ctx.settingsScope.bind(...)`（没这服务）、`apiProxy sessions.prompt(...)`（没这服务）。
// 三者失败形态都是静默：typeof 守卫恒假、try/catch 吞掉、或整条 not activate，
// 而只验组合的 --dump-config 一概看不见。
//
// 反证要求（仓库纪律）：每项判据都配「拆掉它结论必须翻转」的用例。
// 其中「别名要认得包一层的 helper」那条是**本门禁自己踩过的坑**：
// 第一版 aliasMap 只认 `ctx.get('settings')` / `ctx.settings`，于是 dsh-balance 里
// `const settings = readService(ctx, "settings")` + `settings.get(ns)` 没被抓到，
// 门禁显示 0 error —— 看着像干净，其实是漏判。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const gate = require(resolve(here, '..', '..', '..', 'tools', 'audit', 'settings-api.js'));

const SNAPSHOT = {
  services: new Set(['settings', 'webServer', 'sessionController', 'slots', 'remote', 'llm']),
  settingsMethods: new Set(['describe', 'update', 'configure', 'schema', 'mutate', 'replace', 'prepareDocument']),
};

const home = mkdtempSync(join(tmpdir(), 'settings-api-'));

/** 造一个只有一个包的假 workspace，返回能直接喂给 run() 的 pack。 */
function packWith(fileName, source) {
  const dir = join(home, fileName.replace(/[^a-z.]/gi, '_') + '-' + Math.random().toString(36).slice(2));
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@dsh-pack/fake', version: '1.0.0' }));
  writeFileSync(join(dir, 'lib', fileName), source);
  return { exists: true, packages: [{ dir, label: '@dsh-pack/fake', manifest: { name: '@dsh-pack/fake' } }] };
}

const run = (pack) => gate.run({ pack, snapshot: SNAPSHOT });
const errors = (pack) => run(pack).filter((f) => f.severity === 'error');

test('真实服务 + 真实方法 ⇒ 零 error（基线）', () => {
  assert.deepEqual(errors(packWith('index.js', `
    export function apply(ctx, config) {
      ctx.webServer.register({ kind: 'exact', path: '/x', handler: () => {} });
      ctx.settings.describe();
      ctx.settings.update('fake', {}, 1);
    }
    export const inject = ['webServer', 'settings'];
  `)), []);
});

test('幽灵服务 ctx.settingsScope.bind ⇒ error', () => {
  const errs = errors(packWith('index.js', `
    export function apply(ctx) { ctx.settingsScope.bind({ namespace: 'x' }); }
    export const inject = ['settingsScope'];
  `));
  assert.ok(errs.length >= 1, '必须报错');
  assert.ok(errs.some((e) => /settingsScope/.test(e.message)));
});

test('幽灵方法 ctx.settings.register ⇒ error', () => {
  const errs = errors(packWith('index.js', `
    export function apply(ctx) { ctx.settings.register('ns', {}, {}); }
  `));
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /settings\.register/);
});

test('反证（本门禁自己的坑）：别名要认得包了一层的 helper', () => {
  // dsh-balance 的真实形态：settings 不是直接 ctx.get 来的，而是 readService(ctx, "settings")。
  // 若 aliasMap 只认 ctx.get/ctx.x 两种，这条就漏判 ⇒ 门禁假绿。
  const errs = errors(packWith('index.js', `
    function readService(ctx, name) { return ctx[name]; }
    export function apply(ctx) {
      const settings = readService(ctx, "settings");
      return settings.get('balance');
    }
  `));
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /settings\.get/);
});

test('反证：非 cordis 模块不查 ctx（canvas 的 ctx.beginPath 不是服务）', () => {
  // 若不加这个限定，vendored 的 mermaid/编辑器会一次报出几十条误判。
  const errs = errors(packWith('index.js', `
    function draw(ctx) { ctx.beginPath(); ctx.arc(0, 0, 1, 0, 6); ctx.settings.reportNonstrict('x'); }
    export { draw };
  `));
  assert.deepEqual(errs, []);
});

test('反证：inject 名单里的不存在服务必须报', () => {
  const errs = errors(packWith('index.js', `
    export function apply(ctx) { return 0; }
    export const inject = ['webServer', 'apiProxy'];
  `));
  assert.ok(errs.some((e) => /apiProxy/.test(e.message)));
});

test('反证：快照读不到时必须 fail-closed，不能静默通过', () => {
  const pack = packWith('index.js', 'export function apply(ctx) { ctx.whatever.x(); }');
  const findings = gate.run({ pack, snapshot: null });
  assert.ok(findings.some((f) => f.severity === 'error' && /kernel-services/.test(f.message)));
});

test('仓库现状：所有包都过这条门禁', () => {
  const errs = errors(undefined) || [];
  const all = gate.run({});
  assert.deepEqual(all.filter((f) => f.severity === 'error').map((f) => `${f.pkg}: ${f.message}`), []);
});

test.after(() => rmSync(home, { recursive: true, force: true }));
