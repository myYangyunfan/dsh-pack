'use strict';

// ---------------------------------------------------------------------------
// settings-api —— 拦「对不存在的服务名 / 服务方法名的调用」。
//
// 为什么单独立一条：本仓库此前的幽灵名检查（namespace.js）只比 **@deepseek-ai 包名**，
// 而真实踩到的两批事故都是**服务名/方法名**层面的：
//   · `ctx.settings.register(ns, schema)` —— SettingsForms 根本没有 register；
//   · `ctx.settingsScope.bind(...)`      —— 内核根本没有 settingsScope 这个服务；
//   · `apiProxy sessions.prompt(...)`    —— 同上，apiProxy 不存在。
// 三者共同点：失败形态要么静默降级（try/catch 吞掉、typeof 守卫恒假），
// 要么整条 not activate，而 `--dump-config` 那类只验组合的门禁一概看不见。
//
// 判据是**正向**的：服务名必须出现在内核快照里、settings 的方法必须真是
// SettingsForms 上的方法。不是维护一份"已知坏名字"黑名单 —— 黑名单拦不住下一个。
// 快照由 tools/audit/kernel-services.json 提供（extract-kernel-snapshots.mjs 生成）。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');

const { detectPackRoot, finding } = require('./shared');
const { stripComments } = require('./dep-closure');

const CHECK = 'settings-api';

const SNAPSHOT = path.join(__dirname, 'kernel-services.json');

function loadSnapshot() {
  if (!fs.existsSync(SNAPSHOT)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    if (!Array.isArray(j.services)) return null;
    return { services: new Set(j.services), settingsMethods: new Set(j.settingsMethods || []) };
  } catch {
    return null;
  }
}

/**
 * 变量名 → 服务名的常见别名。除了直白的 `ctx.get('x')` / `ctx.x`，
 * 还必须认**包了一层的取值助手**（如 dsh-balance 的 `readService(ctx, "settings")`）——
 * 第一版只认前两种，结果 balance 里 `settings.get()` 这条真阳性被漏掉，
 * 门禁显示 0 error：典型的假绿。
 */
