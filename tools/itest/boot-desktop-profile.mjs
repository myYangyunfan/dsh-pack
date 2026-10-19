#!/usr/bin/env node
// J1 —— 用官方 CLI 真装真组合的集成校验。
//
// 为什么必须有它：静态审计能查出「声明了 dsh.client 却没有 exports["./client"]」这类
// 会让官方客户端**整个拒绝启动**的问题，但查不出「补丁层的 id/name 写错、行根本没挂上」。
// 这类问题在官方客户端里的表现是插件静默消失（不报错、不启动失败），只有把包真装进
// 一个 desktop 形状的 profile、再让内核做一次组合，才能看出来。
//
// 关键前提（实测，见 docs/spike-official-client.md）：
//   · CLI 对 profile 名 "desktop" 是硬拦的（rejectElectronProfile），所以这里用
//     `--profile <临时名>`，它同样是 dsh plugin add 的合法目标；
//   · 装本地路径时 pnpm 写成 link: 规格，**不会**去拉依赖 —— 所以 J1 验的是
//     「补丁层能不能挂上」，不验依赖闭包（那是 J2 用 tarball 安装才验得到的）。
//
// 用法：node tools/itest/boot-desktop-profile.mjs [--job=j1] [--keep]

import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

// ---- 隔离红线：绝不允许碰真实的 ~/.dsh ----
function assertIsolated(home) {
  const real = join(homedir(), '.dsh');
  const resolved = resolve(home);
  if (resolved === resolve(real)) {
    throw new Error(`拒绝执行：DSH_HOME 指向真实的 ${real}`);
  }
  if (!resolved.startsWith(resolve(tmpdir()))) {
    throw new Error(`拒绝执行：DSH_HOME 不在系统临时目录下（${resolved}）`);
  }
}

// 一个目录里「有 package.json」不等于「是插件包根」：packages/host-capabilities 是
// 构建期库，没有 dsh.bundle.patch。所以按**自装载包数量**选根，而不是看哪个目录先存在。
function countSelfMounting(dir) {
  if (!existsSync(dir)) return -1;
  let n = 0;
  for (const d of readdirSync(dir)) {
    if (!existsSync(join(dir, d, 'package.json'))) continue;
    if (idsOf(join(dir, d)).decl) n += 1;
  }
  return n;
}

function packRoot() {
  const candidates = [join(REPO, 'packages'), join(REPO, 'dsh-desktop', 'assets', 'plugins')];
  let best = null;
  for (const c of candidates) {
    const n = countSelfMounting(c);
    if (n > 0 && (!best || n > best.n)) best = { c, n };
  }
  if (!best) throw new Error('两个候选根里都没有自装载包（packages/ 或 dsh-desktop/assets/plugins/）');
  return best.c;
}

