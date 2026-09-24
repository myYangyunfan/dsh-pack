'use strict';

// ---------------------------------------------------------------------------
// tools/audit 共用底座：包根探测、依赖解析、finding 结构。
//
// 为什么单独一个文件：七项检查都要「对包根做纯函数」，包根探测与 semver/yaml
// 的解析姿势必须完全一致，否则同一次运行里不同检查看到的包集不同，报告就没法
// 横向对齐。
//
// 关键约束（AGENTS.md）：tools/ 下不建 package.json、不装依赖、不产 lockfile。
// semver 与 yaml 只在 dsh-desktop/node_modules 里，因此显式按路径解析。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const HERE = __dirname;
const REPO_ROOT = path.resolve(HERE, '..', '..');

/** 该目录下含 package.json 的子目录（一层，兼容 packages/@scope/name）。 */
function packageDirsOf(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const sub = path.join(dir, e.name);
    if (fs.existsSync(path.join(sub, 'package.json'))) {
      out.push({ dir: sub, rel: e.name });
      continue;
    }
    if (e.name.startsWith('@')) {
      for (const s of fs.readdirSync(sub, { withFileTypes: true })) {
        if (s.isDirectory() && fs.existsSync(path.join(sub, s.name, 'package.json'))) {
          out.push({ dir: path.join(sub, s.name), rel: `${e.name}/${s.name}` });
        }
      }
    }
  }
  return out;
}

/** 该目录是否已经是「包集」（至少一个含 package.json 的子目录）。 */
function looksLikePack(dir) {
  return packageDirsOf(dir).length > 0;
}

/**
 * 探测插件包根。
 *
 * 规则：packages/ 只要含插件目录就认它（迁移后的正式落点），否则退回
 * dsh-desktop/assets/plugins/。但迁移是逐包搬家的过程，两个根会**同时**有货，
 * 只看一个根会让另一半包从门里溜走——所以 roots 收集全部有货的根，
 * root/label/stage 仍是「主根」，检查项默认跑主根，跨根扫描用 allPackages()。
 */
function detectPackRoot(repoRoot = REPO_ROOT) {
  const specs = [
    { root: path.join(repoRoot, 'packages'), stage: '迁移后' },
    { root: path.join(repoRoot, 'dsh-desktop', 'assets', 'plugins'), stage: '迁移前' },
  ];
  const roots = specs
    .filter((s) => looksLikePack(s.root))
    .map((s) => ({
      root: s.root,
      label: toRepoRelative(s.root, repoRoot),
      stage: s.stage,
      packageCount: packageDirsOf(s.root).length,
    }));
  if (roots.length === 0) {
    return {
      root: specs[0].root,
      label: toRepoRelative(specs[0].root, repoRoot),
      stage: '未找到',
      exists: false,
      roots: [],
      split: false,
    };
  }
  const primary = roots[0];
  const result = {
    root: primary.root,
    label: primary.label,
    stage: primary.stage,
    exists: true,
    roots,
    // 两个根同时有货 = 树处于半迁移状态，必须在报告里说出来
    split: roots.length > 1,
  };
  result.packages = listPackages(result);
  return result;
}

function toRepoRelative(abs, repoRoot = REPO_ROOT) {
  return path.relative(repoRoot, abs).split(path.sep).join('/');
}

/** 一个包的快照：目录、相对路径、manifest（解析失败时带 error）。 */
function listPackagesUnder(packRoot, labelPrefix = '') {
  const out = [];
  for (const { dir, rel } of packageDirsOf(packRoot)) {
    const manifestPath = path.join(dir, 'package.json');
    let manifest = null;
    let error = null;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      error = e.message.split('\n')[0];
    }
    const name = rel.includes('/') ? rel.slice(rel.lastIndexOf('/') + 1) : rel;
    out.push({
      dir,
      relPath: rel,
      label: `${labelPrefix}${rel}`,
      dirname: name,
      packRoot,
      manifest,
      manifestPath,
      error,
    });
  }
  return out.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

/**
 * 列出包。传字符串 = 只列那一个根；传 detectPackRoot() 的结果 = 列全部有货的根
 * （半迁移树里唯一不会漏包的做法），多根时 label 带上根前缀以区分同名包。
 */
