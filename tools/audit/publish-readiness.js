'use strict';

// ---------------------------------------------------------------------------
// publish-readiness —— 发布前的 P0 门。
//
// 最要命的一条是 dsh.client ⇄ exports['./client'] 的成对性：
//   dsh-client-modules 的 registry 构造函数遇到「声明了 dsh.client 但没有
//   "./client" 出口」会抛 ClientPackageCompositionError，而 modules 在 app-boot
//   的全局 REQUIRED 清单上 → StartupError → 整个应用起不来。
//   更糟的是致命启动失败后 sanitizeProfile 会把 profile 补丁层改名成
//   .bak-<时间戳> 并回滚到原始 bundle 清单——**整个插件包被抹掉**。
// 所以这条必须是 error，且排在最前。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');

const {
  detectPackRoot,
  finding,
  exportTarget,
  clientBlock,
  bundlePatchDecl,
  isPathInside,
} = require('./shared');
const { isMetaPackage } = require('./self-mount');

const CHECK = 'publish-readiness';

// 官方仓库地址：我们的包不该把 repository 指到内核上游（会误导 issue 去处，
// 也让 npm 页面显示成官方包）。
const FORBIDDEN_REPOSITORY = /(?:github\.com[:/])?deepseek-ai\/deepseek-harness(?:\.git)?/i;

