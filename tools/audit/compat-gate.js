'use strict';

// ---------------------------------------------------------------------------
// compat-gate —— 官方客户端的插件兼容性门。
//
// 逐字复刻 @deepseek-ai/dsh-app-boot/lib/index.js 的 evaluatePluginCompatibility：
// 内核在装配每个 bundle 前跑的就是这段判定，判定不过的 bundle 会被直接标
// incompatible 并跳过挂载（不报错、不弹窗，只是「插件没出现」）。我们删掉了
// scripts/compat/validate-pin.js + patch-surface.js 这整套内核补丁校验机器，
// 本文件是替代它的 fail-closed 静态门之一。
//
// 复刻要点（改动会让门与内核判定不一致，务必按上游为准）：
//   · 只看 peerDependencies 里 name === '@deepseek-ai/dsh' 或以 '@deepseek-ai/dsh-'
//     开头的条目——其它 scope（含 @deepseek-ai/cordis / schemastery / cosmokit）
//     内核根本不检查，我们也不报，报了就是噪声；
//   · workspace: 协议在装配期按运行时版本放行（workspace:^/~/ * 三档）；
//   · 全仓库共用一个 runtimeVersion，不是每个包各比各的；
//   · includePrerelease: true —— 内核是 rc 版本，不带这个选项会把所有 rc 判死。
// ---------------------------------------------------------------------------

const {
  detectPackRoot,
  semver,
  finding,
  readRuntime,
} = require('./shared');

const CHECK = 'compat-gate';
const WORKSPACE_PROTOCOLS = ['workspace:^', 'workspace:~', 'workspace:*'];

/**
 * evaluatePluginCompatibility 的逐字复刻。
 * @returns {{compatible:boolean, peers:Object, key:string}} peers 为不达标的那几项。
 */
function evaluatePluginCompatibility(manifest, runtimeVersion, semverLib = semver()) {
  const peers = {};
  const declared = (manifest && manifest.peerDependencies) || {};
  for (const [name, range] of Object.entries(declared)) {
    if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) continue;
    const requirement = WORKSPACE_PROTOCOLS.includes(range) ? runtimeVersion : range;
    if (
      String(requirement).trim() === '' ||
      !semverLib.satisfies(runtimeVersion, requirement, { includePrerelease: true })
    ) {
      peers[name] = range;
    }
  }
  const compatible = Object.keys(peers).length === 0;
  return { compatible, peers, key: `${manifest.name}@${manifest.version}` };
}

/**
 * workspace: 协议不得出现在发布出去的文件里。
 * 内核装配时把 workspace:^ 当「一定兼容」放行，但那前提是包躺在 pnpm workspace 里；
 * 发布到 npm 再装进 profile 时没有任何东西能把它解析成真实版本——装了就是谎。
 */
function workspaceProtocolHits(manifest) {
  const hits = [];
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const block = manifest[field];
    if (!block || typeof block !== 'object') continue;
    for (const [name, range] of Object.entries(block)) {
      if (typeof range === 'string' && range.trim().startsWith('workspace:')) {
        hits.push({ field, name, range });
      }
    }
  }
  return hits;
}

function run(ctx = {}) {
  const pack = ctx.pack || detectPackRoot();
  const findings = [];
  if (!pack.exists) {
    findings.push(finding(CHECK, 'error', `未找到插件包根（探测过 packages/ 与 dsh-desktop/assets/plugins/）`));
    return findings;
  }
  const runtime = ctx.runtime || readRuntime();
  const runtimeVersion = runtime.runtimeVersion;
  if (typeof runtimeVersion !== 'string' || runtimeVersion.trim() === '') {
    findings.push(finding(CHECK, 'error', 'dsh-runtime.json 缺 runtimeVersion，兼容性门无法判定'));
    return findings;
  }
  const sv = semver();
  if (!sv.valid(runtimeVersion)) {
    findings.push(finding(CHECK, 'error', `dsh-runtime.json 的 runtimeVersion 不是合法 semver: ${runtimeVersion}`));
    return findings;
  }

  for (const pkg of pack.packages) {
    const label = pkg.label;
    if (!pkg.manifest) {
      findings.push(finding(CHECK, 'error', `package.json 解析失败：${pkg.error}`, label));
      continue;
    }
    const verdict = evaluatePluginCompatibility(pkg.manifest, runtimeVersion, sv);
    if (!verdict.compatible) {
      const detail = Object.entries(verdict.peers)
        .map(([n, r]) => `${n}: ${JSON.stringify(r)}`)
        .join(', ');
      findings.push(
        finding(
          CHECK,
          'error',
          `内核兼容性门不过：runtime ${runtimeVersion} 不满足 peer（装配时该 bundle 被静默跳过）` +
            ` [${verdict.key}] ${detail}`,
          label
        )
      );
    }
    for (const hit of workspaceProtocolHits(pkg.manifest)) {
      findings.push(
        finding(
          CHECK,
          'error',
          `${hit.field}.${hit.name} 仍是 ${JSON.stringify(hit.range)}：workspace: 协议不得进入发布清单` +
            `（离开 pnpm workspace 后无法解析，且内核会把它当「无条件兼容」放行）`,
          label
        )
      );
    }
  }
  return findings;
}

module.exports = { CHECK, run, evaluatePluginCompatibility, workspaceProtocolHits, WORKSPACE_PROTOCOLS };

if (require.main === module) {
  const findings = run();
  for (const f of findings) console.log(`[${f.severity}] ${f.pkg || '-'}: ${f.message}`);
  console.log(`compat-gate: ${findings.length} 项发现`);
  process.exitCode = findings.some((f) => f.severity === 'error') ? 1 : 0;
}
