'use strict';

// ---------------------------------------------------------------------------
// dep-closure —— 发布物的裸依赖闭包门。
//
// 要防的事：包在开发机上能跑，是因为 node_modules 里恰好躺着东西；装进官方
// profile 后只有「manifest 声明过的 + 内核安装域提供的」两类模块可解析。
// 少声明一个裸依赖 = 运行时 ERR_MODULE_NOT_FOUND（而且往往只在某条用户路径上炸）。
//
// 判定口径（按迁移方案钉死的四条）：裸标识符必须是
//   ① Node 内建，或
//   ② dependencies / optionalDependencies 里声明过，或
//   ③ peerDependencies 里声明过 **且** 在 kernel-packages.json 里（内核供给），或
//   ④ 相对路径。
// 其余一律 error。反过来「声明了却没用到」只降级为 warn——bundle 内联会把
// import 语句吃掉，声明本身仍可能是对的。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const { builtinModules, isBuiltin: nodeIsBuiltin } = require('node:module');

const {
  detectPackRoot,
  finding,
  readKernelPackages,
} = require('./shared');

const CHECK = 'dep-closure';

const BUILTINS = new Set(builtinModules);
// .d.ts 排除：纯类型声明不进运行时，拿它报「裸依赖未声明」是假阳性
const SOURCE_EXT = /\.(?:js|cjs|mjs|jsx|ts|tsx|mts|cts)$/i;

/** npm files 允许清单的等价实现（够用子集：目录前缀、basename、** 与 ! 取反）。 */
function filesMatcher(manifest) {
  const list = Array.isArray(manifest.files) ? manifest.files.filter((x) => typeof x === 'string') : [];
  const always = new Set(['package.json']);
  const alwaysBasename = /^(?:readme|license|licence|copying|notice)(?:\.|$)/i;
  const positive = [];
  const negative = [];
  for (let raw of list) {
    let pattern = String(raw).trim();
    if (!pattern) continue;
    let negate = false;
    if (pattern.startsWith('!')) {
      negate = true;
      pattern = pattern.slice(1);
    }
    pattern = pattern.replace(/^\.\//, '').replace(/\/$/, '');
    if (!pattern) continue;
    const re = globToRegExp(pattern);
    (negate ? negative : positive).push({ pattern, re });
  }
  return {
    hasAllowlist: positive.length > 0,
    includes(relPath) {
      const rel = relPath.split(path.sep).join('/');
      const base = rel.slice(rel.lastIndexOf('/') + 1);
      if (always.has(base) || alwaysBasename.test(base)) return true;
      let allowed = positive.length === 0; // 没有 files 允许清单 → npm 打包一切
      for (const { re } of positive) {
        if (re.test(rel)) {
          allowed = true;
          break;
        }
      }
      for (const { re } of negative) if (re.test(rel)) return false;
      return allowed;
    },
  };
}

function globToRegExp(pattern) {
  const anchored = pattern.includes('/') || pattern.includes('**');
  let re = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          re += '(?:[^/]*/)*';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
      continue;
    }
    if (ch === '?') {
      re += '[^/]';
      continue;
    }
    re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  // 目录式写法（lib、dist）匹配其下所有内容，因此收尾允许再接 /
  const body = `${re}(?:$|/.*)`;
  return new RegExp(anchored ? `^${body}` : `(?:^|/)${body}`);
}

/** 从源码文本里抽裸标识符（import / require / createRequire().resolve 三类入口）。 */
const SPEC_PATTERNS = [
  /\bfrom\s+['"]([^'"\n]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\bimport\s+['"]([^'"\n]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\.resolve\s*\(\s*['"]([^'"\n]+)['"]/g,
];

function specifiersIn(text) {
  const found = new Set();
  const code = blankTemplateBodies(stripComments(text));
  for (const re of SPEC_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code)) !== null) {
      const spec = m[1];
      // 模板字符串里的插值不是模块说明符。打包进来的 mermaid 等大件里有
      // `import(`${expr}`)` 这种形态，早期版本把 `${source.modelEntityType}`
      // 当成裸依赖并报 ERR_MODULE_NOT_FOUND（纯误报）。
      if (spec.includes('${')) continue;
      // 尖括号占位符（文档/示例里的 `<pkg>/package.json`）同理，永远不是真说明符。
      if (spec.includes('<') || spec.includes('>')) continue;
      // `node_modules/...` 开头的是**文件路径**，不是裸说明符：
      // dsh-super-injector 用 fs.symlinkSync(path.resolve('node_modules/@standard-schema/spec'))
      // 给被注入的包搭链接目录，那走的是文件系统，不是模块解析。
      if (spec === 'node_modules' || spec.startsWith('node_modules/')) continue;
      found.add(spec);
    }
  }
  return found;
}

