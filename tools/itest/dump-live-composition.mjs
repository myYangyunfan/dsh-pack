// 直接调内核的 loadProfileDirectory + composeEntries，把**真实 profile** 组合出来的
// 条目清单打出来，看有没有重复 id。只读，不写任何用户文件。
//
// 为什么需要它：真机报 `webserver: duplicate exact route "/api/dsh-files/list"`，
// 但 profile 自己的 cordis.patch.yml 里 @dsh-pack 行为 0、bundles 只有 @dsh-pack/all、
// all 那份 32 行 id 全不重复、dsh-file-changes 的 apply() 也只 register 一次。
// 三条都成立却仍然重复 ⇒ 我对「组合结果长什么样」的推断有问题，必须看真实清单。
//
// 用法：node tools/itest/dump-live-composition.mjs [profileName]
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const require = createRequire(import.meta.url);
const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const { loadProfileDirectory, composeEntries } = require('@deepseek-ai/dsh-app-boot');
const dshPkg = join(repo, 'node_modules', '@deepseek-ai', 'dsh', 'package.json');
const installAnchor = existsSync(dshPkg) ? dshPkg : require.resolve('@deepseek-ai/dsh/package.json');

const profileName = process.argv[2] || 'desktop';
const profileDir = join(homedir(), '.dsh', 'profiles', profileName);
if (!existsSync(profileDir)) {
  console.error(`profile 目录不存在：${profileDir}`);
  process.exit(2);
}

const loaded = loadProfileDirectory('dsh', profileDir, installAnchor, {});
console.log(`profile: ${profileDir}`);
console.log(`层数: ${loaded.layers.length}  userLayer 行数: ${loaded.patches.length}`);
for (const l of loaded.layers) {
  const inserts = l.patches.flatMap((p) => p.insert || []);
  console.log(`  层 ${l.packageName}: patches=${l.patches.length} 插入条目=${inserts.length}`);
}

const allLayers = [...loaded.layers.map((l) => l.patches), loaded.patches];
const entries = composeEntries(allLayers);
const ours = entries.filter((e) => String(e.name || '').startsWith('@dsh-pack/'));

const count = new Map();
for (const e of ours) count.set(String(e.id), (count.get(String(e.id)) || 0) + 1);
const dup = [...count].filter(([, n]) => n > 1);

const byName = new Map();
for (const e of entries) byName.set(String(e.name), (byName.get(String(e.name)) || 0) + 1);
const nameDup = [...byName].filter(([, n]) => n > 1);
console.log(`\n全部条目 ${entries.length} 个；按 name 重复的有 ${nameDup.length} 个`);
for (const [name, n] of nameDup) {
  const ids = entries.filter((e) => String(e.name) === name).map((e) => e.id);
  console.log(`  name=${name} ×${n}  ids=[${ids.join(', ')}]`);
}

console.log(`\n重复 id: ${dup.length ? dup.map(([id, n]) => `${id}×${n}`).join(', ') : '无'}`);
if (dup.length) {
  console.log('\n重复条目的完整行（看 name/config 是否一致）：');
  for (const [id] of dup) {
    for (const e of ours.filter((x) => String(x.id) === id)) {
      console.log(`  ${JSON.stringify(e)}`);
    }
  }
}
if (dup.length) {
  console.log('\n重复条目的完整行（看 name/config 是否一致）：');
  for (const [id] of dup) {
    for (const e of ours.filter((x) => String(x.id) === id)) {
      console.log(`  ${JSON.stringify(e)}`);
    }
  }
}
