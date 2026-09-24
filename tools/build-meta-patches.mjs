// 元包 cordis.patch.yml 生成器（阶段 5「自洽生成式元包」）。
//
// 为什么必须生成而不是手写：docs/spike-official-client.md §0.3 实测——**元包的传递依赖
// 不会成为 bundle**（装得上、跑得起、一个插件都不挂，且用户看不到任何报错）。所以每个
// @dsh-pack/<tier> 必须自带一份把成员行拼起来的 cordis.patch.yml；行由元包这一层插入，
// 成员包只是作为依赖被 pnpm 装进 profile（nodeLinker: hoisted 保证可解析）。
//
// 事实源是 tools/tiers.json（tier → 有序成员 + defaultDisabled）。成员的 loader 行来自各成员
// 包自己的 cordis.patch.yml（纯插件包形态下它们本来就必须能单装），这里只负责：定序、按 id
// 去重、整行搬运（含 config 块与 !!js 表达式，不改一个字节）。
//
// 用法：
//   node tools/build-meta-patches.mjs          # 生成（写盘）
//   node tools/build-meta-patches.mjs --check  # 只比对，不落盘；不一致退出码 1（CI 用）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// 迁移期两个根都可能存在，迁移后只剩 packages/。按「谁有货用谁」，
// 并在两个都空时直接报错退出——最怕的是静默生成一个空分层。
const PLUGIN_ROOTS = [join(REPO, 'packages'), join(REPO, 'dsh-desktop', 'assets', 'plugins')].filter((r) => existsSync(r));
if (!PLUGIN_ROOTS.length) {
  console.error(`✗ 找不到任何插件包根（找过: ${join(REPO, 'packages')}、dsh-desktop/assets/plugins）`);
  process.exit(2);
}
const PLUGINS = PLUGIN_ROOTS[0];
const ALT_PLUGINS = PLUGIN_ROOTS[1] || null;

// semver 由根 package.json 的 devDependencies 提供（自制壳时代的
// dsh-desktop/node_modules 已随内核补丁机器一并退役）。
function loadSemver() {
  for (const base of [REPO, join(REPO, 'dsh-desktop')]) {
    try {
      return require(join(base, 'node_modules', 'semver'));
    } catch {
      /* 试下一个 */
    }
  }
  try {
    return require('semver');
  } catch {
    console.error('✗ 解析不到 semver。请先在仓库根执行 npm install / pnpm install。');
    process.exit(2);
  }
}
const semver = loadSemver();

// 官方客户端运行时内核版本（compat 门只按 peerDependencies 里 @deepseek-ai/dsh{,-*} 判定）
const KERNEL_VERSION = '0.1.7-rc.1';
const CHECK = process.argv.includes('--check');

const tiers = JSON.parse(readFileSync(join(REPO, 'tools', 'tiers.json'), 'utf8'));
const kernelIds = new Set(JSON.parse(readFileSync(join(REPO, 'tools', 'audit', 'kernel-entry-ids.json'), 'utf8')).ids);

const problems = [];
const warnings = [];
const fail = (msg) => problems.push(msg);
const warn = (msg) => warnings.push(msg);

/** 从一份 cordis.patch.yml 里搬出 `- insert:` 块下的全部行（含各自 config / !!js）。 */
function readInsertRows(file, dir) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^-?\s*insert:\s*$/.test(l) && !/^\s*#/.test(l));
  if (start < 0) {
    fail(`${dir}: ${file} 里找不到顶层 \`- insert:\``);
    return [];
  }
  const rows = [];
  let cur = null;
  let rowIndent = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*#/.test(line) && cur === null) continue;
    const m = /^(\s+)-\s+id:\s*(\S+)\s*$/.exec(line);
    if (m) {
      if (cur) rows.push(cur);
      rowIndent = m[1].length;
      cur = { id: m[2], lines: [line] };
      continue;
    }
    if (cur === null) continue;
    // 行的延续：缩进必须比 `- id:` 更深；退回到更浅说明 insert 块结束
    if (line.trim() === '') continue;
    const indent = /^\s*/.exec(line)[0].length;
    if (indent < rowIndent) {
      rows.push(cur);
      cur = null;
      break;
    }
    // 行内注释（config 块的说明）跟着行一起搬，保持可读
    cur.lines.push(line);
  }
  if (cur) rows.push(cur);
  if (!rows.length) fail(`${dir}: insert 块里一条行都没有`);
  return rows;
}

/** 成员包应有的自指名（graph-memory 的 loader 行指到 ./dsh 子路径导出）。 */
function expectedRowName(dir) {
  return dir === 'graph-memory' ? `@dsh-pack/${dir}/dsh` : `@dsh-pack/${dir}`;
}

