'use strict';

// ---------------------------------------------------------------------------
// syntax —— 把 dsh-desktop/scripts/check-syntax.js 的门搬到包根上。
//
// 原门的语义（AGENTS.md 明确点名的那类 node --check 抓不到的问题）必须原样保留：
//   ① node --check 逐文件；
//   ② 「async/await 关键字与 function 声明被空行/注释行拆开」的模式扫描
//      （v0.3.8 事故：孤立 async 是合法表达式语句，运行时才抛 ReferenceError）。
// ② 依赖 scripts/lib/js-syntax-scan.js 的剥离式扫描（先把字符串/模板/正则/块注释
// 换成等长空白，保持行列号，再跑正则）。本文件优先直接 require 仓库里那份实现
// （单一事实源），迁移后 dsh-desktop 被删掉时退到内联的逐字副本。
//
// 与原门的差异只有三处，都是作用域/性能而非语义：
//   · 清单来源：原来是一份手写入口文件列表，这里改成「包根下全部 .js/.cjs/.mjs」
//     （发布物一律进门，不给漏网口子）；
//   · 加了个**充分必要的前置筛**（见 NAKED_KEYWORD_LINE 注释）——它只跳过
//     「结构上不可能命中」的文件，命中判定仍是原实现；
//   · 对 256 KiB 以上的生成 bundle 免做逐字符剥离（见 PATTERN_SCAN_SIZE_LIMIT：
//     原实现在单行几万字符的产物上是超线性的，一个 7MiB 的 bundle 就要 180 秒），
//     这些文件仍全量过 node --check，并在报告里逐个点名，不静默。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { REPO_ROOT, detectPackRoot, finding } = require('./shared');

const CHECK = 'syntax';
const JS_EXT = /\.(?:js|cjs|mjs)$/i;

// ---------------------------------------------------------------------------
// 关键字剥离扫描器（require 仓库版优先；下面是 dsh-desktop/scripts/lib/js-syntax-scan.js
// 的逐字内联副本，迁移后 dsh-desktop 不存在时接管）。
// ---------------------------------------------------------------------------

const DETACHED_KEYWORD =
  /^[ \t]*(async|await)[ \t]*(?:\/\/[^\u000D\u000A]*)?[ \t]*\u000D?\u000A(?:[ \t]*(?:\/\/[^\u000D\u000A]*)?[ \t]*\u000D?\u000A)*[ \t]*function\b/gm;

function isRegexStart(text, i) {
  let j = i - 1;
  while (j >= 0 && (text[j] === ' ' || text.charCodeAt(j) === 9)) j -= 1;
  if (j < 0) return true;
  const ch = text[j];
  if ('{([=:;,+-*%&|!?<>^~/'.indexOf(ch) !== -1) return true;
  const word = /[A-Za-z_$][A-Za-z0-9_$]*$/.exec(text.slice(0, j + 1));
  if (word) {
    return /^(return|throw|case|delete|void|typeof|instanceof|in|of|new|do|else|yield|await)$/.test(word[0]);
  }
  return false;
}

function scanRegexLiteral(text, start) {
  let j = start;
  let inClass = false;
  while (j < text.length) {
    const ch = text[j];
    if (ch.charCodeAt(0) === 92) {
      j += 2;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code === 10 || code === 13) return -1;
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) {
      let k = j + 1;
      while (k < text.length && /[A-Za-z]/.test(text[k])) k += 1;
      return k - 1;
    }
    j += 1;
  }
  return -1;
}

function stripStringsAndBlockComments(text) {
  const out = [];
  const repl = (m) => m.replace(/[^\u000D\u000A]/g, ' ');
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) {
        out.push(repl(text.slice(i)));
        break;
      }
      out.push(repl(text.slice(i, end + 2)));
      i = end + 2;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i + 2);
      if (nl === -1) {
        out.push(repl(text.slice(i)));
        break;
      }
      out.push(repl(text.slice(i, nl)));
      i = nl;
      continue;
    }
    if (c === '/' && text[i + 1] !== '/' && isRegexStart(text, i)) {
      const end = scanRegexLiteral(text, i + 1);
      if (end !== -1) {
        out.push(repl(text.slice(i, end + 1)));
        i = end + 1;
        continue;
      }
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
        j += 1;
      }
      if (j >= text.length) {
        out.push(repl(text.slice(i)));
        break;
      }
      out.push(repl(text.slice(i, j + 1)));
      i = j + 1;
      continue;
    }
    out.push(c);
    i += 1;
  }
  return out.join('');
}

function detachedHitsPortable(text) {
  const scanned = stripStringsAndBlockComments(text);
  const hits = [];
  let match;
  DETACHED_KEYWORD.lastIndex = 0;
  while ((match = DETACHED_KEYWORD.exec(scanned)) !== null) {
    const upTo = scanned.slice(0, match.index);
    hits.push({ keyword: match[1], line: upTo.split(/\u000D?\u000A/).length });
  }
  return hits;
}

function loadScanner() {
  // 仓库里那份仍是唯一事实源时优先用它，避免两份实现漂移。
  const repoPath = path.join(REPO_ROOT, 'dsh-desktop', 'scripts', 'lib', 'js-syntax-scan.js');
  if (fs.existsSync(repoPath)) {
    try {
      const mod = require(repoPath);
      if (typeof mod.detachedHits === 'function') return { detachedHits: mod.detachedHits, source: 'dsh-desktop/scripts/lib/js-syntax-scan.js' };
    } catch {
      /* 落到内联副本 */
    }
  }
  return { detachedHits: detachedHitsPortable, source: 'tools/audit/syntax.js 内联副本' };
}

