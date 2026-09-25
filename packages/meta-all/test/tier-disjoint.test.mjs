// 回归锁：分层元包的成员集必须两两不相交。
//
// 起因（真机 + 内核源码双向确认）：官方客户端报
//   7 entries did not activate
//   file-changes (@dsh-pack/dsh-file-changes): webserver: duplicate exact route "/api/dsh-files/list"
// 而仓库里每条路由只注册一次、profile 补丁层也没有我们的行 —— 唯一能解释的形状是
// **同一半边被装配了两次**。内核 dsh-app-boot 的 applyEntryPatches 处理 insert 是
// `data.push(...insert)`：不看内容、不按 id 去重（整行替换只作用于「覆盖型补丁」
// `- id: X / 字段: 值`，不作用于 insert）。所以阶梯（core ⊂ plus ⊂ all）同装时，
// 共有成员被 insert 两次 → 两行都在清单里 → 第二次 register 撞墙。
// tools/itest/tier-overlap-proof.mjs 用内核自己的 composeEntries 实测过：
// core + all → 组合 50 行、18 个重复 id。
//
// 这条不变量曾以**错误形态**写在 tools/audit/self-mount.js 里
// （「元包与成员共用一行是设计使然，重复应用是 no-op」），把 insert 当成了整行替换，
// 于是阶梯得以发布。本文件把它锁成 error，并逐项拆判据看结论是否随之翻转。
//
// 判据直接取门禁导出的同一份实现（只读引用，不改门禁），避免测试与门禁各写一套。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const selfMount = require(resolve(here, '..', '..', '..', 'tools', 'audit', 'self-mount.js'));

const { findTierOverlaps, loadRawTiers } = selfMount;

test('单层没有重叠（退役后的仓库形状）', () => {
  assert.deepEqual(findTierOverlaps({ all: { members: [{ dir: 'a' }, { dir: 'b' }] } }), []);
});

test('阶梯形状必须报出重叠 —— 这就是被退役的那个设计', () => {
  const tiers = {
    core: { members: [{ dir: 'a' }, { dir: 'b' }] },
    all: { members: [{ dir: 'a' }, { dir: 'b' }, { dir: 'c' }] },
  };
  const dup = findTierOverlaps(tiers);
  assert.equal(dup.length, 2);
  assert.deepEqual(
    dup.map((d) => `${d.dir}:${d.first}→${d.second}`).sort(),
    ['a:core→all', 'b:core→all']
  );
});

test('成员写成裸字符串也要认（旧 tiers.json 形状）', () => {
  const dup = findTierOverlaps({ x: { members: ['a'] }, y: { members: ['a'] } });
  assert.equal(dup.length, 1);
  assert.equal(dup[0].first, 'x');
});

test('反证：判据不能只会说「有重叠」—— 成员集互不相交时必须为 0', () => {
  // 故意把 a 从第二层删掉：若实现把「两层的成员数相加」当判据，这里仍会报。
  const dup = findTierOverlaps({
    x: { members: [{ dir: 'a' }] },
    y: { members: [{ dir: 'b' }] },
  });
  assert.deepEqual(dup, []);
});

test('反证：层缺 members / tiers 为空时不崩、不误报', () => {
  assert.deepEqual(findTierOverlaps({ x: { title: '空层' } }), []);
  assert.deepEqual(findTierOverlaps({}), []);
  assert.deepEqual(findTierOverlaps(null), []);
});

test('仓库现状：tools/tiers.json 只剩互斥的一层', () => {
  const raw = loadRawTiers();
  assert.ok(raw, '读不到 tools/tiers.json 的 tiers 映射');
  const names = Object.keys(raw);
  assert.deepEqual(names, ['all'], `分层元包已退役，只应剩 all，实际：${names.join(', ')}`);
  assert.deepEqual(findTierOverlaps(raw), []);
  // 反证的一部分：样本量必须非零，否则「只有一层」这条断言是空跑。
  assert.ok(raw.all.members.length >= 30, `all 层只剩 ${raw.all.members.length} 个成员，名单疑似被清空`);
});