/** 校验成员包是否满足「可独立自挂载」三条件，返回其 insert 行。 */
function memberRows(dir) {
  const root = join(PLUGINS, dir);
  const pj = join(root, 'package.json');
  const patch = join(root, 'cordis.patch.yml');
  if (!existsSync(pj)) {
    fail(`${dir}: 目录或 package.json 不存在（tiers.json 与插件目录失配）`);
    return null;
  }
  const manifest = JSON.parse(readFileSync(pj, 'utf8'));
  if (manifest.name !== `@dsh-pack/${dir}`) {
    fail(`${dir}: package.json#name 应为 @dsh-pack/${dir}，实为 ${manifest.name}`);
  }
  if (manifest.dependencies && Object.keys(manifest.dependencies).some((k) => k.startsWith('@deepseek-ai/'))) {
    fail(`${dir}: dependencies 里出现 @deepseek-ai/*（违反 R3，会装出第二份内核拷贝 → 官方客户端拒绝启动）`);
  }
  const declared = manifest.dsh && manifest.dsh.bundle && manifest.dsh.bundle.patch;
  if (!declared) {
    fail(`${dir}: 缺 package.json#dsh.bundle.patch 声明，元包搬运了行也无法证明它能单装`);
  } else if (join(root, declared) !== join(patch)) {
    fail(`${dir}: dsh.bundle.patch 指到 ${declared}，不是包根的 cordis.patch.yml`);
  }
  const peerKeys = Object.keys(manifest.peerDependencies || {}).filter(
    (k) => k === '@deepseek-ai/dsh' || k.startsWith('@deepseek-ai/dsh-'),
  );
  for (const k of peerKeys) {
    const range = manifest.peerDependencies[k];
    if (!semver.satisfies(KERNEL_VERSION, range, { includePrerelease: true })) {
      fail(`${dir}: peer ${k} 的范围 ${range} 对内核 ${KERNEL_VERSION} 判不过（compat 门会拦）`);
    }
  }
  if (!existsSync(patch)) {
    fail(`${dir}: 无 cordis.patch.yml，无法入层`);
    return null;
  }
  return readInsertRows(patch, dir);
}

let written = 0;
let identical = 0;
let totalRows = 0;
const tierReport = [];