/** exports 目标可能带条件对象，统一取到一个可落盘的路径字符串。 */
function resolveExportPath(pkgDir, target) {
  if (typeof target !== 'string') return null;
  const cleaned = target.replace(/^\.\//, '');
  const abs = path.resolve(pkgDir, cleaned);
  if (!isPathInside(pkgDir, abs)) return { abs, rel: cleaned, outside: true };
  return { abs, rel: cleaned, exists: fs.existsSync(abs) };
}

function mainCandidates(manifest) {
  const out = [];
  if (typeof manifest.main === 'string') out.push({ field: 'main', target: manifest.main });
  const rootExport = manifest.exports && manifest.exports['.'];
  const rootTarget = exportTarget(manifest.exports || {}, '.');
  if (typeof rootTarget === 'string') out.push({ field: 'exports["."]', target: rootTarget });
  else if (rootExport && typeof rootExport === 'object') out.push({ field: 'exports["."]', target: null });
  return out;
}

function run(ctx = {}) {
  const pack = ctx.pack || detectPackRoot();
  const findings = [];
  if (!pack.exists) {
    findings.push(finding(CHECK, 'error', '未找到插件包根，发布就绪度无法判定'));
    return findings;
  }

  for (const pkg of pack.packages) {
    const label = pkg.label;
    if (!pkg.manifest) {
      findings.push(finding(CHECK, 'error', `package.json 解析失败：${pkg.error}`, label));
      continue;
    }
    const m = pkg.manifest;
    const exportsField = m.exports && typeof m.exports === 'object' ? m.exports : null;

    // ---- P0：dsh.client ⇄ exports['./client'] 成对 ----
    const declaresClient = clientBlock(m) !== null;
    const clientTarget = exportsField ? exportTarget(exportsField, './client') : null;
    const clientResolved = exportsField ? resolveExportPath(pkg.dir, clientTarget) : null;
    if (declaresClient) {
      if (!clientTarget) {
        findings.push(
          finding(
            CHECK,
            'error',
            `声明了 dsh.client 却没有 exports["./client"]：dsh-client-modules 的 registry 构造函数会抛 ` +
              `ClientPackageCompositionError（modules 在 app-boot 全局 REQUIRED 清单上）→ StartupError 起不来，` +
              `随后 sanitizeProfile 把补丁层改名 .bak-<ts> 并回滚 bundle 清单，整包被抹掉`,
            label
          )
        );
      } else if (!clientResolved.exists) {
        findings.push(
          finding(
            CHECK,
            'error',
            `exports["./client"] 指向 ${clientTarget}，但该文件不存在（发布后必然解析失败）`,
            label
          )
        );
      } else if (clientResolved.outside) {
        findings.push(
          finding(CHECK, 'error', `exports["./client"] 指向包外路径 ${clientTarget}`, label)
        );
      }
    } else if (clientTarget) {
      findings.push(
        finding(
          CHECK,
          'error',
          `有 exports["./client"]（${clientTarget}）但未声明 dsh.client：client 半边永远不会被装配，` +
            `这是白发布的一份产物；要么补 dsh.client，要么删掉该出口`,
          label
        )
      );
    }

    // ---- 发布被拒 / 法务 ----
    if (m.private === true) {
      findings.push(finding(CHECK, 'error', 'private: true —— npm publish 直接拒绝，这个包发不出去', label));
    }
    if (typeof m.license !== 'string' || m.license.trim() === '') {
      findings.push(finding(CHECK, 'error', '缺 license 字段：发布到 npm 的包必须声明许可证', label));
    }

    // ---- files 允许清单 ----
    if (!Array.isArray(m.files) || m.files.length === 0) {
      findings.push(
        finding(
          CHECK,
          'error',
          '缺 files 允许清单：npm 会把 src/、test/、node_modules 残留，以及 sourcesContent 里内嵌了完整上游 TS 的 .map 一起打进去',
          label
        )
      );
    } else {
      const withNodeModules = m.files.filter((f) => typeof f === 'string' && /(^|\/)node_modules(\/|$)/.test(f));
      if (withNodeModules.length) {
        findings.push(
          finding(
            CHECK,
            'error',
            `files 里包含 node_modules（${withNodeModules.join(', ')}）：把整棵依赖树打进发布物，` +
              `与 profile 的安装域冲突，体积也失控`,
            label
          )
        );
      }
    }

    // ---- 入口可解析 ----
    const candidates = mainCandidates(m);
    const resolvedOnes = candidates
      .map((c) => ({ ...c, resolved: resolveExportPath(pkg.dir, c.target) }))
      .filter((c) => c.target && c.resolved && c.resolved.exists);
    if (candidates.length === 0) {
      findings.push(
        finding(CHECK, 'error', '既无 main 也无 exports["."]：cordis 装载 host 半边时找不到入口', label)
      );
    } else if (resolvedOnes.length === 0) {
      const tried = candidates.map((c) => `${c.field}=${JSON.stringify(c.target)}`).join(', ');
      findings.push(finding(CHECK, 'error', `入口声明存在但没有一个落到真实文件：${tried}`, label));
    }

    // ---- 自挂载声明（详细结构在 self-mount 里查，这里只查有没有） ----
    const patch = bundlePatchDecl(m);
    if (patch === undefined || patch === null) {
      const meta = isMetaPackage(pkg);
      findings.push(
        finding(
          CHECK,
          meta ? 'info' : 'error',
          meta
            ? '元包（能力库，不是 cordis bundle）：无 dsh.bundle.patch 属预期'
            : '缺 dsh.bundle.patch：官方插件管理器会判 not-bundle 并回滚安装（完整校验见 self-mount）',
          label
        )
      );
    } else {
      const list = Array.isArray(patch) ? patch : [patch];
      const missing = list.filter((p) => typeof p !== 'string' || !resolveExportPath(pkg.dir, p)?.exists);
      if (missing.length) {
        findings.push(
          finding(CHECK, 'error', `dsh.bundle.patch 指向不存在的文件：${missing.map((x) => JSON.stringify(x)).join(', ')}`, label)
        );
      }
    }

    // ---- repository ----
    const repoUrl = m.repository && (typeof m.repository === 'string' ? m.repository : m.repository.url);
    if (typeof repoUrl === 'string' && FORBIDDEN_REPOSITORY.test(repoUrl)) {
      findings.push(
        finding(
          CHECK,
          'error',
          `repository.url 指向官方内核仓库（${repoUrl}）：本包是插件包，不是内核分叉，` +
            `指错地方会让 issue/PR 流向 deepseek-ai 上游`,
          label
        )
      );
    }
  }
  return findings;
}

module.exports = { CHECK, run, resolveExportPath, mainCandidates, FORBIDDEN_REPOSITORY };

if (require.main === module) {
  const findings = run();
  for (const f of findings) console.log(`[${f.severity}] ${f.pkg || '-'}: ${f.message}`);
  console.log(`publish-readiness: ${findings.length} 项发现`);
  process.exitCode = findings.some((f) => f.severity === 'error') ? 1 : 0;
}