function listPackages(target) {
  if (typeof target === 'string') return listPackagesUnder(target);
  const roots = target && Array.isArray(target.roots) ? target.roots : [];
  if (roots.length === 0) return [];
  const multi = roots.length > 1;
  const out = [];
  for (const r of roots) {
    for (const pkg of listPackagesUnder(r.root, multi ? `${r.label}/` : '')) {
      pkg.packLabel = r.label;
      out.push(pkg);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 依赖解析（semver / yaml）
// ---------------------------------------------------------------------------

const DEP_SEARCH_ROOTS = [
  HERE,
  REPO_ROOT,
  path.join(REPO_ROOT, 'dsh-desktop'),
];

function loadDep(name) {
  const errors = [];
  const req = createRequire(path.join(HERE, 'noop.js'));
  for (const base of DEP_SEARCH_ROOTS) {
    try {
      return { mod: req(require.resolve(name, { paths: [base] })), from: base };
    } catch (e) {
      errors.push(`${base}: ${e.code || e.message.split('\n')[0]}`);
    }
  }
  // 兜底：直接按路径拼（pnpm 布局下 require.resolve 的 paths 有时不认）
  for (const base of DEP_SEARCH_ROOTS) {
    const direct = path.join(base, 'node_modules', name);
    if (fs.existsSync(direct)) {
      try {
        return { mod: req(direct), from: direct };
      } catch (e) {
        errors.push(`${direct}: ${e.message.split('\n')[0]}`);
      }
    }
  }
  throw new Error(
    `无法解析依赖 ${name}（tools/ 不安装依赖，复用 dsh-desktop/node_modules）。尝试过：\n  ${errors.join('\n  ')}`
  );
}

let _semver = null;
let _yaml = null;
function semver() {
  if (!_semver) _semver = loadDep('semver').mod;
  return _semver;
}
function yaml() {
  if (!_yaml) _yaml = loadDep('yaml').mod;
  return _yaml;
}

/**
 * 解析 cordis 补丁层 YAML。
 * !!js 是内核自定义标量（dsh-app-boot 的 js-yaml 方言），yaml@2 只给告警不给报错，
 * 这里把日志级别压到 error，避免审计输出被 TAG_RESOLVE_FAILED 刷屏。
 */
function parsePatchYaml(text) {
  const YAML = yaml();
  return YAML.parse(text, { logLevel: 'error', prettyErrors: false });
}

function readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, 'utf8'));
}

function readKernelPackages() {
  return readJson(path.join(HERE, 'kernel-packages.json'));
}
function readKernelEntryIds() {
  return readJson(path.join(HERE, 'kernel-entry-ids.json'));
}
function readRuntime() {
  return readJson(path.join(HERE, 'dsh-runtime.json'));
}

// ---------------------------------------------------------------------------
// finding
// ---------------------------------------------------------------------------

const SEVERITIES = ['error', 'warn', 'info'];

function finding(check, severity, message, pkg = null, detail = null) {
  if (!SEVERITIES.includes(severity)) throw new Error(`未知 severity: ${severity}`);
  return { check, severity, message, pkg, detail };
}

/** 统一读 manifest 里的 dsh 声明块，缺失时给空对象，省掉满地的 && 链。 */
function dshBlock(manifest) {
  const d = manifest && manifest.dsh;
  return d && typeof d === 'object' ? d : {};
}
function bundlePatchDecl(manifest) {
  const b = dshBlock(manifest).bundle;
  return b && typeof b === 'object' ? b.patch : undefined;
}
function clientBlock(manifest) {
  const c = dshBlock(manifest).client;
  return c && typeof c === 'object' ? c : null;
}

/** exports['./client'] 可能是字符串，也可能是 { types, default } 条件对象。 */
function exportTarget(exportsField, key) {
  const v = exportsField && exportsField[key];
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    for (const k of ['default', 'import', 'require', 'browser', 'node']) {
      if (typeof v[k] === 'string') return v[k];
    }
    const first = Object.values(v).find((x) => typeof x === 'string');
    if (typeof first === 'string') return first;
  }
  return null;
}

function isPathInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function walkFiles(dir, opts = {}) {
  const skip = new Set(opts.skipDirs || ['node_modules', '.git', '.pnpm', '.dsh-cache']);
  const out = [];
  (function rec(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (skip.has(e.name) || e.name.startsWith('.')) continue;
        rec(full);
      } else if (e.isFile()) {
        out.push(full);
      }
    }
  })(dir);
  return out;
}

module.exports = {
  REPO_ROOT,
  HERE,
  detectPackRoot,
  listPackages,
  toRepoRelative,
  loadDep,
  semver,
  yaml,
  parsePatchYaml,
  readJson,
  readKernelPackages,
  readKernelEntryIds,
  readRuntime,
  finding,
  dshBlock,
  bundlePatchDecl,
  clientBlock,
  exportTarget,
  isPathInside,
  walkFiles,
};