for (const [tier, spec] of Object.entries(tiers.tiers)) {
  const metaDir = `meta-${tier}`;
  const metaRoot = join(PLUGINS, metaDir);
  if (!existsSync(metaRoot)) {
    fail(`${metaDir}: 元包目录不存在（先建元包再生成 patch）`);
    continue;
  }
  const seen = new Set();
  const blocks = [];
  for (const member of spec.members) {
    const rows = memberRows(member.dir);
    if (!rows || !rows.length) continue;
    if (rows.length > 1) fail(`${member.dir}: 有 ${rows.length} 条 insert 行，元包搬运只支持单行包`);
    const row = rows[0];
    if (kernelIds.has(row.id)) fail(`${member.dir}: loader id "${row.id}" 与官方内核 199 个 id 撞名`);
    if (seen.has(row.id)) {
      fail(`${member.dir}: loader id "${row.id}" 在本层重复（按 id 去重会静默丢行）`);
      continue;
    }
    seen.add(row.id);
    const body = row.lines.slice();
    const nameLine = body.find((l) => /^\s+name:\s/.test(l));
    const rawName = nameLine ? /name:\s*(.*)$/.exec(nameLine)[1].trim().replace(/^['"]|['"]$/g, '') : null;
    if (rawName !== expectedRowName(member.dir)) {
      fail(`${member.dir}: patch 行 name 应为 ${expectedRowName(member.dir)}，实为 ${rawName}`);
    }
    const disabledLine = body.find((l) => /^\s+disabled:/.test(l));
    const isDisabled = /disabled:\s*true\s*$/.test(disabledLine || '');
    if (!!spec_defaultDisabled(spec, member) !== isDisabled) {
      fail(
        `${member.dir}: tiers.json 的 defaultDisabled=${!!spec_defaultDisabled(spec, member)} 与它 ` +
          `cordis.patch.yml 里的 disabled 实况（${isDisabled}）不一致——两处必须同源`,
      );
    }
    if (/^\s+disabled:\s*!!js/m.test(body.join('\n'))) {
      warn(
        `${member.dir}: 行内用了 disabled: !!js —— 这是它自己的双挂载守卫（历史设计，整行搬运不改字节）。` +
          `新生成的行一律不写这种形态：必选行上抛错的 !!js 会直接中断启动。`,
      );
    }
    blocks.push({ dir: member.dir, purpose: member.purpose, lines: body });
    totalRows += 1;
  }

  const out = [];
  out.push('# ⚠️ 本文件由 tools/build-meta-patches.mjs 生成，请勿手改。');
  out.push('# 改动的正确姿势：改 tools/tiers.json（层与成员）或改成员包自己的');
  out.push('# cordis.patch.yml（行内容），然后跑 node tools/build-meta-patches.mjs 重新生成。');
  out.push(`#`);
  out.push(`# 层：${spec.title}（${metaDir} / 发布名 @dsh-pack/${tier}），成员 ${spec.members.length} 个。`);
  out.push(`#`);
  out.push(`# 为什么元包要自带这些行：docs/spike-official-client.md §0.3 实测——元包光靠`);
  out.push(`# dependencies 是惰性的（传递依赖不会成为 bundle，row 也完全不组合，且用户无报错）。`);
  out.push(`# 所以行的插入方必须是元包这一层；成员包同时保有自己的 cordis.patch.yml，`);
  out.push(`# 这样单独 @dsh-pack/${tier} 之外的任一成员也装得起来。`);
  out.push(`#`);
  out.push(`# 定序 / 去重：按 tools/tiers.json 的成员顺序，loader id 先到先得。`);
  out.push(`# ⚠ patch 按 id 整行替换（无字段级 merge），所以每条行的 config 都是完整配置。`);
  out.push(`- insert:`);
  for (const b of blocks) {
    out.push(`    # ── ${b.dir} ── ${b.purpose}`);
    for (const l of b.lines) out.push(l);
  }
  out.push('');

  const target = join(metaRoot, 'cordis.patch.yml');
  const text = out.join('\n');
  const prev = existsSync(target) ? readFileSync(target, 'utf8') : null;
  if (CHECK) {
    if (prev === text) {
      identical += 1;
    } else {
      fail(`${metaDir}/cordis.patch.yml 与 tiers.json 不一致（跑 node tools/build-meta-patches.mjs 重新生成）`);
    }
  } else if (prev === text) {
    identical += 1;
  } else {
    writeFileSync(target, text);
    written += 1;
  }
  // ── 元包的成员依赖同样由这里生成，不留手写值 ─────────────────────
  // 之前 6 个元包手写的是 ">=0.1.0"，有两个真实问题：
  //   · semver.satisfies('1.0.0', '>=0.1.0') === true ⇒ 成员将来发 1.x 会被
  //     元包无条件拉进来，跨 major 没有任何保护；
  //   · 它也不解决 prerelease：graph-memory 是 1.6.0-beta.1，
  //     写 ^1.6.0 匹配不到预发布版（semver 默认排除 prerelease），
  //     knowledge 层装完会「有 row、包却拉不到」——正是我们费力在 better-sidebar
  //     那边避免过的静默失效形态。
  // 所以按成员**实际版本**生成 caret：prerelease 自动带上 prerelease 段。
  const wantedDeps = {};
  for (const member of spec.members) {
    const mpj = join(PLUGINS, member.dir, 'package.json');
    if (!existsSync(mpj)) continue;
    let mv;
    try {
      mv = JSON.parse(readFileSync(mpj, 'utf8')).version;
    } catch {
      fail(`${member.dir}: package.json 解析失败，无法为 ${metaDir} 生成依赖区间`);
      continue;
    }
    if (!mv) {
      fail(`${member.dir}: 没有 version 字段`);
      continue;
    }
    wantedDeps[`@dsh-pack/${member.dir}`] = `^${mv}`;
  }
  {
    const metaPj = join(metaRoot, 'package.json');
    const metaRaw = readFileSync(metaPj, 'utf8');
    const metaManifest = JSON.parse(metaRaw);
    const cur = metaManifest.dependencies || {};
    const diffs = [];
    for (const [name, range] of Object.entries(wantedDeps)) {
      if (cur[name] !== range) diffs.push(`${name}: ${cur[name] || '(缺)'} → ${range}`);
    }
    for (const name of Object.keys(cur)) {
      if (!(name in wantedDeps)) diffs.push(`${name}: ${cur[name]} → (移除，不在 tiers.json 里)`);
    }
    if (diffs.length) {
      if (CHECK) {
        fail(`${metaDir}: dependencies 与 tiers.json 不同源（跑生成器）：\n        ${diffs.join('\n        ')}`);
      } else {
        metaManifest.dependencies = wantedDeps;
        delete metaManifest['//']; // 手写的「版本由发布工具改写」说明已不成立，别留误导注释
        writeFileSync(metaPj, JSON.stringify(metaManifest, null, 2) + '\n');
        console.log(`  ${metaDir}: 同步 dependencies（${diffs.length} 处）`);
      }
    }
  }

  tierReport.push({ tier, metaDir, rows: blocks.length });
}

function spec_defaultDisabled(spec, member) {
  return member.defaultDisabled === true;
}

console.log(`== 元包 cordis.patch.yml ${CHECK ? '校验' : '生成'}完成`);
for (const r of tierReport) console.log(`   @dsh-pack/${r.tier} (${r.metaDir}): ${r.rows} 行`);
console.log(`   层数 ${tierReport.length} / 搬运行合计 ${totalRows} / 新写 ${written} / 无变化 ${identical}`);
if (warnings.length) {
  console.log(`\n提示 ${warnings.length} 条（不阻断）：`);
  for (const w of warnings) console.log('   · ' + w);
}
if (problems.length) {
  console.log(`\n!! 问题 ${problems.length} 条：`);
  for (const p of problems) console.log('   - ' + p);
  process.exit(1);
}
console.log('   与官方内核 ' + kernelIds.size + ' 个 loader id 交叉核对：无撞名');
