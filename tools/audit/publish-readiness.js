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
//
// 第二条同级的成对性在文件下面：exports["./client"] 这份 bundle 里
// __ModuleLoader__.load({ id }) 的注册名必须等于包名。它坏起来的形态是
// 「宿主起来了、这个插件没反应」，用户只能从控制台看到，所以也按 P0 拦。
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

/**
 * 取出页内 bundle 的注册名：`window.__ModuleLoader__.load({ id: '…' , …`。
 * 只看 load 之后的第一个 id 字面量（允许跨行，窗口 400 字符），因为 factory
 * 体内还可能有别的 `id:` 字段。返回 undefined = 整个文件没有注册点。
 */
const CLIENT_LOAD_RE = /__ModuleLoader__\.load\s*\(\s*\{[\s\S]{0,400}?id\s*:\s*(['"])([^'"]+)\1/;

function clientRegistrationId(source) {
  const m = String(source).match(CLIENT_LOAD_RE);
  return m ? m[2] : undefined;
}

/**
 * 注册名是否对得上包名。内核 boot graph 行以**包名**为键，而 register() 的键是
 * stripClientSuffix(registration.id)，所以 '<name>/client' 这一种写法同样能命中。
 */
function registrationIdMatches(name, id) {
  return id === name || id === `${name}/client`;
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

    // ---- P0：注册名必须等于包名 ----
    // 真机踩过：官方客户端一次报 20 个 `client-modules: could not load "@dsh-pack/x":
    // plugins/??@dsh-pack/x/client.js&rev=…: loaded without registering "@dsh-pack/x"
    // via __ModuleLoader__.load`。内核 dsh-client-modules 的 boot graph 行以包名为键
    // （arrive(row) 载完 bundle 后查 factories.has(row.id)），而 register() 用
    // stripClientSuffix(registration.id) 做键，所以 bundle 里注册裸名（'dsh-input-fold'）
    // 或旧 scope 名（'@dsh-external/dsh-vision'）时那一行永远等不到。
    // 注意它的失败形态是**静默不挂载**而不是崩溃：宿主半边照常起来、界面没反应，
    // 所以必须在这里拦住，不能指望用户看得见。
    if (declaresClient && clientResolved && clientResolved.exists) {
      const regId = clientRegistrationId(fs.readFileSync(clientResolved.abs, 'utf8'));
      if (regId === undefined) {
        findings.push(
          finding(
            CHECK,
            'error',
            `exports["./client"]（${clientTarget}）里没有 window.__ModuleLoader__.load({ id, factory }) 注册：` +
              `页内 bundle 是 classic script，不注册就不会有任何模块挂到包名下，client 半边静默失效`,
            label
          )
        );
      } else if (!registrationIdMatches(m.name, regId)) {
        findings.push(
          finding(
            CHECK,
            'error',
            `client bundle 注册为 id: "${regId}"，但内核按包名 "${m.name}" 向 boot graph 要这一行 → ` +
              `报 "loaded without registering \\"${m.name}\\""，该插件的 client 半边静默不挂载。` +
              `改法：把注册名写成包名（或 "${m.name}/client"），别动 factory 体内的其它 id 字段`,
            label
          )
        );
      }
    }

    // ---- 发布被拒 / 法务 ----
    if (m.private === true) {
      findings.push(finding(CHECK, 'error', 'private: true —— npm publish 直接拒绝，这个包发不出去', label));
    }

    // ---- 发布期钩子 ----
    // npm publish **一定执行 prepare**（以及 prepack/prepublishOnly）。这些包带的是
    // 完整构建（tsdown / npm run build / pnpm run bundle），后果有两层：
    //   ① 没有构建工具链就直接发布失败（本地 registry 实测复现过 graph-memory、harness-pet）；
    //   ② 就算跑通，它用 src/ 重新生成 lib/，发出去的就不再是我们测过、且 loader 实际加载的那份产物。
    // 本仓库的约定是「预构建产物随包提交」，构建只在开发者机器上按需手动跑。
    const scripts = (m.scripts && typeof m.scripts === 'object') ? m.scripts : {};
    const hooks = ['prepare', 'prepack', 'postpack', 'prepublish', 'prepublishOnly'].filter((h) => scripts[h]);
    if (hooks.length) {
      findings.push(
        finding(
          CHECK,
          'error',
          `挂了发布期钩子 ${hooks.map((h) => `${h}="${scripts[h]}"`).join(', ')}：` +
            `npm publish 会执行它 —— 要么当场失败，要么用 src/ 重新生成 lib/，` +
            `发出未经测试的产物。请删掉钩子，构建保留为手动 script`,
          label
        )
      );
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

module.exports = {
  CHECK,
  run,
  resolveExportPath,
  mainCandidates,
  clientRegistrationId,
  registrationIdMatches,
  FORBIDDEN_REPOSITORY,
};

if (require.main === module) {
  const findings = run();
  for (const f of findings) console.log(`[${f.severity}] ${f.pkg || '-'}: ${f.message}`);
  console.log(`publish-readiness: ${findings.length} 项发现`);
  process.exitCode = findings.some((f) => f.severity === 'error') ? 1 : 0;
}
