#!/usr/bin/env node
/**
 * 把阶梯分层收成单一全量层。
 *
 * 为什么要收：内核 `applyEntryPatches`（dsh-app-boot）对 `insert` 的处理是
 * `data.push(...insert)`，只把新行塞进查找表，**不按 id 去重**；而 patch 层只从
 * bundle 声明解析（`bundlePatchFiles`），成员的传递依赖不会成为 bundle。
 * 于是「core ⊂ plus ⊂ all」这种阶梯在同时安装任意两个元包时，共有成员会被装配两次：
 *   · host 半边第二次 register 同一条由 → `webserver: duplicate exact route "…"`，
 *     该条目报 did not activate（真机实测 core+all 组合出 18 个重复 id）；
 *   · 用户写 `disabled: true` 只能命中 entryMap 里最后插入的那一行，关不掉前一行。
 * 这个形状在内核语义下没有安全实现，所以只保留一个元包。
 *
 * 成员的原层归属不丢：留在 tierOf 上，README 的「按用途挑选」和生成器注释都还用它。
 *
 * 用法：node tools/codemod/collapse-tiers.mjs          # 只报告会怎么改
 *      node tools/codemod/collapse-tiers.mjs --apply
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const file = join(root, 'tools', 'tiers.json');
const apply = process.argv.includes('--apply');

const t = JSON.parse(readFileSync(file, 'utf8'));
const LADDER = ['core', 'plus', 'knowledge', 'pocket', 'bridge', 'compaction'];

const dropped = LADDER.filter((k) => t.tiers[k]);
if (!t.tiers.all) throw new Error('tiers.all 不存在，收层无处可收');

// 归属校验：被删的层里若有 all 没覆盖的成员，收层就会丢插件 —— 必须先知道。
const allDirs = new Set(t.tiers.all.members.map((m) => m.dir));
const orphan = [];
for (const k of dropped) {
  for (const m of t.tiers[k].members || []) if (!allDirs.has(m.dir)) orphan.push(`${m.dir}（原属 ${k}）`);
}

const extraDocs = dropped.map((k) => t.tiers[k].extraDoc).filter(Boolean);

const next = {
  _meta:
    '分层元包的唯一事实源。**只有一层 all**：内核 applyEntryPatches 对 insert 是追加、不按 id 去重，' +
    '两个元包同装会把共有成员装配两次（host 半边第二次 register 路由即报 ' +
    'webserver: duplicate exact route），所以阶梯（core ⊂ plus ⊂ all）在内核语义下不成立。' +
    '成员的 tierOf 只是「按用途挑选」的分组标签，不再生成元包。' +
    '改这里 → 重跑 tools/build-meta-patches.mjs → packages/meta-all/cordis.patch.yml 自动跟随。' +
    '每个成员必须自带 cordis.patch.yml 与 package.json#dsh.bundle.patch（纯插件包形态下必须能单装）。',
  kernelVersion: t.kernelVersion,
  packScope: t.packScope,
  tiers: {
    all: {
      title: '全量层（一次装齐）',
      summary:
        `${String(t.tiers.all.members.length)} 个插件：余额与费用、文件变更追踪与还原、拖入/粘贴、` +
        '输入历史与折叠、自动压缩、变更审核、峰谷价提醒、设置页整理、Quest 界面、子代理快视、' +
        '消息撤回、工作区锚定、系统提示词自定义，外加知识库、手机同屏、IM 网关、超长上下文与大件。' +
        '想要小集合就按下面的分组单独装某个插件 —— 每个插件都能独立自挂载。' +
        (extraDocs.length ? '（带原生构建的成员见文末构建脚本放行说明。）' : ''),
      members: t.tiers.all.members,
      ...(extraDocs.length ? { extraDoc: extraDocs.flat() } : {}),
    },
  },
  untiered: t.untiered,
};

console.log(`删除的层：${dropped.join(', ')}`);
console.log(`保留的层：all（${String(next.tiers.all.members.length)} 个成员，tierOf 分组仍在）`);
if (orphan.length) console.log(`⚠ 收层后会丢掉的成员：${orphan.join('; ')}`);
if (extraDocs.length) console.log(`迁移了 ${String(extraDocs.flat().length)} 行 extraDoc 到 all`);

if (!apply) {
  console.log('（只报告；加 --apply 落盘）');
  process.exit(orphan.length ? 1 : 0);
}
writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
console.log('--apply 完成：tools/tiers.json 只剩 all 层。');
