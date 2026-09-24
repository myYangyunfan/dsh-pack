'use strict';

// ---------------------------------------------------------------------------
// namespace —— 与官方客户端的「抢地盘」门。
//
// 全部规则都来自真机实测的失败模式，不是风格偏好：
//   · npm 包名撞上内核包 → `resolves from multiple active Loader sources`，启动直接废；
//   · cordis loader id 撞上内核 id → 补丁整行替换内核那一行（无字段合并）。实测
//     dsh-base/cordis.patch.yml 自带 `- id: plugin-manager`，我们的
//     assets/plugins/dsh-plugin-manager 用了同一个 id —— 装上去会静默顶掉内核的
//     插件管理器，连 `dsh plugin add` 都坏掉；
//   · @deepseek-ai/* 出现在 dependencies → 往 profile 里再装一份物理副本，
//     同上变成 multiple Loader sources。实测 desktop profile 自己的 node_modules
//     里 @deepseek-ai 包数量为 0，92 个内核包引用全靠安装域链接表
//     （collectInstallationScopePackages）供给；
//   · dsh.client.inject / external 写一个不存在的名字 → 静默失败，只产出
//     一个永不挂载的 client 半边；
//   · window.dshDesktop 被官方 preload 占用（exposeInMainWorld("dshDesktop")）。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');

const {
  detectPackRoot,
  finding,
  readKernelPackages,
  readKernelEntryIds,
  clientBlock,
  walkFiles,
  toRepoRelative,
} = require('./shared');
const { readBundlePatch } = require('./self-mount');
const { stripComments: stripJsComments } = require('./dep-closure');

const CHECK = 'namespace';

// 官方内核占用/保留的 scope：我们的包用它们起名，等于跟内核抢 npm 名字空间。
const FORBIDDEN_SCOPES = ['@deepseek-ai/', '@dsh-external/'];

// 已退役桌面壳的全局名。迁移后只有 host-capabilities 的探针模块可以再提它。
const DESKTOP_GLOBAL = 'dshDesktop';
const DESKTOP_PROBE_ALLOW = /(^|\/)host-capabilities\/src\//;
const TEST_DIR_ALLOW = /(^|\/)(?:test|tests|__tests__)\//;

// 退役壳的私有符号：迁移后没有任何东西会再提供它们，留着就是死路径。
const RETIRED_TOKENS = [
  '__DSH_DESKTOP_FILE_PATH__',
  '__dshDesktopOpenDir',
  '__dshSessionManager',
  'dsh-balance-changed',
];

// 「只在真值判断里探测 dshDesktop」的写法（window.dshDesktop ? ... / = ...）：
// 这类探测在新环境里永远为假，代码静默不执行，比抛异常更难查。
const TRUTHINESS_PROBE = /(?:window|globalThis)\.dshDesktop\s*[?=]/;

/**
 * 裸 cordis 服务 id 白名单。
 *
 * 为什么要白名单：dsh.client.inject / external 的条目绝大多数是 npm 包名
 * （@deepseek-ai/dsh-client-ui-slots 这种，能在 kernel-packages.json 里查到），
 * 但内核也接受「已经装配在图里的服务名」——dsh-easyrewrite 就写死注入
 * slots / sessions / workspaces。这些名字不是包名，永远查不到 kernel-packages.json，
 * 也不在 kernel-entry-ids.json 的 loader id 里（slots 是 slot 前缀而非 entry id）。
 * 因此这里显式列一小撮：新增必须是「确凿是内核服务名」，否则应改回包名。
 */
const CORDIS_SERVICE_IDS = new Set([
  'settings',
  'sessions',
  'session',
  'slots',
  'webServer',
  'webserver',
  'connection',
  'workspaces',
  'workspace',
  'credentials',
  'account',
  'llm',
  'tools',
  'skills',
  'storage',
  'terminal',
  'subagent',
  'intl',
]);