/**
 * 页内 bundle 与宿主源文件的解析规则**根本不同**，不能一套规则混着报：
 *   · 宿主半边（lib/index.js、dist/index.js…）跑在 Node 里，按 node_modules 解析 ⇒
 *     裸依赖必须落在 dependencies / optionalDependencies，
 *     或落在 peerDependencies 且在官方内核快照里（内核的安装作用域链接表供给）。
 *   · client bundle（lib/client*.js）跑在官方浏览器模块系统里，只对 PLATFORM_MODULES
 *     种子表 + 自己声明的 dsh.client.external/inject + boot-graph 行解析，
 *     **其余一律 throw**；它压根不走 node 解析。
 *     所以对 client bundle 报「请加依赖否则 ERR_MODULE_NOT_FOUND」是错的，
 *     正确的要求是「该由 dsh.client.external 声明」。
 * 两类混判会产出一片看着严重实则无关的噪声，反而把真问题（宿主半边漏声明）淹掉。
 */
function isClientBundleFile(relPath) {
  const base = (relPath.split(/[\\/]/).pop() || relPath).replace(/\.(mjs|cjs|js)$/, '');
  return /^client([^.]*)?$/.test(base) || /(^|[\\/])client[\\/]/.test(relPath);
}

/**
 * 构建输入：cordis 加载器只吃 .js/.cjs/.mjs，TS 源永远不会在运行期被解析。
 * 把 src/**.ts 也当成「运行期要解析的模块」会产出一大片假错误——
 * 例如 dsh-better-sidebar 的 src/client/lang.ts 里 import 的 24 个
 * @codemirror/* 早已在构建期内联进 lib/client*.js，运行期根本不需要解析它们。
 * 本检查的前提是「宿主运行期到底要解析什么」，所以只看真正可加载的产物。
 */
const BUILD_INPUT_EXT = /\.(ts|tsx|mts|cts|jsx|vue|svelte|map|json|md|css|scss|less|svg|png|jpg|jpeg|gif|webp|woff2?|ttf|eot)$/i;

/**
 * 官方浏览器模块系统的种子表（React 家族 + Cordis 家族）。
 * 只用来**免误报**：不在表内又没声明 external 的照样报错，所以宁可保守少列。
 */
const BROWSER_SEED_MODULES = new Set([
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  '@deepseek-ai/cordis',
  '@deepseek-ai/cosmokit',
  '@deepseek-ai/schemastery',
]);


/**
 * 抽标识符前先剔注释（等长空白替换，保住行号）。JSDoc 里的示例 import
 * （dsh-super-injector 写了 `import type { UserConfig } from 'tsdown'`）会被
 * 当成真实依赖，报出根本不存在的引用；字符串与模板原样保留，它们是标识符载体。
 */
function stripComments(text) {
  const out = [];
  const blank = (s) => s.replace(/[^\r\n]/g, ' ');
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out.push(blank(text.slice(i, stop)));
      i = stop;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      let nl = text.indexOf('\n', i + 2);
      if (nl === -1) nl = text.length;
      out.push(blank(text.slice(i, nl)));
      i = nl;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        if (text[j] === quote) break;
        // 模板字面量里的 ${} 允许换行；普通字符串里的裸换行视为未闭合，直接放行，
        // 避免把整段后续代码误吞（漏报比误报危险）。
        if (text[j] === '\n' && quote !== '`') break;
        j += 1;
      }
      if (j >= text.length) {
        out.push(text.slice(i));
        break;
      }
      out.push(text.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    out.push(c);
    i += 1;
  }
  return out.join('');
}

/** `@scope/pkg/sub` → `@scope/pkg`；`pkg/sub` → `pkg`。 */
function bareNameOf(spec) {
  if (spec.startsWith('@')) {
    const parts = spec.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : spec;
  }
  return spec.split('/')[0];
}

function isRelative(spec) {
  return spec.startsWith('.') || spec.startsWith('/') || /^[A-Za-z]:[\\/]/.test(spec);
}