function kernelBin() {
  // 优先用显式指定，其次用仓库里已装好的，最后退回临时安装。
  // 第一个仓库内候选是**现在的**布局：自制壳退役后内核就是工作区自己的
  // devDependency（J4 也从这里取）。后面两个是历史路径，留着只为兼容旧检出。
  const candidates = [
    process.env.DSH_KERNEL_BIN,
    join(REPO, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    join(REPO, 'dsh-desktop', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    join(REPO, '..', 'kernel', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('找不到 dsh CLI。先装内核：npm i --prefix <dir> @deepseek-ai/dsh@<版本>，再用 DSH_KERNEL_BIN 指过去。');
}

const args = process.argv.slice(2);
const job = (args.find((a) => a.startsWith('--job=')) || '--job=j1').slice(6).split(',');
const keep = args.includes('--keep');

const ROOT = packRoot();
const BIN = kernelBin();

// 报错文案里要能看出是哪一代内核的行为（0.2.0-rc.1 不提构建脚本，0.2.1-rc.2 会拦），
// 否则同一个断言在两边一红一绿时没人能一眼归因。
function kernelVersionOf() {
  try {
    return JSON.parse(readFileSync(join(BIN, '..', '..', 'package.json'), 'utf8')).version || '(未知)';
  } catch {
    return '(未知)';
  }
}
const HOME = mkdtempSync(join(tmpdir(), 'dsh-itest-'));
assertIsolated(HOME);

const env = { ...process.env, DSH_HOME: HOME };
delete env.DSH_TAURI_USERDATA;
delete env.DSH_TAURI_APP_DIR;

function dsh(...cli) {
  return spawnSync(process.execPath, [BIN, ...cli], { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const failures = [];
function expect(ok, label, detail = '') {
  if (!ok) failures.push(`${label}${detail ? ' — ' + detail : ''}`);
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${ok || !detail ? '' : '\n         ' + detail}`);
}

// 内核的 plugin 命令把 pnpm 的真实失败写进 profile 的诊断日志，stdout/stderr 只留一行
// `dsh: plugin command failed; diagnostics: …`。所以判据不能只看 CLI 输出（实测：本机
// 0.2.1-rc.2 的 J2 元包失败里，「is not in the npm registry」那行压根不在 stdout）。
// 取该 profile 最近一次 operation 的 pnpm.log 拼进证据文本。
function latestOperationLog(profile) {
  const dir = join(HOME, 'profiles', profile, '.plugin-manager', 'logs');
  if (!existsSync(dir)) return '';
  const ops = readdirSync(dir)
    .map((d) => join(dir, d, 'pnpm.log'))
    .filter((f) => existsSync(f));
  if (!ops.length) return '';
  ops.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  try {
    return readFileSync(ops[0], 'utf8');
  } catch {
    return '';
  }
}

console.log(`插件根: ${ROOT.replace(REPO, '.')}`);
console.log(`内核 CLI: ${BIN}`);
console.log(`临时 DSH_HOME: ${HOME}`);

// 收集每个包的 loader id（从它自己的 cordis.patch.yml 里读，不维护第二份清单）
function idsOf(pkgDir) {
  const pj = join(pkgDir, 'package.json');
  if (!existsSync(pj)) return { ids: [], name: null, decl: false };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(pj, 'utf8'));
  } catch {
    return { ids: [], name: null, decl: false, error: 'package.json 解析失败' };
  }
  const decl = manifest.dsh?.bundle?.patch;
  const files = decl ? (Array.isArray(decl) ? decl : [decl]) : [];
  const ids = [];
  for (const rel of files) {
    const f = join(pkgDir, rel);
    if (!existsSync(f)) continue;
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/^\s*-?\s*id:\s*(['"]?)([^'"\s#][^'"\s#]*)\1\s*$/gm)) ids.push(m[2]);
  }
  // deps 用来区分「有没有 registry 依赖」：元包的依赖是 @dsh-pack/*，离线装不上（见 J2 注释）
  const deps = Object.keys(manifest.dependencies || {});
  return { ids, name: manifest.name, decl: Boolean(decl), deps, error: manifest.error };
}

const packages = readdirSync(ROOT)
  .filter((d) => existsSync(join(ROOT, d, 'package.json')))
  .sort()
  .map((d) => ({ dir: d, path: join(ROOT, d), ...idsOf(join(ROOT, d)) }));

const selfMounting = packages.filter((p) => p.decl && p.ids.length);
console.log(`包总数 ${packages.length}，其中自装载（有 dsh.bundle.patch 且有 id）${selfMounting.length}\n`);

if (job.includes('j1')) {
  console.log('########## J1：真装 + 组合 ##########');
  // 防空跑：一个包都没扫到时，下面所有断言都会「0 个全部通过」地假绿。
  // 假绿比红更糟——它会让 CI 在目录搬家或清单错位时照样报 PASS。
  const FLOOR = Number(process.env.ITEST_MIN_PACKAGES || 15);
  if (selfMounting.length < FLOOR) {
    console.log(`\n===== J1 结果：FAIL =====\n  - 自装载包只有 ${selfMounting.length} 个，低于下限 ${FLOOR}： packRoot 选错或 dsh.bundle.patch 大面积缺失`);
    if (!keep) rmSync(HOME, { recursive: true, force: true });
    process.exit(1);
  }
  const PROFILE = 'itest1';
  let installed = 0;
  for (const p of selfMounting) {
    const r = dsh('plugin', '--profile', PROFILE, 'add', p.path.replace(/\\/g, '/'));
    const out = (r.stdout || '') + (r.stderr || '');
    const okRun = r.status === 0;
    if (okRun) installed += 1;
    else console.log(`  安装失败 ${p.dir}: ${out.split('\n').slice(-4).join(' | ')}`);
  }
  expect(installed === selfMounting.length, `全部 ${selfMounting.length} 个自装载包安装成功`, `实际 ${installed}`);

  const dump = dsh('--profile', PROFILE, '--dump-config');
  expect(dump.status === 0, 'dsh --dump-config 退出 0');
  const composed = dump.stdout || '';

  // 一个 id 在 dump 里出现几次**不是**安全性的度量：dump 是按 `# == <来源层>` 分组显示出处的，
  // 同一个插件同时被「自己那份补丁层」和「所属分层的元包层」声明时，自然出现两次，
  // 而补丁按 id 整行替换 ⇒ 组合树里只有一行。实测两种来源的字节完全相同。
  //
  // 真正的危险是**同一个 id 指向不同的 name**：那就是「后写的层把别人的行整行顶掉」，
  // issue #104 的双登记启动崩溃也属于这一类。所以这里断言的是：
  //   ① 每个 id 至少出现 1 次（没挂上 = 静默消失）；
  //   ② 同一 id 的所有出现，name 必须一致（不一致 = 被别的包抢走）。
  const allIds = selfMounting.flatMap((p) => p.ids.map((id) => ({ id, dir: p.dir })));
  const rowMap = new Map(); // id -> Set<name>
  for (const m of composed.matchAll(/^- id:\s*(\S+)\n\s*name:\s*['"]?([^'"\n]+)['"]?\s*$/gm)) {
    if (!rowMap.has(m[1])) rowMap.set(m[1], new Set());
    rowMap.get(m[1]).add(m[2].trim());
  }
  const missing = [];
  const shadowed = [];
  for (const { id, dir } of allIds) {
    const names = rowMap.get(id);
    if (!names || names.size === 0) {
      missing.push(`${dir} (id=${id})`);
      continue;
    }
    if (names.size > 1) {
      shadowed.push(`${dir} (id=${id}) → 同一 id 挂着 ${names.size} 个不同 name: ${[...names].join(' | ')}`);
    }
  }
  expect(missing.length === 0, `全部 ${allIds.length} 个 loader id 都组合进了最终树`, missing.slice(0, 6).join('; '));
  expect(shadowed.length === 0, '无「同 id 指向不同包」的整行抢占（#104 类崩溃）', shadowed.slice(0, 4).join('; '));

  // 「补丁层匹配不到任何行」就是 id/name 写错的探测器
  const unmatched = (composed.match(/no (?:matching )?row|matched no row|unmatched patch/gi) || []);
  expect(unmatched.length === 0, '组合输出里无「补丁匹配不到行」诊断', String(unmatched.length));

  // 再装一遍必须完全幂等
  const before = readFileSync(join(HOME, 'profiles', PROFILE, 'package.json'), 'utf8');
  const again = dsh('plugin', '--profile', PROFILE, 'add', selfMounting[0].path.replace(/\\/g, '/'));
  expect(again.status === 0, '重复安装不报错');
  const after = readFileSync(join(HOME, 'profiles', PROFILE, 'package.json'), 'utf8');
  expect(before === after, '重复安装后 profile manifest 逐字节不变');

  const dump2 = dsh('--profile', PROFILE, '--dump-config');
  expect((dump2.stdout || '') === composed, '二次 dump-config 输出逐字节相同（组合幂等）');
}

function sh(cmd, cmdArgs, opts = {}) {
  return spawnSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
}
function winPath(p) {
  return p.replace(/\\/g, '/');
}
/**
 * 列一个 tarball 的条目。
 *
 * `--force-local` 是 **GNU tar** 专有旗标（不让它把 `C:/...` 里的 `C:` 当远程主机名去解析，
 * 否则报 `Cannot connect to C: resolve failed`）；Windows 上 PATH 里的 tar 是 **bsdtar**，
 * 它直接拒收这个旗标 —— 无条件传它会让 J2 在 windows runner 上对**每个包**都报
 * `Option --force-local is not supported`，整条产物审计全红（2026-10-19 CI 实测）。
 * bsdtar 本来就不需要这个旗标，所以先按 GNU 试，命中那句报错就退回不带旗标的一次。
 * 与 tools/itest/pack-audit.mjs 的 listTarball 同一套姿势。
 */
function listTarball(tgz) {
  const primary = sh('tar', ['--force-local', '-tzf', tgz]);
  if (primary.status === 0) return primary;
  if (!/--force-local/i.test(`${primary.stderr || ''}${primary.stdout || ''}`)) return primary;
  return sh('tar', ['-tzf', tgz]);
}
// Windows 上 npm 是 npm.cmd，spawnSync 不带 shell 解析不到、且**不会报错只会给空输出**
// （第一次跑 J2 就是这样静默失败了 2 个包）。必须显式走 shell。
function packTo(cwd, dest) {
  const r = sh('npm', ['pack', '--pack-destination', `"${dest}"`, '--ignore-scripts'], { cwd, shell: true });
  return r;
}

// pnpm 11 拦下依赖的构建脚本时，会在 profile 的 pnpm-workspace.yaml 里留下占位条目
// （allowBuilds: '<name>': set this to true or false）。插件页那句「Allow these scripts
// and retry」做的就是**把那行占位值就地改成 true 再重装**——这里照做。
// 非做不可的理由：图里只要留下一个未放行的构建脚本，此后**每一次** pnpm 调用都会被
// 同一个门禁整体拒掉（实测：曾有一次成员带入原生依赖后整条安装链全红，它们既没
// 装进去也没被组合验证过）。这不是给断言开后门——J2 的「全部安装成功」「每个 id 都
// 挂上」判据一字未改，只是把用户要手点的那一步补上。
//
// 重试前**必须回滚 package.json / pnpm-lock.yaml**，否则是「装上了却挂不上」的静默半装：
//   · 服务路径（插件页 / agent 工具 → installBundle）失败时会 restoreFiles 回滚这两个文件
//     （dsh-plugin-manager/lib/index.js:1646 读快照、:1722 catch 里回滚；RESTORED_FILES 见 :1028），
//     所以用户点重试时 before 里没有这个依赖，装完 reconcile 能看见「新增」并把 bundle 登记进
//     dsh.profile.bundles；
//   · CLI 路径（本 harness 与 CI 用的 `dsh plugin add`）走 runProfilePnpm，**只在版本不兼容那条
//     分支回滚**（lib/types/operations.js:428），构建门禁失败时依赖留在 package.json 里 ——
//     于是重试时 reconcile(before) 看到「无新增」，bundle 永远不登记。实测：dump-config 里
//     `id: better-sidebar` 出现 0 次，而 node_modules 里包装得好好的。
// 所以这里按服务路径的语义补回滚，测的才是用户在插件页点按钮时的那条路。
function addWithBuildApproval(profile, tarball) {
  const dir = join(HOME, 'profiles', profile);
  const snapshot = ['package.json', 'pnpm-lock.yaml'].map((name) => {
    const path = join(dir, name);
    return { path, text: existsSync(path) ? readFileSync(path, 'utf8') : null };
  });
  const rollback = () => {
    for (const file of snapshot) {
      if (file.text === null) rmSync(file.path, { force: true });
      else writeFileSync(file.path, file.text);
    }
  };
  let gated = false;
  let gateOut = '';
  for (let round = 0; ; round += 1) {
    const r = dsh('plugin', '--profile', profile, 'add', tarball);
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.status === 0 || round >= 3) return { status: r.status, out, gated, gateOut };
    if (!/ERR_PNPM_IGNORED_BUILDS|Ignored build scripts|pendingBuilds/i.test(out)) return { status: r.status, out, gated, gateOut };
    const wsFile = join(dir, 'pnpm-workspace.yaml');
    if (!existsSync(wsFile)) return { status: r.status, out, gated, gateOut };
    const before = readFileSync(wsFile, 'utf8');
    const approved = before.replace(/set this to true or false/g, 'true');
    if (approved === before) return { status: r.status, out, gated, gateOut };
    writeFileSync(wsFile, approved);
    gated = true;
    gateOut = out;
    rollback();
    console.log('  [approve] 回滚 manifest + 放行构建脚本后重试（= 插件页「Allow these scripts and retry」）');
  }
}

// ---------- J2：npm pack 成真的 tarball 再装 ----------
// 为什么非用 tarball 不可：**路径安装（link:）会掩盖 files 白名单的错误**——
// pnpm 对 link: 依赖既不装它自己的 dependencies，也不看 files 字段。
// 只有 tarball 才走 npm 打包（受 files 控制）+ pnpm 真解析依赖这两条路，
// 而那正是「private:true 直接拒绝发布」和「产物里混进 node_modules / 带 sourcesContent 的 .map」
// 这类问题唯一会现形的地方。
if (job.includes('j2')) {
  console.log('\n########## J2：tarball 打包 + 安装 + 组合 ##########');
  const TARBALLS = join(HOME, 'tarballs');
  mkdirSync(TARBALLS, { recursive: true });
  // 本地跑时可以只挑几个零依赖的包，避免整轮拉 registry
  const only = process.env.ITEST_J2_ONLY ? process.env.ITEST_J2_ONLY.split(',') : null;
  const targets = selfMounting.filter((p) => !only || only.includes(p.dir));
  console.log(`  打包 ${targets.length} 个${only ? '（已按 ITEST_J2_ONLY 过滤）' : ''}`);

  const packed = [];
  let packRejected = 0;
  for (const p of targets) {
    const r = packTo(p.path, TARBALLS);
    const out = (r.stdout || '') + (r.stderr || '');
    const file = (out.match(/([\w.@/-]+?\.tgz)/) || [])[0];
    if (r.status !== 0 || !file) {
      packRejected += 1;
      console.log(`  FAIL npm pack ${p.dir}: ${out.split('\n').filter(Boolean).slice(-2).join(' | ') || '(无输出)'}`);
      continue;
    }
    packed.push({ ...p, tarball: join(TARBALLS, file) });
  }
  expect(packRejected === 0, `全部 ${targets.length} 个包 npm pack 成功（private:true 会直接被拒）`, `${packRejected} 个失败`);
  // 下游断言在 packed 为空时全是「0 个全部通过」的假绿，必须短路掉
  if (!packed.length) {
    console.log('  → 没有任何 tarball，跳过后续产物/安装/组合断言（上面的 pack 失败就是根因）');
  } else {

  // 产物内容审计：files 白名单没写对的包在这里露出来
  let contentBad = 0;
  for (const p of packed) {
    // 列条目走 listTarball：旗标给不给要按 tar 的实现来（见它上面的注释）
    const listing = listTarball(p.tarball);
    if (listing.status !== 0) {
      contentBad += 1;
      console.log(`  FAIL tar -tzf ${p.dir}: ${(listing.stderr || '').trim()}`);
      continue;
    }
    const entries = (listing.stdout || '').split('\n').filter(Boolean);
    const problems = [];
    if (entries.some((e) => /\/node_modules\//.test(e))) problems.push('混进 node_modules');
    if (entries.some((e) => /\.map$/.test(e))) problems.push('带 .map 产物');
    if (!entries.some((e) => /\/package\.json$/.test(e))) problems.push('缺 package.json');
    if (!entries.some((e) => /cordis\.patch\.yml$/.test(e))) problems.push('缺 cordis.patch.yml（装了也挂不上）');
    if (entries.length > 400) problems.push(`条目过多(${entries.length})，疑似没写 files 白名单`);
    if (problems.length) {
      contentBad += 1;
      console.log(`  FAIL ${p.dir} [${entries.length} 条目]: ${problems.join('; ')}`);
    }
  }
  expect(contentBad === 0, `${packed.length} 个 tarball 产物内容干净`, `${contentBad} 个有问题`);

  const PROFILE = 'itest2';
  // 两类包两条判据（不是给谁开后门，是判据本该按语义分类）：
  //   · 成员包：依赖里没有 @dsh-pack/* ⇒ 离线安装不碰 registry，判据严格（必装必挂）。
  //   · 元包：依赖就是 @dsh-pack/* 的**未发布版本** ⇒ 离线物理上装不上。pnpm 的原话有三套
  //     （见下面 unpublishedDepFailure），所以对它要求「要么装成功，要么失败原因就是这个」
  //     ——别的错（patch/manifest/构建门禁）一律红；版本一旦发布（或用本地 registry）就自动
  //     变成硬要求。
  //     元包真正的安装语义（一个输入装齐一层）只在 registry 上验得到，用户侧两条通道见
  //     docs/install-from-tarballs.md；它的离线可验部分（依赖表 ↔ 成员）由 self-mount 门禁把守。
  const needsRegistry = (p) => (p.deps || []).some((d) => d.startsWith('@dsh-pack/'));
  const memberPacks = packed.filter((p) => !needsRegistry(p));
  const metaPacks = packed.filter(needsRegistry);

  // pnpm 对「这个包名在 registry 上不存在」在不同版本有三套原话，都实测出现过：
  //   · The latest release of @dsh-pack/x is "0.1.0"（同名包在，版本对不上）
  //   · No matching version found / ERR_PNPM_NO_MATCHING_VERSION
  //   · @dsh-pack/x is not in the npm registry, or you have no permission to fetch it.
  //     —— pnpm 11.7 走这条（2026-10-19 CI 实测：J2 的元包就是这么失败的）
  // pnpm 对「这个包名在 registry 上不存在」在不同版本有三套原话，都实测出现过：
  //   · The latest release of @dsh-pack/x is "0.1.0"（同名包在，版本对不上）
  //   · No matching version found / ERR_PNPM_NO_MATCHING_VERSION
  //   · @dsh-pack/x is not in the npm registry, or you have no permission to fetch it.
  //     —— pnpm 11.7 走这条（2026-10-19 实测：CI 与本机 J2 的元包都是这么失败的）
  // 只认「那一行同时点到 @dsh-pack 依赖与取不到这一类措辞」的那一类：外部依赖或内核包的
  // 404 不算，那正是我们要让 J2 变红的情形。命中时返回那一行原文，既当判据也当打印的理由。
  const NOT_ON_REGISTRY = /is not in the npm registry|No matching version found|ERR_PNPM_NO_MATCHING_VERSION|ERR_PNPM_FETCH_404|latest release of @dsh-pack/i;
  function unpublishedDepLine(text) {
    const line = text.split('\n').find((l) => /@dsh-pack\/[\w.-]+/.test(l) && NOT_ON_REGISTRY.test(l));
    return line ? line.trim() : null;
  }
  const unpublishedDepFailure = (text) => Boolean(unpublishedDepLine(text));

  let installed = 0;
  for (const p of memberPacks) {
    const r = addWithBuildApproval(PROFILE, winPath(p.tarball));
    if (r.status === 0) installed += 1;
    else console.log(`  安装失败 ${p.dir}: ${r.out.split('\n').filter(Boolean).slice(-3).join(' | ')}`);
  }
  expect(
    installed === memberPacks.length,
    `${installed}/${memberPacks.length} 个成员 tarball 安装成功（离线，不依赖 registry）`,
    `${memberPacks.length - installed} 个失败`
  );

  const metaWrong = [];
  for (const p of metaPacks) {
    const r = addWithBuildApproval(PROFILE, winPath(p.tarball));
    const evidence = `${r.out}\n${latestOperationLog(PROFILE)}`;
    const tail = r.out.split('\n').filter(Boolean).slice(-3).join(' | ');
    if (r.status === 0) {
      console.log(`  元包 ${p.dir}：registry 上有全部依赖版本，装成功（含「一个输入装齐一层」的组合）`);
    } else if (unpublishedDepFailure(evidence)) {
      console.log(`  元包 ${p.dir}：依赖版本未发布，离线装不上（预期；离线替代路径=装成员 tarball）`);
      console.log(`         ${unpublishedDepLine(evidence) || tail}`);
    } else {
      metaWrong.push(`${p.dir}: ${tail}`);
    }
  }
  expect(
    metaWrong.length === 0,
    `${metaPacks.length} 个元包要么装成功、要么只因依赖未发布而失败（其它原因一律红）`,
    metaWrong.join('; ')
  );

  const dump = dsh('--profile', PROFILE, '--dump-config');
  const composed = dump.stdout || '';
  expect(dump.status === 0, 'J2 profile 的 --dump-config 退出 0');
  // 同 J1：出现次数不是安全指标（dump 按来源层分组，出现两次可能完全正常），
  // 这里只断言「挂进了最终树」；同 id 不同 name 的抢占由 J1 那条负责把守。
  const off = [];
  for (const p of packed) {
    for (const id of p.ids) {
      if (!new RegExp(`^- id: ${id}$`, 'm').test(composed)) off.push(`${p.dir}(id=${id}) 没挂上`);
    }
  }
  expect(off.length === 0, 'tarball 安装后每个 loader id 都出现在最终树里', off.slice(0, 8).join('; '));
  // 这一类失败会让官方客户端直接拒绝启动，必须在 CI 里抓到
  const fatal = composed.match(/ClientPackageCompositionError|client-modules:|multiple active Loader sources/g) || [];
  expect(fatal.length === 0, '无「一个包写错就砖掉启动」的组合错误', fatal.slice(0, 3).join('; '));
  }
}

// ---------- J3：带原生依赖的包在内核 + pnpm 下的装配安全性 ----------
// 现成员集合**没有**任何 install 脚本，所以这里测的不是「我们自己会不会弹放行」，
// 而是「哪天有成员带进原生依赖时，装配会不会被搞坏」：拦下就要能按 UI 那一步放行后装成，
// 没拦就要一次装成，两种形态最后都必须 --dump-config 退 0 且行挂进树。
// 为什么不再断言「必须拦得到」：同一份夹具在内核 0.2.0-rc.1 上直接装完、不提构建脚本，
// 在 0.2.1-rc.2 上会被拦并写 allowBuilds 占位（两处 2026-10-19 各自实测）。
// 放行文案与恢复步骤的用户侧文档已随成员集合收缩一并从 README/recovery.md 删掉了。
if (job.includes('j3')) {
  console.log('\n########## J3：构建脚本放行（pendingBuilds → allowBuilds） ##########');
  const FIX = join(HOME, 'fixture-native');
  mkdirSync(join(FIX, 'lib'), { recursive: true });
  writeFileSync(
    join(FIX, 'package.json'),
    JSON.stringify({
      name: '@itest/native',
      version: '0.1.0',
      type: 'module',
      main: 'lib/index.js',
      license: 'MIT',
      dsh: { manifestVersion: 1, bundle: { patch: './cordis.patch.yml' } },
      // 真实带 node-gyp-build 的依赖，用来触发构建脚本门禁
      dependencies: { '@photostructure/sqlite': '1.2.1' },
    }, null, 2)
  );
  writeFileSync(join(FIX, 'cordis.patch.yml'), "- insert:\n    - id: itest-native\n      name: '@itest/native'\n");
  writeFileSync(join(FIX, 'lib/index.js'), 'export const name="itest-native";\nexport const inject=[];\nexport function apply(){}\n');

  const PROFILE = 'itest3';
  // 必须从 **tarball** 装，不能从路径装：路径安装会写成 link: 规格，
  // pnpm 根本不装它的 dependencies，也就永远不会触发构建脚本门禁 —— 那正是
  // 本 job 要验的东西。（实测踩过：装路径时输出里连 sqlite 都没出现。）
  const T3 = join(HOME, 'tarballs3');
  mkdirSync(T3, { recursive: true });
  const packedFix = packTo(FIX, T3);
  const fixFile = (((packedFix.stdout || '') + (packedFix.stderr || '')).match(/([\w.@/-]+?\.tgz)/) || [])[0];
  expect(Boolean(fixFile) && packedFix.status === 0, 'J3 fixture 打包成功',
    ((packedFix.stdout || '') + (packedFix.stderr || '')).split('\n').filter(Boolean).slice(-3).join(' | '));
  if (!fixFile) {
    console.log('  → fixture 没打成 tarball，跳过 J3 后续断言');
  } else {
  const tailOf = (s) => s.split('\n').filter(Boolean).slice(-4).join(' | ');
  const FIX_TARBALL = winPath(join(T3, fixFile));
  // 走 J1/J2 同一个 addWithBuildApproval：它按「插件页那个按钮」的真实动作序列做事
  // （装 → 被拦则就地把 allowBuilds 占位改成 true → 回滚 package.json/pnpm-lock → 重试）。
  // 为什么不各写一支：CLI 这条路在构建门禁失败时**不回滚** manifest，于是重试时
  // reconcile 看不到「新增依赖」，bundle 永远不登记 —— 装上了却挂不上（本文件上面那段
  // 注释记的就是这个坑）。手写「改 allowBuilds + 直接 add」的简化版会把它复现成假失败。
  // 两种内核形态都合法且都实测过（2026-10-19）：0.2.1-rc.2 + pnpm 11.7 会拦并写占位条目
  // （本机），0.2.0-rc.1 直接装完、不提构建脚本（CI）。所以判据不要求「必须拦得到」，
  // 只要求**走到同一个终点**：装上、profile 能用、行挂进树。
  const r3 = addWithBuildApproval(PROFILE, FIX_TARBALL);
  console.log(`  构建门禁形态：${r3.gated ? '拦下后放行重试' : '未拦，一次装完'}（内核 ${kernelVersionOf()}）`);
  if (r3.gated) {
    expect(/@photostructure\/sqlite/.test(r3.gateOut || ''), '被拦时，失败信息里点名 @photostructure/sqlite');
  }
  expect(r3.status === 0, '带原生依赖的夹具最终安装成功', tailOf(r3.out));
  const dump3 = dsh('--profile', PROFILE, '--dump-config');
  expect(dump3.status === 0, 'J3 profile 的 --dump-config 退出 0（两种放行形态都不许砖装配）',
    tailOf((dump3.stdout || '') + (dump3.stderr || '')));
  expect(/itest-native/.test(dump3.stdout || ''), '夹具的 loader 行挂进最终树');
  }
}

if (!keep) rmSync(HOME, { recursive: true, force: true });
else console.log(`\n保留临时 home: ${HOME}`);

console.log(`\n===== ${job.join('+').toUpperCase()} 结果：${failures.length === 0 ? 'PASS' : 'FAIL(' + failures.length + ')'} =====`);
for (const f of failures) console.log('  - ' + f);
process.exit(failures.length === 0 ? 0 : 1);
