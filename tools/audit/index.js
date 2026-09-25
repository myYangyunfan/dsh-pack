#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// tools/audit —— 插件包进官方客户端前的 fail-closed 静态门（迁移 Stage 1.3）。
//
// 替代被删掉的内核补丁校验机器（dsh-desktop/scripts/compat/validate-pin.js 与
// patch-surface.js）：那套东西验的是「我们改过内核」，迁移后不改内核了，
// 要验的是「我们的包在官方客户端里能不能活」。
//
// 用法：
//   node tools/audit/index.js                 全量，人读报告
//   node tools/audit/index.js --json          机器读（CI 消费）
//   node tools/audit/index.js --only=compat-gate,publish-readiness
// 退出码：有 error 即 1（warn / info 不拦门，但一定打印计数）。
// ---------------------------------------------------------------------------

const { detectPackRoot } = require('./shared');

const CHECKS = [
  { name: 'compat-gate', module: './compat-gate' },
  { name: 'namespace', module: './namespace' },
  { name: 'self-mount', module: './self-mount' },
  { name: 'dep-closure', module: './dep-closure' },
  { name: 'settings-api', module: './settings-api' },
  { name: 'publish-readiness', module: './publish-readiness' },
  { name: 'syntax', module: './syntax' },
];

const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 };
const SEVERITY_MARK = { error: '✗', warn: '△', info: '·' };

function parseArgs(argv) {
  const opts = { json: false, only: null };
  for (const arg of argv.slice(2)) {
    if (arg === '--json') opts.json = true;
    else if (arg.startsWith('--only=')) {
      opts.only = arg
        .slice('--only='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === '--help' || arg === '-h') opts.help = true;
    else throw new Error(`未知参数：${arg}（支持 --json / --only=<check[,check]>）`);
  }
  return opts;
}

function runAll(opts = {}) {
  const pack = detectPackRoot();
  const selected = opts.only
    ? CHECKS.filter((c) => opts.only.includes(c.name))
    : CHECKS;
  const unknown = opts.only
    ? opts.only.filter((n) => !CHECKS.some((c) => c.name === n))
    : [];
  const ctx = { pack };
  const results = [];
  const errors = [];
  for (const name of unknown) errors.push(`--only 指定了不存在的检查：${name}（可选：${CHECKS.map((c) => c.name).join(', ')}）`);
  for (const check of selected) {
    let mod;
    try {
      mod = require(check.module);
    } catch (e) {
      errors.push(`检查 ${check.name} 加载失败：${e.message}`);
      continue;
    }
    let findings;
    try {
      findings = mod.run(ctx);
    } catch (e) {
      errors.push(`检查 ${check.name} 执行抛错：${e.stack || e.message}`);
      continue;
    }
    results.push({ name: check.name, findings });
  }
  return { pack, results, errors, selected: selected.map((c) => c.name), unknown };
}

function groupByPkg(findings) {
  const map = new Map();
  for (const f of findings) {
    const key = f.pkg || '(仓库级)';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(f);
  }
  return [...map.entries()].sort((a, b) => {
    const sa = Math.min(...a[1].map((x) => SEVERITY_ORDER[x.severity]));
    const sb = Math.min(...b[1].map((x) => SEVERITY_ORDER[x.severity]));
    return sa - sb || a[0].localeCompare(b[0]);
  });
}

function printReport(out) {
  const { pack, results, errors } = out;
  const all = results.flatMap((r) => r.findings);
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of all) counts[f.severity]++;

  console.log('DSH 插件包静态审计（tools/audit）');
  if (!pack.exists) {
    console.log('包根: 未找到（探测过 packages/ 与 dsh-desktop/assets/plugins/，都没有含 package.json 的子目录）');
  } else {
    console.log(`包根: ${pack.label}  （${pack.stage}布局，主根 ${pack.roots[0].packageCount} 个包）`);
    if (pack.roots.length > 1) {
      console.log(`      ⚠ 包根分裂：${pack.roots.map((r) => `${r.label}=${r.packageCount}`).join(' + ')}，两个根都审`);
    }
  }
  console.log('');

  console.log('每项检查命中计数');
  for (const r of results) {
    const c = { error: 0, warn: 0, info: 0 };
    for (const f of r.findings) c[f.severity]++;
    const flag = c.error > 0 ? 'FAIL' : c.warn > 0 ? 'warn' : 'pass';
    console.log(
      `  ${flag.padEnd(5)} ${r.name.padEnd(20)} error=${String(c.error).padStart(3)} warn=${String(c.warn).padStart(3)} info=${String(c.info).padStart(3)} 合计=${r.findings.length}`
    );
  }
  console.log('');

  for (const r of results) {
    if (r.findings.length === 0) {
      console.log(`—— ${r.name}：0 项发现`);
      console.log('');
      continue;
    }
    console.log(`—— ${r.name}：${r.findings.length} 项发现（error=${r.findings.filter((f) => f.severity === 'error').length}）`);
    for (const [pkg, list] of groupByPkg(r.findings)) {
      console.log(`  ${pkg}`);
      for (const f of list.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])) {
        console.log(`    ${SEVERITY_MARK[f.severity]} [${f.severity}] ${f.message}`);
      }
    }
    console.log('');
  }

  if (errors.length) {
    console.log('—— 审计器自身错误（不计入发现，但必须修）');
    for (const e of errors) console.log(`  ✗ ${e}`);
    console.log('');
  }

  console.log(`总计 ${all.length} 项发现：error=${counts.error} warn=${counts.warn} info=${counts.info}`);
  if (errors.length) {
    console.log(`结论：审计器自身出错 ${errors.length} 处，结果不完整，先修工具`);
  } else {
    console.log(counts.error > 0 ? `结论：不通过（${counts.error} 个 error）` : '结论：通过（无 error）');
  }
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv);
  } catch (e) {
    console.error(String(e.message));
    process.exit(2);
  }
  if (opts.help) {
    console.log(
      [
        '用法: node tools/audit/index.js [--json] [--only=<check[,check]>]',
        `检查项: ${CHECKS.map((c) => c.name).join(', ')}`,
        '退出码: 0 = 无 error；1 = 有 error；2 = 参数/审计器自身出错',
      ].join('\n')
    );
    return;
  }
  const out = runAll(opts);
  if (opts.json) {
    const all = out.results.flatMap((r) => r.findings);
    const counts = { error: 0, warn: 0, info: 0 };
    for (const f of all) counts[f.severity]++;
    console.log(
      JSON.stringify(
        {
          packRoot: {
            label: out.pack.label,
            absolute: out.pack.root,
            exists: out.pack.exists,
            stage: out.pack.stage,
            split: out.pack.split,
            roots: out.pack.roots,
            packageCount: out.pack.packages.length,
          },
          checks: out.results.map((r) => ({
            name: r.name,
            counts: r.findings.reduce((acc, f) => ((acc[f.severity] = (acc[f.severity] || 0) + 1), acc), {}),
            findings: r.findings,
          })),
          totals: counts,
          total: all.length,
          toolErrors: out.errors,
        },
        null,
        2
      )
    );
  } else {
    printReport(out);
  }
  const hasError = out.results.some((r) => r.findings.some((f) => f.severity === 'error'));
  process.exitCode = hasError || out.errors.length ? 1 : 0;
}

if (require.main === module) main();

module.exports = { CHECKS, runAll, parseArgs, printReport, groupByPkg };