function isBuiltin(spec) {
  // 优先问 Node 自己：builtinModules 不含 node:test / node:sqlite 这类「仅带前缀可解析」
  // 的模块，而且它反映的是当前进程的版本，不是目标运行时。
  try {
    if (nodeIsBuiltin(spec)) return true;
  } catch {
    /* 老版本 Node 没有 isBuiltin */
  }
  if (spec.startsWith('node:')) return BUILTINS.has(spec.slice(5));
  return BUILTINS.has(bareNameOf(spec));
}

function publishedSourceFiles(pkg, matcher) {
  const out = [];
  (function rec(dir, rel) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) rec(abs, relPath);
      else if (e.isFile() && SOURCE_EXT.test(e.name) && !/\.d\.[cm]?ts$/.test(e.name) && matcher.includes(relPath))
        out.push({ abs, relPath });
    }
  })(pkg.dir, '');
  // main / exports 的目标一定在发布物里，补进来（有些包靠默认规则收录）
  return out;
}

/**
 * 把模板字符串**体内**擦成空白（等长，保行号）。
 *
 * 为什么需要：有的插件把「要生成给用户的插件源码」整段写成模板字面量
 * （dsh-super-injector 的 scaffoldDaemonSrc 会吐出
 * `import ... from '@deepseek-ai/dsh-llm'`、还会生成 tsdown 配置）。
 * 那些说明符是**被生成物的依赖**，不是本包运行期要解析的东西。
 * stripComments 刻意保留字符串与模板是对的（真说明符确实写在引号里），
 * 所以这里单独处理模板体这一类。
 *
 * 只擦反引号内部；单/双引号原样保留 —— 那样 `require('x')` / `import('x')`
 * 这类真实调用点仍然会被扫到，不会因为这次改动而漏判。
 * 模板内 `${…}` 一并擦掉：插值里即使有字符串也是运行期拼出来的值，
 * 静态扫描本来就解析不出它最终指向哪个包。
 */
function blankTemplateBodies(text) {
  const out = [];
  const blank = (s) => s.replace(/[^\r\n]/g, ' ');
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'") {
      // 普通字符串原样带走（内含模板时也不动，避免误伤真说明符）
      const quote = c;
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        if (text[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      out.push(text.slice(i, j));
      i = j;
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      let depth = 0; // 记录 ${ } 嵌套，避免把模板里的花括号当结束
      while (j < text.length) {
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        if (depth === 0 && text[j] === '`') {
          j += 1;
          break;
        }
        if (text[j] === '$' && text[j + 1] === '{') {
          depth += 1;
          j += 2;
          continue;
        }
        if (depth > 0 && text[j] === '}') depth -= 1;
        j += 1;
      }
      out.push(blank(text.slice(i, j)));
      i = j;
      continue;
    }
    out.push(c);
    i += 1;
  }
  return out.join('');
}

