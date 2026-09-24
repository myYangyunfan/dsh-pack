'use strict';

// ---------------------------------------------------------------------------
// JS 源码扫描器（全仓唯一实现，单一数据源）。
//
// 从 scripts/check-syntax.js 抽出（issue #98 修复时顺带提为可测模块）：
// 打包前在源码文本上扫描「async/await 关键字与 function 声明被空行/注释
// 行拆开」的致命模式（v0.3.8 事故：node --check 查不出孤立 async 表达式
// 语句，运行时才抛 ReferenceError）。扫描前先剔除字符串字面量（单/双引
// 号）、模板字面量与块注释，并用等长空白替换保持行号/列号不变，使报错
// 定位仍准确。
//
//   · issue #75：字符串里的 "async 换行 function" 合法文本被误判为孤立
//     关键字 → 引入 stripStringsAndBlockComments；
//   · issue #98：/["' ]/g 这类含引号的正则字面量被字符串检查误当作字面量
//     起始，吞掉其后大片真实代码 → 引入 isRegexStart + scanRegexLiteral，
//     且正则检查必须先于字符串检查执行。
// ---------------------------------------------------------------------------

// 匹配「async/await 关键字与紧随其后的 function 声明之间被空行/注释行拆开」：
//   async // 注释…
//   // 更多注释…
//   function probeOverlayAgent() {}
// 孤立 async/await 表达式在运行时会抛 ReferenceError，必须在打包前拦截。
// （换行用 \u000D/\u000A 表示 CR/LF，语义等价 \r\n，避免落下真实换行。）
const DETACHED_KEYWORD = /^[ \t]*(async|await)[ \t]*(?:\/\/[^\u000D\u000A]*)?[ \t]*\u000D?\u000A(?:[ \t]*(?:\/\/[^\u000D\u000A]*)?[ \t]*\u000D?\u000A)*[ \t]*function\b/gm;

/** 判断 text[i] 处的 "/" 是正则字面量起始而非除法运算符（issue #98）。 */
function isRegexStart(text, i) {
  let j = i - 1;
  while (j >= 0 && (text[j] === ' ' || text.charCodeAt(j) === 9)) j -= 1;
  if (j < 0) return true;
  const ch = text[j];
  // 含 `/`：除法运算符后紧跟的 `/` 必是正则字面量起始（`a / /["' ]/g`），
  // 否则正则内引号会落到字符串分支造成失明（issue #98 补强 A1）。常规
  // 除法链 `a / b / c` 的第二个 `/` 前驱是标识符，不受影响。
  if ('{([=:;,+-*%&|!?<>^~/'.indexOf(ch) !== -1) return true;
  const word = /[A-Za-z_$][A-Za-z0-9_$]*$/.exec(text.slice(0, j + 1));
  if (word) {
    return /^(return|throw|case|delete|void|typeof|instanceof|in|of|new|do|else|yield|await)$/.test(word[0]);
  }
  return false;
}

/** 从 text[start]（"/" 的后一位）扫描正则字面体至闭合 "/" 与 flags。 */
function scanRegexLiteral(text, start) {
  let j = start;
  let inClass = false;
  while (j < text.length) {
    const ch = text[j];
    if (ch.charCodeAt(0) === 92) { j += 2; continue; }
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
    // 块注释
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) { out.push(repl(text.slice(i))); break; }
      out.push(repl(text.slice(i, end + 2)));
      i = end + 2;
      continue;
    }
    // 行注释：跳到行尾（保留换行）。行注释内的引号/反引号若被当作字符串
    // 起始，会把后续真实代码整段剔除，导致「孤立 async」漏报并放行走私
    // （issue #75 / #98 补强：漏报比误报更危险）。
    if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i + 2);
      if (nl === -1) { out.push(repl(text.slice(i))); break; }
      out.push(repl(text.slice(i, nl)));
      i = nl;
      continue;
    }
    // 正则字面量 /.../flags（issue #98）：须在字符串判断之前处理，
    // 否则 /["' ]/g 这类含引号的正则会被误当作字符串起始，吞掉后续真实代码。
    if (c === '/' && text[i + 1] !== '/' && isRegexStart(text, i)) {
      const end = scanRegexLiteral(text, i + 1);
      if (end !== -1) {
        out.push(repl(text.slice(i, end + 1)));
        i = end + 1;
        continue;
      }
    }
    // 字符串 / 模板字面量（含插值片段）。处理转义；模板插值 ${} 内的内容在
    // 绝大多数场景也是文档/示例文本，统一剔除即可规避误报。
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === quote) break;
        j += 1;
      }
      if (j >= text.length) { out.push(repl(text.slice(i))); break; }
      out.push(repl(text.slice(i, j + 1)));
      i = j + 1;
      continue;
    }
    out.push(c);
    i += 1;
  }
  return out.join('');
}

function detachedHits(text) {
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

module.exports = { DETACHED_KEYWORD, isRegexStart, scanRegexLiteral, stripStringsAndBlockComments, detachedHits };