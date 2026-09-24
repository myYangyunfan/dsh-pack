/**
 * dsh-image-paste — 宿主半边（cordis 插件）
 *
 * 自制壳时代由 preload 桥上的受控 IPC（imagePaste.save）把剪贴板图片
 * 落到 %TEMP%/dsh-paste/；壳退役后该桥不再存在，这条链路整个失效（客户端
 * 只能 reject('no bridge')）。插件宿主半边就跑在内核 Node 进程里，因此改由
 * 一条 HTTP 路由承接同一职责：
 *
 *   POST /api/dsh-image-paste/save   body = { dataUrl, name }
 *     → { ok: true, path, size } | { ok: false, error }
 *
 * 请求体来自网页（composer），而本路由往磁盘写，故按不可信输入处理：
 * MIME 白名单、解码后体积上限、文件名自造、落点必须仍在规定临时目录内。
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const name = "image-paste";
const inject = ["webServer"];

const SAVE_ROUTE = "/api/dsh-image-paste/save";

/** 图片子类型白名单 → 落盘扩展名。刻意不含 image/svg+xml：SVG 可携带脚本。 */
const IMAGE_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "image/avif": ".avif",
  "image/tiff": ".tiff",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
};

const MAX_DECAMED_BYTES = 15 * 1024 * 1024; // 与客户端 MAX_IMAGE_BYTES 同档
const MAX_BODY_BYTES = 24 * 1024 * 1024;    // base64 开销 ~4/3，留一点余量
const PASTE_DIR_NAME = "dsh-paste";

/** 落盘根目录（DSH_IMAGE_PASTE_DIR 覆盖仅用于测试隔离，绝不落到真实临时目录之外）。 */
function pasteRoot() {
  const override = process.env.DSH_IMAGE_PASTE_DIR;
  if (typeof override === "string" && isAbsolute(override.trim())) return resolve(override.trim());
  return resolve(join(tmpdir(), PASTE_DIR_NAME));
}

/**
 * 组件级路径清洗（与内核侧围栏同一口径）：消解 `.`/`..`，不触碰文件系统。
 * Windows 与 POSIX 分隔符统一按平台 path 语义处理。
 */
function cleanPath(p) {
  return resolve(p);
}

/**
 * 包含判定：target 是否落在 root 内（含 root 本身），按**路径组件**对齐比较。
 * 刻意不做大小写折叠：Windows 大小写变体在此一律拒绝（与自制壳 fence 的
 * fail-closed 口径一致——宁可拒一个合法路径，不可放一个越界路径）。
 */
function pathContains(root, target) {
  const r = cleanPath(root);
  const t = cleanPath(target);
  if (t === r) return true;
  const prefix = r.endsWith(sep) ? r : r + sep;
  return t.startsWith(prefix);
}

/** 自造文件名：时间戳 + 随机后缀，调用方的 name 只作校验、绝不参与拼接。 */
function pasteFileName(ext) {
  const now = new Date();
  const p = (n, w = 2) => String(n).padStart(w, "0");
  const stamp = now.getFullYear() + p(now.getMonth() + 1) + p(now.getDate())
    + "-" + p(now.getHours()) + p(now.getMinutes()) + p(now.getSeconds());
  const rand = Math.random().toString(16).slice(2, 8);
  return "paste-" + stamp + "-" + rand + ext;
}

/**
 * 校验调用方给的 name：只允许「一个裸文件名」形态。
 * 含路径分隔符、`..`、盘符、控制字符或超长一律拒绝（错误消息供界面显示）。
 */
export function validateDisplayName(raw) {
  if (raw === undefined || raw === null || raw === "") return "";
  if (typeof raw !== "string") return "name must be a string";
  if (raw.length > 120) return "name is too long";
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "name contains control characters";
  if (/[\\/]/.test(raw)) return "name must not contain path separators";
  if (raw.includes("..")) return "name must not contain ..";
  if (/^[a-zA-Z]:/.test(raw)) return "name must not contain a drive letter";
  return "";
}

/**
 * 解析并解码 data URL（纯函数，可单测）。
 * @returns {{ ok: true, mime: string, ext: string, buffer: Buffer } | { ok: false, error: string }}
 */