function aliasMap(code) {
  const map = new Map();
  const patterns = [
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*ctx\.get\(\s*["'](\w+)["']/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*ctx\.([a-zA-Z][\w$]*)\s*[;,]/g,
    // 任意 `X = <helper>(ctx, "svc")` / `X = <helper>("svc")` 形态
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=[^;\n]*\(\s*(?:ctx\s*,\s*)?["'](\w+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of code.matchAll(re)) {
      if (!map.has(m[1])) map.set(m[1], m[2]);
    }
  }
  return map;
}

/** 统一的「settings 方法不存在」报语文案（两处判据共用一份，免得措辞漂移）。 */
function settingsMethodFinding(label, rel, what, snap) {
  return finding(
    CHECK,
    'error',
    `调用了 SettingsForms 上不存在的方法 ${what}()：内核真实方法是 ` +
      `[${[...snap.settingsMethods].join(', ')}]。改成声明式 —— 导出带 .volatile() 字段的 ` +
      `Config，读用 describe()、写用 update(条目id, patch, revision)`,
    `${label} ${rel}`
  );
}

function run(ctx = {}) {
  const pack = ctx.pack || detectPackRoot();
  const findings = [];
  if (!pack.exists) {
    findings.push(finding(CHECK, 'error', '未找到插件包根，服务名核对无法判定'));
    return findings;
  }
  const snap = ctx.snapshot === undefined ? loadSnapshot() : ctx.snapshot;
  if (snap === null) {
    findings.push(
      finding(
        CHECK,
        'error',
        '读不到 tools/audit/kernel-services.json：服务名核对无法判定（宁可报错也不静默放过）',
        '(仓库级)'
      )
    );
    return findings;
  }

  for (const pkg of pack.packages) {
    const label = pkg.label;
    const srcDir = path.join(pkg.dir, 'lib');
    const altDir = path.join(pkg.dir, 'src');
    const clientDir = path.join(pkg.dir, 'client');
    const dirs = [srcDir, altDir, clientDir].filter((d) => fs.existsSync(d));
    for (const dir of dirs) {
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.js')) continue;
        const file = path.join(dir, name);
        const code = stripComments(fs.readFileSync(file, 'utf8'));
        const rel = `${path.basename(dir)}/${name}`;
        const aliases = aliasMap(code);

        // 只在 cordis 插件模块里查服务访问：`ctx` 这个名字在浏览器代码里太常见了
        // （canvas 2D 的 ctx.beginPath、CodeMirror 的 ctx.tokens……），
        // 不加这个限定时一次报出 60+ 条误判。
        const isCordisModule = /\bexports\.apply\s*=|export function apply|export const apply|^function apply\(|\binject\s*=\s*\[/.test(code);

        // ④ 页内调 ctx.remote.settings.* 就必须在 inject 里声明 "remote.settings"。
        //    只声明 "remote" 不够：属性访问拿到的是一个**永不落定**的代理，
        //    既不返回也不抛错 ⇒ 调用方永远停在 pending，界面表现为「开关永久禁用」，
        //    控制台一行错误都没有。这条判据是本次实测换来的（官方 5 个用 remote.settings
        //    的包全都同时声明了 "remote" 与 "remote.settings"）。
        if (/\bctx\.remote\.settings\.[a-zA-Z]/.test(code)) {
          const declares = /["']remote\.settings["']/.test(code);
          if (!declares) {
            findings.push(
              finding(
                CHECK,
                'error',
                '调用了 ctx.remote.settings.* 但 inject 里没声明 "remote.settings"：' +
                  '只声明 "remote" 时该属性拿到的是永不 settle 的代理 —— 调用既不返回也不抛错，' +
                  '表现为界面控件永久禁用且控制台无报错。必须 inject 里两个名字都在',
                `${label} ${rel}`
              )
            );
          }
        }

        // ⑤ 幽灵服务名（页内也一样）：ctx.<svc>.<member>()
        const accessed = new Map();
        if (isCordisModule) {
          for (const m of code.matchAll(/\bctx\.([a-zA-Z][A-Za-z0-9_]*)\.([a-zA-Z][A-Za-z0-9_]*)\s*\(/g)) {
            accessed.set(m[1], m[2]);
          }
          for (const m of code.matchAll(/ctx\.get\(\s*["']([a-zA-Z][A-Za-z0-9_]*)["']\s*\)\s*\./g)) {
            if (!accessed.has(m[1])) accessed.set(m[1], '');
          }
        }
        const CTX_OWN = new Set(['get', 'inject', 'plugin', 'on', 'off', 'emit', 'effect', 'wait', 'fork', 'root', 'fiber', 'logger', 'loader']);
        for (const [svc, member] of accessed) {
          if (CTX_OWN.has(svc) || snap.services.has(svc)) continue;
          findings.push(
            finding(
              CHECK,
              'error',
              `访问了内核不存在的服务 ctx.${svc}${member ? `.${member}()` : ''}：内核服务清单里没有这个名字。` +
                `未声明的服务名属性访问会被注入守卫拦成 "cannot get property ${svc} without inject"，` +
                `就算声明了也恒 undefined ⇒ 调用点要么抛 TypeError 要么静默失效`,
              `${label} ${rel}`
            )
          );
        }

        // ② inject 名单里的服务名必须存在
        for (const m of code.matchAll(/\binject\s*=\s*\[([^\]]*)\]/g)) {
          for (const raw of m[1].split(',')) {
            const q = raw.trim().match(/^["']([a-zA-Z][A-Za-z0-9_]*)["']$/);
            if (!q) continue;
            if (snap.services.has(q[1])) continue;
            findings.push(
              finding(
                CHECK,
                'error',
                `inject 声明了内核不存在的服务 "${q[1]}"：多声明一个不存在的服务会让本条目永久 pending 被隔离`,
                `${label} ${rel}`
              )
            );
          }
        }

        // ③ settings 服务的方法必须真在 SettingsForms 上。
        //    只认两种被**证明**是该服务的引用：字面 `ctx.settings.x()`，
        //    以及 `const s = ctx.get('settings')` / `= ctx.settings` 这类别名。
        //    不能见 `settings.` 就查 —— vendored 的 mermaid/编辑器里也有叫 settings 的对象。
        const settingsVars = new Set();
        for (const [v, svc] of aliases) if (svc === 'settings') settingsVars.add(v);
        for (const v of settingsVars) {
          for (const m of code.matchAll(new RegExp(`\\b${v}\\.([a-zA-Z][A-Za-z0-9_]*)\\s*\\(`, 'g'))) {
            if (snap.settingsMethods.has(m[1])) continue;
            findings.push(settingsMethodFinding(label, rel, `${v}.${m[1]}`, snap));
          }
        }
        for (const m of (isCordisModule ? [...code.matchAll(/\bctx\.settings\.([a-zA-Z][A-Za-z0-9_]*)\s*\(/g)] : [])) {
          if (snap.settingsMethods.has(m[1])) continue;
          findings.push(settingsMethodFinding(label, rel, `ctx.settings.${m[1]}`, snap));
        }
      }
    }
  }
  return findings;
}

if (require.main === module) {
  for (const f of run()) console.log(`[${f.severity}] ${f.pkg || '-'}: ${f.message}`);
  process.exitCode = run().some((f) => f.severity === 'error') ? 1 : 0;
}

module.exports = { CHECK, run, loadSnapshot };
