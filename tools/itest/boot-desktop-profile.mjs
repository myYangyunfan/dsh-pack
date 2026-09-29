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

import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
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
  // 优先用显式指定，其次用仓库里已装好的，最后退回临时安装
  const candidates = [
    process.env.DSH_KERNEL_BIN,
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
// 同一个门禁整体拒掉（实测：better-sidebar 引入 node-pty 之后 28 个包全红，它们既没
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
  for (let round = 0; ; round += 1) {
    const r = dsh('plugin', '--profile', profile, 'add', tarball);
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.status === 0 || round >= 3) return { status: r.status, out };
    if (!/ERR_PNPM_IGNORED_BUILDS|Ignored build scripts|pendingBuilds/i.test(out)) return { status: r.status, out };
    const wsFile = join(dir, 'pnpm-workspace.yaml');
    if (!existsSync(wsFile)) return { status: r.status, out };
    const before = readFileSync(wsFile, 'utf8');
    const approved = before.replace(/set this to true or false/g, 'true');
    if (approved === before) return { status: r.status, out };
    writeFileSync(wsFile, approved);
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
    // --force-local：git-bash 的 GNU tar 会把 "C:/..." 里的 C: 当成远程主机名去解析，
    // 报 "Cannot connect to C: resolve failed"。Windows 上必须显式告诉它这是本地路径。
    const listing = sh('tar', ['--force-local', '-tzf', p.tarball]);
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
  //   · 元包：依赖就是 @dsh-pack/* 的**未发布版本** ⇒ 离线物理上装不上。实测 pnpm 的
  //     原话：`The latest release of @dsh-pack/dsh-auto-compact is "0.1.0"`（元包要 ^0.1.1）。
  //     所以对它要求「要么装成功，要么失败原因就是这个」——别的错（patch/manifest/构建门禁）
  //     一律红；版本一旦发布（或用本地 registry）就自动变成硬要求。
  //     元包真正的安装语义（一个输入装齐一层）只在 registry 上验得到，用户侧两条通道见
  //     docs/install-from-tarballs.md；它的离线可验部分（依赖表 ↔ 成员）由 self-mount 门禁把守。
  const needsRegistry = (p) => (p.deps || []).some((d) => d.startsWith('@dsh-pack/'));
  const memberPacks = packed.filter((p) => !needsRegistry(p));
  const metaPacks = packed.filter(needsRegistry);

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
    const tail = r.out.split('\n').filter(Boolean).slice(-3).join(' | ');
    if (r.status === 0) {
      console.log(`  元包 ${p.dir}：registry 上有全部依赖版本，装成功（含「一个输入装齐一层」的组合）`);
    } else if (/latest release of @dsh-pack\/|No matching version found|ERR_PNPM_NO_MATCHING_VERSION/i.test(r.out)) {
      console.log(`  元包 ${p.dir}：依赖版本未发布，离线装不上（预期；离线替代路径=装成员 tarball）`);
      console.log(`         ${tail}`);
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

// ---------- J3：pnpm 11 构建脚本放行的真实流程 ----------
// 目的不是验证「能不能装原生包」，而是**钉住文档**：knowledge 层 README 写了要点
// 「Allow these scripts and retry」。哪天失败文案变了、或不再需要放行，这个断言会红，
// 就是在提醒文档该更新了。
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
      // 与 knowledge 层同一个带 node-gyp-build 的依赖
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
  const first = dsh('plugin', '--profile', PROFILE, 'add', winPath(join(T3, fixFile)));
  const firstOut = (first.stdout || '') + (first.stderr || '');
  const blocked = /pendingBuilds|ignored[_ -]?builds|Allow these scripts|approve-builds|build scripts/i.test(firstOut);
  expect(blocked, '首次安装被 pnpm 构建脚本门禁拦住（与 knowledge 层 README 说法一致）',
    blocked ? '' : `实际输出尾部: ${firstOut.split('\n').filter(Boolean).slice(-4).join(' | ')}`);
  if (blocked) {
    expect(/@photostructure\/sqlite/.test(firstOut), '失败信息里点名 @photostructure/sqlite');
    // pnpm 拦下构建脚本时，会在 profile 的 pnpm-workspace.yaml 里写一个**占位**条目：
    //   allowBuilds:
    //     '@photostructure/sqlite': set this to true or false
    // 「Allow these scripts and retry」这个按钮做的事就是把那行占位值就地改成 true。
    // 早期实现是往文件尾部**再追加**一个 allowBuilds: 键 —— YAML 直接重复键报错，
    // pnpm add 失败。必须就地替换占位值，才是对用户动作的忠实模拟。
    const wsFile = join(HOME, 'profiles', PROFILE, 'pnpm-workspace.yaml');
    if (existsSync(wsFile)) {
      const before = readFileSync(wsFile, 'utf8');
      const approved = before.replace(/set this to true or false/g, 'true');
      expect(approved !== before, '占位值 set this to true or false 存在（UI 就是改这一行）');
      writeFileSync(wsFile, approved);
    }
    const retry = dsh('plugin', '--profile', PROFILE, 'add', winPath(join(T3, fixFile)));
    expect(retry.status === 0, '放行后重试安装成功',
      ((retry.stdout || '') + (retry.stderr || '')).split('\n').filter(Boolean).slice(-4).join(' | '));
  }
  }
}

if (!keep) rmSync(HOME, { recursive: true, force: true });
else console.log(`\n保留临时 home: ${HOME}`);

console.log(`\n===== ${job.join('+').toUpperCase()} 结果：${failures.length === 0 ? 'PASS' : 'FAIL(' + failures.length + ')'} =====`);
for (const f of failures) console.log('  - ' + f);
process.exit(failures.length === 0 ? 0 : 1);
