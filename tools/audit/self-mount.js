'use strict';

// ---------------------------------------------------------------------------
// self-mount —— 「bundle 必须自挂载」门。
//
// 实测（真机官方客户端 0.1.7-rc.1 / desktop profile）：
//   · `dsh plugin add <pkg>` 只把包名写进 dsh.profile.bundles 与 dependencies；
//     真正把 loader 行插进补丁层的是 **包自带的 cordis.patch.yml**
//     （由 package.json → dsh.bundle.patch 指过去）；
//   · profile 自己的 cordis.patch.yml 全程保持 []，官方不替你写挂载行；
//   · 没有 dsh.bundle.patch 的包，管理器直接报 not-bundle 并回滚整次安装。
// 所以少这一行声明 = 装了但永远不挂载（或直接装不上），必须 fail-closed。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');

const {
  REPO_ROOT,
  detectPackRoot,
  finding,
  parsePatchYaml,
  bundlePatchDecl,
  isPathInside,
} = require('./shared');

const CHECK = 'self-mount';

/**
 * 不挂载的包：纯能力库，没有 cordis loader 半边，因此不该有 bundle patch。
 * 迁移后 host-capabilities 是探针库（packages/host-capabilities），它是第一个。
 * 只有确凿「不是 bundle」的包才允许进这里，加名字等于放宽门。
 */
const META_PACKAGES = new Set(['host-capabilities']);

/** 是否元包：整名命中，或去 scope 后的末段命中（@dsh-pack/host-capabilities 也算）。 */
function isMetaPackage(pkg) {
  const name = pkg.manifest && pkg.manifest.name;
  if (META_PACKAGES.has(pkg.dirname)) return true;
  if (typeof name === 'string' && META_PACKAGES.has(name)) return true;
  return false;
}

/** 分层元包：目录名 `meta-<tier>`，是**真 bundle**，但它插的是成员的 row，
 * 不插自己——实测元包的传递依赖根本不会变成 bundle（装上去零报错、零挂载），
 * 所以「必须自带成员 row」正是它存在的唯一理由。
 * 与 META_PACKAGES（host-capabilities 那种不挂载的能力库）是两回事。
 *
 * 因此元包有两条例外：① 不要求「patch 里有自己的 row」；
 * ② 它与成员声明同一个 id 是**设计如此**，只要两边 row 字节一致就是安全的
 *   （cordis 补丁按 id 整行替换，重复应用同一条 = no-op）。
 *   J1 实测过：35 插件 + 6 元包同时装进一个 profile，69 个 id 全部组合进树、
 *   没有任何 id 指向两个不同 name、二次 dump 逐字节相同。
 *   真正危险的是「同 id 指向不同包」——那才是后写层把别人的行整行抢走。 */
function isTierMeta(pkg) {
  return typeof pkg.dirname === 'string' && pkg.dirname.startsWith('meta-');
}

/**
 * 读一个包的 bundle patch，抽出全部 loader id 与 insert 行。
 * 解析失败不抛异常，返回 errors，让调用方产成 finding（一个坏文件不该崩掉整轮审计）。
 * @returns {{patchFiles:string[], ids:Array<{id:string,file:string,block:string}>,
 *            inserts:Array<{id:string,name:string,file:string}>, errors:string[]}}
 */
function readBundlePatch(pkg) {
  const result = { patchFiles: [], ids: [], inserts: [], errors: [] };
  const decl = bundlePatchDecl(pkg.manifest);
  if (decl === undefined || decl === null) return result;

  const list = Array.isArray(decl) ? decl : [decl];
  for (const entry of list) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      result.errors.push(`dsh.bundle.patch 含非法条目 ${JSON.stringify(entry)}（必须是字符串或字符串数组）`);
      continue;
    }
    const abs = path.resolve(pkg.dir, entry);
    if (!isPathInside(pkg.dir, abs)) {
      result.errors.push(`dsh.bundle.patch 指向包外：${entry}`);
      continue;
    }
    if (!fs.existsSync(abs)) {
      result.errors.push(`dsh.bundle.patch 指向的文件不存在：${entry}`);
      continue;
    }
    result.patchFiles.push(abs);
    let doc;
    try {
      doc = parsePatchYaml(fs.readFileSync(abs, 'utf8'));
    } catch (e) {
      result.errors.push(`${entry} 不是可解析的 YAML：${e.message.split('\n')[0]}`);
      continue;
    }
    if (!Array.isArray(doc)) {
      result.errors.push(
        `${entry} 顶层必须是条目数组（cordis 补丁层是 entry-list 方言），实得 ${doc === null ? 'null' : typeof doc}`
      );
      continue;
    }
    for (const block of doc) {
      if (!block || typeof block !== 'object') {
        result.errors.push(`${entry} 含非法条目块 ${JSON.stringify(block)}`);
        continue;
      }
      for (const [op, rows] of Object.entries(block)) {
        const rowList = Array.isArray(rows) ? rows : [rows];
        for (const row of rowList) {
          if (row && typeof row === 'object' && typeof row.id === 'string') {
            result.ids.push({ id: row.id, file: entry, block: op });
          }
          if (op === 'insert' && row && typeof row === 'object') {
            result.inserts.push({ id: row.id, name: row.name, file: entry });
          }
        }
      }
    }
  }
  return result;
}