/** 去掉尾部 /client 子路径，还原成包名。 */
function stripClientSubpath(name) {
  return typeof name === 'string' ? name.replace(/\/client$/, '') : name;
}

/**
 * host-capabilities 的探针模块本身要探测这个全局名，测试里也要断言它 —— 这两处
 * 是唯一的豁免口（判定用「包名 + 文件在包内的相对位置」，不受包根在
 * packages/ 还是 assets/plugins/ 影响）。
 */
function isAllowedDesktopRef(relFromPackRoot) {
  return DESKTOP_PROBE_ALLOW.test(relFromPackRoot) || TEST_DIR_ALLOW.test(relFromPackRoot);
}

/** 需要扫源码文本的文件后缀（.map 是产物，且 publish-readiness 已禁止它进包）。 */
const SCANNABLE_EXT = /\.(?:js|cjs|mjs|jsx|ts|tsx|mts|cts|html|htm|css|json|yml|yaml)$/i;

function scanPackageText(pkg) {
  const hits = { desktop: [], retired: [], probe: [] };
  for (const abs of walkFiles(pkg.dir, { skipDirs: ['node_modules', '.git', '.pnpm'] })) {
    if (!SCANNABLE_EXT.test(abs)) continue;
    if (/\.(?:map|lock)$/i.test(abs)) continue;
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (!text || text.includes('\u0000')) continue; // 二进制/空文件不参与文本扫描
    const rel = path.relative(pkg.dir, abs).split(path.sep).join('/');
    // 只扫代码，不扫注释：注释里提到某个已退役全局不会在运行期调用任何东西。
    // 剥离是等长空白替换，行号保持不变。（dep-closure 有同一套判据，共用一个实现。）
    text = stripJsComments(text);
    if (text.includes(DESKTOP_GLOBAL)) {
      hits.desktop.push({
        rel,
        allowed: isAllowedDesktopRef(`${pkg.label}/${rel}`),
        lines: lineNumbersOf(text, DESKTOP_GLOBAL),
      });
    }
    for (const token of RETIRED_TOKENS) {
      if (text.includes(token)) hits.retired.push({ rel, token, lines: lineNumbersOf(text, token) });
    }
    TRUTHINESS_PROBE.lastIndex = 0;
    if (TRUTHINESS_PROBE.test(text)) {
      hits.probe.push({
        rel,
        allowed: isAllowedDesktopRef(`${pkg.label}/${rel}`),
        lines: lineNumbersOf(text, DESKTOP_GLOBAL),
      });
    }
  }
  return hits;
}

function lineNumbersOf(text, needle) {
  const lines = [];
  let idx = text.indexOf(needle);
  let guard = 0;
  while (idx !== -1 && guard++ < 40) {
    lines.push(text.slice(0, idx).split(/\r?\n/).length);
    idx = text.indexOf(needle, idx + needle.length);
  }
  return lines;
}