export function decodeDataUrl(raw) {
  if (typeof raw !== "string" || !raw) return { ok: false, error: "dataUrl is required" };
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(raw);
  if (!match) return { ok: false, error: "dataUrl is malformed" };
  const mime = String(match[1] || "").toLowerCase().trim();
  const isBase64 = Boolean(match[2]);
  const body = match[3];
  const ext = IMAGE_EXT[mime];
  if (!ext) return { ok: false, error: "unsupported image type: " + (mime || "(empty)") };
  if (!isBase64) return { ok: false, error: "dataUrl must be base64 encoded" };
  let buffer;
  try {
    buffer = Buffer.from(body, "base64");
  } catch {
    return { ok: false, error: "dataUrl base64 decode failed" };
  }
  // Buffer.from(_, 'base64') 对脏字符是宽容解码（不抛错），故以「解出字节」为准，
  // 真正的边界由下面的体积上限与扩展名白名单把住。
  if (buffer.length === 0) return { ok: false, error: "dataUrl is empty" };
  if (buffer.length > MAX_DECAMED_BYTES) {
    return { ok: false, error: "image exceeds " + MAX_DECAMED_BYTES + " bytes" };
  }
  return { ok: true, mime, ext, buffer };
}

function isLoopback(req) {
  const ra = req && req.socket ? req.socket.remoteAddress : null;
  return ra === "127.0.0.1" || ra === "::1" || ra === "::ffff:127.0.0.1";
}

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": String(data.length),
  });
  res.end(data);
}

/** 读干请求体并 JSON 解析（超限即断流；本路由唯一的输入面）。 */
function readJsonBody(req, limitBytes = MAX_BODY_BYTES) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > limitBytes) {
        rejectPromise(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        rejectPromise(new Error("empty body"));
        return;
      }
      try {
        resolvePromise(JSON.parse(text));
      } catch {
        rejectPromise(new Error("body must be JSON"));
      }
    });
    req.on("error", rejectPromise);
  });
}

async function handleSave(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, { allow: "POST" });
    res.end();
    return;
  }
  if (!isLoopback(req)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { ok: false, error: String((err && err.message) || err) });
    return;
  }
  if (!payload || typeof payload !== "object") {
    sendJson(res, 400, { ok: false, error: "body must be an object" });
    return;
  }
  const nameError = validateDisplayName(payload.name);
  if (nameError) {
    sendJson(res, 400, { ok: false, error: nameError });
    return;
  }
  const decoded = decodeDataUrl(payload.dataUrl);
  if (!decoded.ok) {
    sendJson(res, 400, { ok: false, error: decoded.error });
    return;
  }
  const root = pasteRoot();
  const target = join(root, pasteFileName(decoded.ext));
  // 清洗后仍须落在根内：文件名自造本不可能越界，此处兜住 root 被环境覆盖成
  // 奇怪形态（如带 .. 的 DSH_IMAGE_PASTE_DIR）的情况。
  if (!pathContains(root, target) || dirname(target) !== root) {
    sendJson(res, 400, { ok: false, error: "resolved path escapes the paste directory" });
    return;
  }
  try {
    // 0o700 / 0o600：粘贴图常是截图（含隐私），不给同机其他用户可读（POSIX 生效）。
    await mkdir(root, { recursive: true, mode: 0o700 });
    await writeFile(target, decoded.buffer, { mode: 0o600 });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String((err && err.message) || err) });
    return;
  }
  sendJson(res, 200, { ok: true, path: target, size: decoded.buffer.length });
}

function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({ kind: "exact", path: SAVE_ROUTE, handler: handleSave }),
    "image-paste: /save route",
  );
}

export { apply, inject, name };

// 官方模块加载器下宿主半边没有 require 面，单测经此命中纯函数
//（口径对齐 dsh-balance / dsh-client-file-changes 的同名惯例）。
export const __internals = {
  SAVE_ROUTE,
  IMAGE_EXT,
  MAX_DECAMED_BYTES,
  MAX_BODY_BYTES,
  pasteRoot,
  pasteFileName,
  pathContains,
  isLoopback,
  handleSave,
  readJsonBody,
};