/**
 * tier 映射：loader id 的第二事实源，用来抓「两处 id 漂移」。
 * issue #104 的教训就是 id 不一致会让自愈的 dropBlocksByIds 永不命中 → 双登记启动崩溃。
 *
 * 两个来源按阶段各管一段，**且都必须给出结果**：
 *   · 迁移期：dsh-desktop/scripts/lib/companion-plugins.js 的 COMPANION_PLUGINS；
 *   · 迁移后：该文件被删，若这时直接返回 null，本项检查就**静默失效**——
 *     看着像「没有 drift」，其实是根本没在比。所以退到 tools/tiers.json，
 *     并从成员包自己的 cordis.patch.yml 反查 id，等价地守住同一条不变量。
 */
function loadTierMap(repoRoot = REPO_ROOT) {
  const legacy = path.join(repoRoot, 'dsh-desktop', 'scripts', 'lib', 'companion-plugins.js');
  if (fs.existsSync(legacy)) {
    try {
      const mod = require(legacy);
      if (Array.isArray(mod.COMPANION_PLUGINS)) return mod.COMPANION_PLUGINS;
    } catch {
      /* 落到 tiers.json */
    }
  }
  const tiersPath = path.join(repoRoot, 'tools', 'tiers.json');
  if (!fs.existsSync(tiersPath)) return null;
  try {
    const tiers = JSON.parse(fs.readFileSync(tiersPath, 'utf8'));
    const entries = [];
    const memberLists = Array.isArray(tiers) ? [tiers] : Object.values(tiers.tiers || tiers).map((t) => t.members || t.plugins || t);
    for (const list of memberLists) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const dir = typeof item === 'string' ? item : item && (item.dir || item.name);
        if (typeof dir !== 'string') continue;
        entries.push({ name: dir, id: (typeof item === 'object' && item && item.id) || null });
      }
    }
    return entries.length ? entries : null;
  } catch {
    return null;
  }
}