function run(ctx = {}) {
  const pack = ctx.pack || detectPackRoot();
  const findings = [];
  if (!pack.exists) {
    findings.push(finding(CHECK, 'error', '未找到插件包根，依赖闭包无法计算'));
    return findings;
  }
  const kernel = ctx.kernelPackages || readKernelPackages();
  const kernelNames = new Set(kernel.packages || []);

  for (const pkg of pack.packages) {
    const label = pkg.label;
    if (!pkg.manifest) continue;
    const m = pkg.manifest;
    const deps = m.dependencies || {};
    const optDeps = m.optionalDependencies || {};
    const peers = m.peerDependencies || {};
    const matcher = filesMatcher(m);
    const files = publishedSourceFiles(pkg, matcher);

    // spec -> 出现的文件列表（去重，避免一个漏报刷出上百行）
    const occurrences = new Map();
    const usedBare = new Set();
    for (const { abs, relPath } of files) {
      let text;
      try {
        text = fs.readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      if (!text || text.includes('\u0000')) continue;
      if (BUILD_INPUT_EXT.test(relPath)) continue;
      for (const spec of specifiersIn(text)) {
        if (isRelative(spec)) continue;
        if (isBuiltin(spec)) continue;
        const bare = bareNameOf(spec);
        if (bare === m.name) continue; // 自引用（exports 子路径）
        if (isInternalModule(spec)) continue;
        if (!occurrences.has(spec)) occurrences.set(spec, []);
        const list = occurrences.get(spec);
        if (list.length < 8) list.push(relPath);
        usedBare.add(bare);
      }
    }

    const problems = [];
    // 本包声明的浏览器侧外部模块（bare 名与带子路径两种写法都收进来比对）
    const clientDecl = (m.dsh && m.dsh.client) || {};
    const clientAllowed = new Set(
      [...(clientDecl.external || []), ...(clientDecl.inject || [])].map((s) => String(s))
    );
    for (const [spec, whereList] of [...occurrences].sort()) {
      const bare = bareNameOf(spec);
      // 只出现在 client bundle 里的裸标识符走的是浏览器模块系统，不是 node 解析 ⇒
      // 不能用「加 dependencies」那套判。它需要的是：在种子里，或本包已声明 external/inject。
      const hostReachable = whereList.some((p) => !isClientBundleFile(p));
      if (!hostReachable) {
        if (BROWSER_SEED_MODULES.has(bare) || BROWSER_SEED_MODULES.has(spec)) continue;
        if (clientAllowed.has(spec) || clientAllowed.has(bare)) continue;
        const stem = spec.replace(/\/.*$/, '');
        if (clientAllowed.has(stem) || clientAllowed.has(`${stem}/client`)) continue;
        problems.push({
          kind: 'client-not-declared',
          spec,
          message:
            `client bundle 里的裸依赖 ${spec} 既不在浏览器模块系统的种子表里，也没有声明进 ` +
            `dsh.client.external / inject：官方模块系统对未知裸标识符一律 throw，` +
            `表现为该插件页内半边静默消失（不是 node 的 ERR_MODULE_NOT_FOUND）。`,
        });
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(deps, bare) || Object.prototype.hasOwnProperty.call(optDeps, bare)) continue;
      if (Object.prototype.hasOwnProperty.call(peers, bare)) {
        if (kernelNames.has(bare)) continue;
        problems.push({
          kind: 'peer-not-kernel',
          spec,
          message:
            `裸依赖 ${spec} 只声明在 peerDependencies，且不在官方内核包快照里：` +
            `内核不会提供它，profile 也没装它 → 运行时 ERR_MODULE_NOT_FOUND。`,
        });
        continue;
      }
      problems.push({
        kind: 'undeclared',
        spec,
        message:
          `裸依赖 ${spec} 未在任何依赖字段声明（只在开发机的 node_modules 里存在）。` +
          `装进官方 profile 后无法解析 → 运行时 ERR_MODULE_NOT_FOUND。`,
      });
    }
    for (const p of problems) {
      findings.push(
        finding(
          CHECK,
          'error',
          `${p.message} 出现于 ${occurrences.get(p.spec).slice(0, 4).join(', ')}` +
            `${occurrences.get(p.spec).length >= 4 ? ' 等' : ''}（扫描 ${files.length} 个发布源文件）`,
          label,
          { spec: p.spec, kind: p.kind, files: occurrences.get(p.spec) }
        )
      );
    }

    // 声明了却没在发布物里出现 → warn（bundle 内联会让 import 语句消失，不能当 error）
    const unused = [...Object.keys(deps), ...Object.keys(optDeps)].filter(
      (d) => !usedBare.has(d) && !usedBare.has(`node:${d}`)
    );
    if (unused.length) {
      findings.push(
        finding(
          CHECK,
          'warn',
          `声明了但发布物里找不到引用的依赖（${unused.length} 个）：${unused.join(', ')}。` +
            `可能是打包器把它们内联了，也可能是清理不彻底的残留——逐个确认后删掉或注明`,
          label,
          { unused }
        )
      );
    }
  }
  return findings;
}

/** 指向包内绝对/别名子路径的写法（@/xxx、~/xxx 之类打包器别名），不当作 npm 包。 */
function isInternalModule(spec) {
  return /^(?:@\/|~\/|#)/.test(spec) || spec.startsWith('#');
}

module.exports = {
  stripComments,
  CHECK,
  run,
  filesMatcher,
  globToRegExp,
  specifiersIn,
  stripComments,
  bareNameOf,
  isBuiltin,
  isRelative,
  publishedSourceFiles,
};

if (require.main === module) {
  const findings = run();
  for (const f of findings) console.log(`[${f.severity}] ${f.pkg || '-'}: ${f.message}`);
  console.log(`dep-closure: ${findings.length} 项发现`);
  process.exitCode = findings.some((f) => f.severity === 'error') ? 1 : 0;
}
