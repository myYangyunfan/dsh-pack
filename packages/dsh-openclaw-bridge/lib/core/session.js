// @deepseek-ai/dsh-openclaw-bridge/lib/core/session.js
// 统一 IM 会话映射（SPEC §3/§9）：
//   - 会话键：<channel>:<convId>（convId 对 p2p 是用户 id、对群聊是群 id）；
//   - agent pool key：纯 ESM 零构建下保持可打印可落盘（im-<sha1 前 24 位>）；
//   - DSH 会话 id：dsh-im-<sha1 前 12 位>（确定性，重启后可续）。
// 文本分割（A-01）：长回复总长 ≤4000 字符，段落感知分段 ≤1500 字符/条。
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function convKey(channel, convId) {
  return channel + ":" + convId;
}

export function sessionIdFor(userKey) {
  return "dsh-im-" + sha1Hex(userKey).slice(0, 12);
}

export function agentKeyFor(userKey) {
  return "im-" + sha1Hex(userKey).slice(0, 24);
}

function sha1Hex(input) {
  return createHash("sha1").update(String(input || "")).digest("hex");
}

/**
 * 段落感知分段：按换行攒段，单段超限硬切。
 * @param {string} text
 * @param {number} max 单条上限（默认 1500）
 * @returns {string[]}
 */
export function splitText(text, max = 1500) {
  const s = String(text || "");
  if (s.length <= max) return [s];
  const out = [];
  let buf = "";
  for (const para of s.split(/\r?\n+/)) {
    if (!para) {
      if (buf) buf += "\n";
      continue;
    }
    if (buf.length + 1 + para.length <= max) {
      buf = buf ? buf + "\n" + para : para;
      continue;
    }
    if (buf) {
      out.push(buf);
      buf = "";
    }
    let rest = para;
    while (rest.length > max) {
      out.push(rest.slice(0, max));
      rest = rest.slice(max);
    }
    buf = rest;
  }
  if (buf) out.push(buf);
  return out.length > 0 ? out : [""];
}

/**
 * 回复整编：先截总长（≤4000），再分段。
 * @param {string} text
 * @param {{ maxTotal?: number, maxSegment?: number }} opts
 * @returns {string[]}
 */
export function segmentReply(text, { maxTotal = 4000, maxSegment = 1500 } = {}) {
  let s = String(text || "").trim();
  if (!s) return [""];
  if (s.length > maxTotal) s = s.slice(0, maxTotal) + "…（回复过长已截断）";
  return splitText(s, maxSegment);
}

/**
 * 会话映射存储（修复③）：IM 渠道 key -> DSH 会话 id 的持久化小仓。
 * 落盘为一个 JSON 对象文件；load 容错（文件缺失/损坏从空映射开始）。
 * 用途：微信/飞书/QQ 各会话在插件重启后 resume 回同一段上下文；
 *  /new 会写入一个新 id，使下一条消息开启全新上下文且不再续旧会话。
 * @param {string} file 落盘路径（如 ~/.dsh/openclaw-bridge/session-map.json）
 */
export function createSessionMap(file) {
  const map = new Map();
  function load() {
    try {
      if (existsSync(file)) {
        const obj = JSON.parse(readFileSync(file, "utf8")) || {};
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === "string" && v) map.set(k, v);
        }
      }
    } catch {
      // 首次运行/损坏文件：从空映射开始（不影响主流程）
    }
    return map;
  }
  function save() {
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(Object.fromEntries(map)));
      return true;
    } catch {
      return false; // 持久化失败不阻塞（进程内仍可续）
    }
  }
  return {
    map,
    load,
    save,
    get: (k) => map.get(k),
    set(k, v) {
      map.set(k, v);
      save();
    },
    remove(k) {
      if (map.delete(k)) save();
    },
    clear() {
      map.clear();
      save();
    },
    entries: () => [...map.entries()],
  };
}