function run(ctx = {}) {
  const pack = ctx.pack || detectPackRoot();
  const findings = [];
  if (!pack.exists) {
    findings.push(finding(CHECK, 'error', '未找到插件包根，无法检查自挂载声明'));
    return findings;
  }
  const packages = pack.packages;
  const tierMap = ctx.tierMap === undefined ? loadTierMap() : ctx.tierMap;
  const idOwners = new Map(); // id -> [包相对路径]

  for (const pkg of packages) {
    const label = pkg.label;
    if (!pkg.manifest) {
      findings.push(finding(CHECK, 'error', `package.json 解析失败：${pkg.error}`, label));
      continue;
    }
    const name = pkg.manifest.name;
    const isMeta = isMetaPackage(pkg);
    const isTier = isTierMeta(pkg);
    const decl = bundlePatchDecl(pkg.manifest);

    if (decl === undefined || decl === null) {
      findings.push(
        finding(
          CHECK,
          isMeta ? 'info' : 'error',
          isMeta
            ? '元包（能力库，不挂载）：无 dsh.bundle.patch 属预期'
            : '缺 dsh.bundle.patch：`dsh plugin add` 会判定 not-bundle 并回滚安装；' +
              '即便手工塞进 profile，也没有任何东西插入 loader 行（官方 profile 的 cordis.patch.yml 恒为 []）',
          label
        )
      );
      if (!isMeta) {
        const defaultPatch = path.join(pkg.dir, 'cordis.patch.yml');
        if (!fs.existsSync(defaultPatch)) {
          findings.push(finding(CHECK, 'error', '包根下也没有 cordis.patch.yml 可用', label));
        } else {
          findings.push(
            finding(CHECK, 'error', 'cordis.patch.yml 已在包根，但 manifest 未声明 dsh.bundle.patch 指过去', label)
          );
        }
      }
      continue;
    }

    const parsed = readBundlePatch(pkg);
    for (const msg of parsed.errors) findings.push(finding(CHECK, 'error', msg, label));

    // 只统计 insert 行：冲突的危害在于「同一个 id 被两个不同包各自挂载」。
    for (const r of parsed.inserts) {
      if (typeof r.id !== 'string' || r.id.trim() === '') continue;
      if (!idOwners.has(r.id)) idOwners.set(r.id, []);
      idOwners.get(r.id).push({ label, name: r.name, tier: isTier });
    }

    if (parsed.patchFiles.length === 0) continue;

    // 必须有一个 insert 块，且行内 name 指向本包（loader 用 name 做 tree.import 的包名）
    const own = parsed.inserts.filter(
      (r) => r.name === name || (typeof r.name === 'string' && r.name.startsWith(`${name}/`))
    );
    if (own.length === 0) {
      const seen = parsed.inserts.map((r) => `${r.id}=${r.name}`).join(', ') || '(无)';
      if (isTier) {
        // 分层元包按设计不插自己那一行，插的是成员行。但它必须**至少插一行**，
        // 否则这个分层是空壳：装得上、不报错、什么都不挂（这正是要防的静默失效）。
        if (parsed.inserts.length === 0) {
          findings.push(
            finding(
              CHECK,
              'error',
              `分层元包的 bundle patch 里一条 insert 行都没有：这个分层是空壳，` +
                `装上去不会挂载任何插件，而且不报错。检查 tools/tiers.json 的成员名单与生成器`,
              label
            )
          );
        }
      } else {
        findings.push(
          finding(
            CHECK,
            'error',
            `bundle patch 里没有挂载本包的 insert 行：需要 row.name === ${JSON.stringify(name)}` +
              `（或其子路径），实得 ${seen}。patch 按 id 整行替换、不做字段合并，` +
              `只靠 update/覆盖式登记无法新建条目`,
            label
          )
        );
      }
    }
    for (const r of parsed.inserts) {
      if (typeof r.id !== 'string' || r.id.trim() === '') {
        findings.push(finding(CHECK, 'error', `insert 行缺 id（r${r.name ? ` name=${r.name}` : ''}），cordis 无法寻址`, label));
      }
    }

    // tier 映射一致性（id 必须与登记处一致，issue #104）
    if (Array.isArray(tierMap)) {
      const registered = tierMap.filter((e) => e && (e.name === name || companionOf(e.name) === pkg.dirname));
      for (const entry of registered) {
        // tiers.json 的成员条目只有 {dir, purpose}，**不带 id**——迁移后 loader id 的
        // 唯一事实源就是包自己那份 cordis.patch.yml，没有第二处可比。
        // 这种「无对照项」必须跳过而不是报 null 不一致；早期实现把 34 个包全报成
        // error，正是拿缺失字段当值比对的典型错误。
        if (!entry.id) continue;
        if (!parsed.ids.some((x) => x.id === entry.id)) {
          findings.push(
            finding(
              CHECK,
              'error',
              `tier 映射登记的 id 是 ${JSON.stringify(entry.id)}，` +
                `但 bundle patch 声明的 id 是 [${parsed.ids.map((x) => x.id).join(', ') || '空'}]：` +
                `两处 id 不一致会让自愈的 dropBlocksByIds 永不命中 → 双登记启动崩溃`,
              label
            )
          );
        }
      }
    }
  }

  // 同 id 多声明：只有**指向不同包**才是真危险（后写的层按 id 整行抢走别人的条目，
  // issue #104 的双登记启动崩溃属此类）。元包与成员共用一条字节相同的 row 是设计使然，
  // 按 id 整行替换下第二次应用是 no-op —— J1 已实测 41 包同装、69 id 无一歧义、dump 幂等。
  for (const [id, owners] of [...idOwners].sort()) {
    if (owners.length < 2) continue;
    const names = [...new Set(owners.map((o) => String(o.name)))];
    if (names.length > 1) {
      findings.push(
        finding(
          CHECK,
          'error',
          `loader id ${JSON.stringify(id)} 被 ${owners.length} 个包声明成 ${names.length} 个不同 name ` +
            `[${owners.map((o) => `${o.label}→${o.name}`).join(', ')}]：` +
            `cordis 补丁按 id 整行替换，后写的层会把别人的条目整行抢走（双登记启动崩溃，issue #104 同类）`,
          owners[owners.length - 1].label
        )
      );
      continue;
    }
    const nonTier = owners.filter((o) => !o.tier);
    if (nonTier.length > 1) {
      findings.push(
        finding(
          CHECK,
          'error',
          `两个非元包包都插了同一条 id ${JSON.stringify(id)}（name 同为 ${names[0]}）：` +
            `同名的两个物理拷贝会触发 "resolves from multiple active Loader sources" 而让官方客户端拒绝启动`,
          nonTier[nonTier.length - 1].label
        )
      );
      continue;
    }
    findings.push(
      finding(
        CHECK,
        'info',
        `id ${JSON.stringify(id)} 由成员包与所属分层元包各插一次，两边 name 同为 ${names[0]}：` +
          `补丁按 id 整行替换 ⇒ 重复应用是 no-op，属分层设计`,
        owners[owners.length - 1].label
      )
    );
  }
  return findings;
}

/** 与 companion-plugins.companionDirName 同构的最小版（不依赖那个模块也能跑）。 */
function companionOf(name) {
  if (typeof name !== 'string') return null;
  return name.includes('/') ? name.slice(name.indexOf('/') + 1) : name;
}

module.exports = { CHECK, run, readBundlePatch, loadTierMap, META_PACKAGES, isMetaPackage, companionOf };

if (require.main === module) {
  const findings = run();
  for (const f of findings) console.log(`[${f.severity}] ${f.pkg || '-'}: ${f.message}`);
  console.log(`self-mount: ${findings.length} 项发现`);
  process.exitCode = findings.some((f) => f.severity === 'error') ? 1 : 0;
}