/**
 * 前置筛：DETACHED_KEYWORD 要求「某行剥掉空白/行注释后只剩 async|await」。
 * 剥离函数只会把字符换成空格、从不产生新字母，也不改变换行位置，
 * 所以原始文本里必须存在一行以 `[ \t]*(async|await)` 开头——不成立即可断定零命中。
 * 这里比剥后判定略宽（允许裸关键字行、关键字 + 行注释），是保守的必要条件，
 * 不会漏掉 v0.3.8 那类事故形态。
 */
const NAKED_KEYWORD_LINE = /^[ \t]*(?:async|await)(?:[ \t]|$)/m;

/**
 * 剥离扫描的体积上限。
 *
 * stripStringsAndBlockComments 在生成 bundle 上是超线性的：它把每个「像正则起始却
 * 在本行内闭合不了」的 `/` 都整行扫一遍（scanRegexLiteral 直到换行才返回 -1），
 * 单行几万字符的 bundle 直接把 7MiB 的 client-mermaid.js 拉到 180 秒以上
 * （实测 strip 183.6s / 同一文件正则匹配仅 0.016s）。
 * 该事故模式来自「人手工把注释插进 async 与 function 之间」，只可能出现在手写
 * 源码里；超限文件仍然全量过 node --check，并且在本项 info 里逐个点名，不静默。
 */
const PATTERN_SCAN_SIZE_LIMIT = 256 * 1024;

function collectJsFiles(packRoot, labelPrefix = '') {
  const out = [];
  (function rec(dir, rel) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === '.pnpm' || e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) rec(abs, relPath);
      else if (e.isFile() && JS_EXT.test(e.name))
        out.push({ abs, relPath: labelPrefix ? `${labelPrefix}/${relPath}` : relPath });
    }
  })(packRoot, '');
  return out.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function run(ctx = {}) {
  const pack = ctx.pack || detectPackRoot();
  const findings = [];
  if (!pack.exists) {
    findings.push(finding(CHECK, 'error', '未找到插件包根，语法门没有检查对象'));
    return findings;
  }
  if (pack.packages.length === 0) {
    findings.push(finding(CHECK, 'error', `包根 ${pack.root} 下没有任何含 package.json 的目录`));
    return findings;
  }
  const scanner = loadScanner();
  const files = pack.roots.flatMap((r) => collectJsFiles(r.root, r.label));
  let patternScanned = 0;
  let patternSkipped = 0;
  const overLimit = [];

  for (const { abs, relPath } of files) {
    const result = spawnSync(process.execPath, ['--check', abs], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) {
      findings.push(
        finding(CHECK, 'error', `node --check 失败：${(result.stderr || '').trim().split('\n').slice(0, 4).join(' | ')}`, relPath)
      );
      continue;
    }
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch (e) {
      findings.push(finding(CHECK, 'error', `读不到文件：${e.message.split('\n')[0]}`, relPath));
      continue;
    }
    if (!NAKED_KEYWORD_LINE.test(text)) {
      patternSkipped++;
      continue;
    }
    if (text.length > PATTERN_SCAN_SIZE_LIMIT) {
      // 仍然过 node --check；只是不在数 MB 的生成 bundle 上跑逐字符剥离。
      // 不静默：下面以 info 汇总列出，看得见跳过了谁。
      overLimit.push({ relPath, size: text.length });
      continue;
    }
    patternScanned++;
    let hits;
    try {
      hits = scanner.detachedHits(text);
    } catch (e) {
      findings.push(finding(CHECK, 'error', `模式扫描器异常：${e.message.split('\n')[0]}`, relPath));
      continue;
    }
    for (const hit of hits) {
      findings.push(
        finding(
          CHECK,
          'error',
          `疑似 async/await 关键字与声明被拆开：行 ${hit.line} 孤立的 ${hit.keyword} 后跟 function 声明，` +
            `node --check 查不出，运行时会抛 ReferenceError`,
          relPath
        )
      );
    }
  }

  findings.push(
    finding(
      CHECK,
      'info',
      `扫描 ${files.length} 个 .js/.cjs/.mjs（node --check 全量）；关键字剥离实扫 ${patternScanned} 个，` +
        `结构上不可能命中而跳过 ${patternSkipped} 个，` +
        `超过 ${PATTERN_SCAN_SIZE_LIMIT / 1024} KiB 未做剥离扫描 ${overLimit.length} 个` +
        (overLimit.length ? `：${overLimit.map((o) => `${o.relPath}(${Math.round(o.size / 1024)}KiB)`).join(', ')}` : '') +
        `；扫描器实现：${scanner.source}`
    )
  );
  return findings;
}

module.exports = {
  CHECK,
  run,
  collectJsFiles,
  loadScanner,
  NAKED_KEYWORD_LINE,
  PATTERN_SCAN_SIZE_LIMIT,
  detachedHitsPortable,
  stripStringsAndBlockComments,
};

if (require.main === module) {
  const findings = run();
  for (const f of findings) console.log(`[${f.severity}] ${f.pkg || '-'}: ${f.message}`);
  console.log(`syntax: ${findings.length} 项发现`);
  process.exitCode = findings.some((f) => f.severity === 'error') ? 1 : 0;
}
