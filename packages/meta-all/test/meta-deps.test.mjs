// 回归锁：元包依赖表必须逐项对上「自装载成员 × 当前版本」。
//
// 为什么这条要单独锁：元包的传递依赖**不会**成为 bundle——实测装完元包，它的依赖既没进
// dsh.profile.bundles、行也没组合，而且不报错（契约 4）。所以「哪些包会被装进来」完全由
// 这份 dependencies 决定，「行怎么挂」由生成出来的补丁层决定（那半条有逐字节门禁）。
// 于是依赖表的三类漂移各有真实伤害，且都是静默的：少成员 → 插件没进 node_modules、
// 它的行 did not activate；范围写旧 → 用户装到旧版本代码（本地预览 registry 那次就是
// 「清单是新的、解析是旧的」）；写精确版本 → 补丁修复永远送不出去。
// 真机实测（J2）：依赖指向未发布版本时 pnpm 直接
// `The latest release of @dsh-pack/dsh-auto-compact is "0.1.0"`（元包要 ^0.1.1）而装不上。
//
// 判据取门禁导出的同一份实现（只读引用，不改门禁），避免测试与门禁各写一套。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '..', '..', '..');
const selfMount = require(resolve(REPO, 'tools', 'audit', 'self-mount.js'));

const { findMetaDepDrift } = selfMount;

const metaManifest = JSON.parse(readFileSync(join(REPO, 'packages', 'meta-all', 'package.json'), 'utf8'));

/** 仓库里的自装载成员（除元包外）：判定口径与门禁一致 —— 目录名不以 meta- 开头且有 dsh.bundle.patch。 */
function repoMembers() {
  const out = [];
  for (const dir of readdirSync(join(REPO, 'packages'))) {
    const pj = join(REPO, 'packages', dir, 'package.json');
    if (!existsSync(pj) || dir.startsWith('meta-')) continue;
    const m = JSON.parse(readFileSync(pj, 'utf8'));
    if (m.dsh?.bundle?.patch) out.push({ dir, name: m.name, version: m.version });
  }
  return out;
}

test('仓库现状：依赖表与自装载成员逐项对上（名字 + ^当前版本）', () => {
  const members = repoMembers();
  // 反证的一部分：样本量为 0 时「零漂移」是空跑，必须先把名单非空钉住。
  assert.ok(members.length >= 30, `自装载成员只有 ${members.length} 个，名单疑似被清空`);
  assert.deepEqual(findMetaDepDrift(metaManifest, members), []);
  assert.equal(Object.keys(metaManifest.dependencies).length, members.length, '元包依赖条数与成员数不一致');
});

test('反证：少列一个成员必须报出来（否则装完元包那个插件根本不进 node_modules）', () => {
  const members = repoMembers();
  const dropped = members[0];
  const deps = { ...metaManifest.dependencies };
  delete deps[dropped.name];
  const drift = findMetaDepDrift({ ...metaManifest, dependencies: deps }, members);
  assert.equal(drift.length, 1, `期望恰好一条，实得 ${JSON.stringify(drift)}`);
  assert.equal(drift[0].kind, 'missing');
  assert.match(drift[0].message, new RegExp(dropped.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('反证：范围写旧（覆盖不到当前版本）必须报出来 —— 用户会装到旧代码', () => {
  const members = repoMembers();
  const target = members[0];
  const deps = { ...metaManifest.dependencies, [target.name]: '^0.0.1' };
  const drift = findMetaDepDrift({ ...metaManifest, dependencies: deps }, members);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].kind, 'range');
  assert.match(drift[0].message, new RegExp(`\\^${target.version.replace(/\./g, '\\.')}`), '报错要给出规范形状 ^<当前版本>');
});

test('反证：精确版本（无 caret）也必须报 —— 之后的补丁修复永远送不出去', () => {
  const members = repoMembers();
  const target = members[0];
  const deps = { ...metaManifest.dependencies, [target.name]: target.version };
  const drift = findMetaDepDrift({ ...metaManifest, dependencies: deps }, members);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].kind, 'range');
});

test('反证：列出非成员（如能力库）必须报 —— 装了它不会挂载任何东西', () => {
  const members = repoMembers();
  const deps = { ...metaManifest.dependencies, '@dsh-pack/host-capabilities': '^0.1.0' };
  const drift = findMetaDepDrift({ ...metaManifest, dependencies: deps }, members);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].kind, 'not-a-member');
});

test('反证：真实成员清单里没有 host-capabilities（它不是 bundle，不该进依赖表）', () => {
  assert.ok(!repoMembers().some((m) => m.dir === 'host-capabilities'));
});

test('元包 manifest 读不出来时不崩，如实报一条', () => {
  const drift = findMetaDepDrift(null, repoMembers());
  assert.equal(drift.length, 1);
  assert.equal(drift[0].kind, 'meta-manifest');
  assert.deepEqual(findMetaDepDrift({ name: '@dsh-pack/all' }, []), []);
});