function run(ctx = {}) {
  const pack = ctx.pack || detectPackRoot();
  const findings = [];
  if (!pack.exists) {
    findings.push(finding(CHECK, 'error', '未找到插件包根，命名空间门无法执行'));
    return findings;
  }
  const kernelPkgFile = ctx.kernelPackages || readKernelPackages();
  const kernelIdFile = ctx.kernelEntryIds || readKernelEntryIds();
  const kernelNames = new Set(kernelPkgFile.packages || []);
  const kernelIds = new Set(kernelIdFile.ids || []);
  const packNames = new Set(
    pack.packages
      .map((p) => p.manifest && p.manifest.name)
      .filter(Boolean)
  );

  for (const pkg of pack.packages) {
    const label = pkg.label;
    if (!pkg.manifest) {
      findings.push(finding(CHECK, 'error', `package.json 解析失败：${pkg.error}`, label));
      continue;
    }
    const m = pkg.manifest;
    const name = m.name;

    // ---- 1. 包名本身不得占用内核 scope / 撞内核包名 ----
    for (const scope of FORBIDDEN_SCOPES) {
      if (typeof name === 'string' && name.startsWith(scope)) {
        findings.push(
          finding(
            CHECK,
            'error',
            `包名 ${name} 使用 ${scope} 前缀：与官方客户端争同一名字空间，` +
              `装进 profile 后可能被解析成内核自带的那一份（multiple active Loader sources）`,
            label
          )
        );
        break;
      }
    }
    if (typeof name === 'string' && kernelNames.has(name)) {
      findings.push(
        finding(
          CHECK,
          'error',
          `包名 ${name} 与官方内核包同名（kernel-packages.json，内核 ${kernelPkgFile.kernelVersion}）：` +
            `必然产生 resolves from multiple active Loader sources，启动即废`,
          label
        )
      );
    }
    if (typeof name !== 'string' || name.trim() === '') {
      findings.push(finding(CHECK, 'error', 'package.json 缺 name', label));
    }

    // ---- 2. cordis loader id 不得撞内核 id ----
    const patchInfo = readBundlePatch(pkg);
    for (const { id, file } of patchInfo.ids) {
      if (kernelIds.has(id)) {
        findings.push(
          finding(
            CHECK,
            'error',
            `loader id ${JSON.stringify(id)}（${file}）与内核自带条目同名（kernel-entry-ids.json）：` +
              `补丁按 id 寻址并整行替换，装上去会静默顶掉内核的那个条目。` +
              `实测 plugin-manager 就是这样撞掉过内核的插件管理器`,
            label
          )
        );
      }
    }
    for (const { id, file } of patchInfo.ids) {
      if (typeof name === 'string' && kernelNames.has(id)) {
        findings.push(finding(CHECK, 'warn', `loader id ${JSON.stringify(id)}（${file}）与某个内核包名同形，易混淆`, label));
      }
    }

    // ---- 3. @deepseek-ai/* 只能在 peerDependencies ----
    for (const field of ['dependencies', 'optionalDependencies']) {
      for (const dep of Object.keys(m[field] || {})) {
        if (dep.startsWith('@deepseek-ai/')) {
          findings.push(
            finding(
              CHECK,
              'error',
              `${field} 里有 ${dep}：@deepseek-ai/* 只能声明为 peerDependencies。` +
                `实测 desktop profile 自带 node_modules 里 @deepseek-ai 包为 0，92 个内核包引用全部由安装域链接表供给；` +
                `写进 ${field} 会再装一份物理副本 → multiple active Loader sources → 应用起不来`,
              label
            )
          );
        }
      }
    }

    // ---- 4. dsh.client 的 inject / external 必须可解析 ----
    const client = clientBlock(m) || {};
    for (const field of ['inject', 'external']) {
      const list = Array.isArray(client[field]) ? client[field] : [];
      for (const entry of list) {
        if (typeof entry !== 'string') {
          findings.push(finding(CHECK, 'error', `dsh.client.${field} 含非字符串条目 ${JSON.stringify(entry)}`, label));
          continue;
        }
        const bare = stripClientSubpath(entry);
        if (kernelNames.has(bare)) continue;
        if (packNames.has(bare)) {
          findings.push(
            finding(
              CHECK,
              'warn',
              `dsh.client.${field} 引用了同包集里的 ${bare}（不是内核包）：能否解析取决于安装顺序，` +
                `建议改成内核包名或经 host-capabilities 探针`,
              label
            )
          );
          continue;
        }
        if (!bare.includes('/') && CORDIS_SERVICE_IDS.has(bare)) continue; // 裸服务名
        findings.push(
          finding(
            CHECK,
            'error',
            `dsh.client.${field} 的 ${JSON.stringify(entry)} 不在官方内核包快照里` +
              `（kernel-packages.json，${kernelPkgFile.count} 个包）：悬挂引用失败得很安静——` +
              `只会产出一个永不挂载的 client 半边，症状是 Web 启动审计里一行 import 失败`,
            label
          )
        );
      }
    }

    // ---- 5. peer/optional 里 @deepseek-ai/* 悬挂引用（内核没有这个名字） ----
    for (const field of ['peerDependencies', 'optionalDependencies']) {
      for (const dep of Object.keys(m[field] || {})) {
        if (dep.startsWith('@deepseek-ai/') && !kernelNames.has(dep)) {
          findings.push(
            finding(
              CHECK,
              'warn',
              `${field} 里的 ${dep} 不在官方内核包快照里：客户端根本没这个包，` +
                `版本判定与真实装配都会对不上（实测 dsh-client-runtime / dsh-client-web-react 即此类）`,
              label
            )
          );
        }
      }
    }

    // ---- 6. platform 必须是 'web' ----
    if (client && Object.prototype.hasOwnProperty.call(client, 'platform')) {
      if (client.platform !== 'web') {
        findings.push(
          finding(
            CHECK,
            'error',
            `dsh.client.platform = ${JSON.stringify(client.platform)}，必须是 "web"：` +
              `官方桌面客户端跑的就是同一份 web client bundle，而 parseDshClient 不校验取值——` +
              `一个"顺手改成 desktop"的提交会静默让 client 半边不挂载`,
            label
          )
        );
      }
    }

    // ---- 7. 退役壳的全局名与私有符号 ----
    const hits = scanPackageText(pkg);
    for (const h of hits.desktop) {
      if (h.allowed) continue;
      findings.push(
        finding(
          CHECK,
          'error',
          `引用了 ${DESKTOP_GLOBAL}（${h.rel} 行 ${h.lines.slice(0, 6).join(',')}）：` +
            `官方 preload 已用 exposeInMainWorld("dshDesktop", ...) 占了这个名字，` +
            `只有 packages/host-capabilities/src/** 可以直连，其余一律走该探针模块`,
          label
        )
      );
    }
    for (const h of hits.probe) {
      if (h.allowed) continue;
      findings.push(
        finding(
          CHECK,
          'error',
          `存在只判真值的 ${DESKTOP_GLOBAL} 探测（${h.rel} 行 ${h.lines.slice(0, 6).join(',')}）：` +
            `迁移后该分支恒假，功能是静默消失的`,
          label
        )
      );
    }
    for (const h of hits.retired) {
      findings.push(
        finding(
          CHECK,
          'error',
          `残留退役桌面壳的私有符号 ${h.token}（${h.rel} 行 ${h.lines.slice(0, 6).join(',')}）：` +
            `官方客户端不提供它，这条路径永远不会执行`,
          label
        )
      );
    }
  }

  // 包集内部重名（两个目录同一个 manifest name 也是 multiple Loader sources）
  const byName = new Map();
  for (const pkg of pack.packages) {
    const n = pkg.manifest && pkg.manifest.name;
    if (!n) continue;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(pkg.label);
  }
  for (const [n, dirs] of byName) {
    if (dirs.length > 1) {
      findings.push(finding(CHECK, 'error', `包名 ${n} 在包集里重复：[${dirs.join(', ')}]`, dirs[0]));
    }
  }

  return findings;
}

module.exports = {
  CHECK,
  run,
  stripClientSubpath,
  isAllowedDesktopRef,
  FORBIDDEN_SCOPES,
  RETIRED_TOKENS,
  TRUTHINESS_PROBE,
  CORDIS_SERVICE_IDS,
  scanPackageText,
  repoRelative: toRepoRelative,
};

if (require.main === module) {
  const findings = run();
  for (const f of findings) console.log(`[${f.severity}] ${f.pkg || '-'}: ${f.message}`);
  console.log(`namespace: ${findings.length} 项发现`);
  process.exitCode = findings.some((f) => f.severity === 'error') ? 1 : 0;
}
