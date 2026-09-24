/**
 * dsh-file-drop — host half（M3 拖拽=粘贴 统一的宿主读图路由）。
 *
 * 浏览器半边（lib/client.js）对壳层 client-file-drop 载荷里「只有磁盘路径、
 * 没有内容」的内核白名单图片，先经本路由读成 dataUrl，再送进与「粘贴图片」
 * 「📎 选择器」完全相同的官方附件管道（conversation.createDraftImages +
 * inputActions.addImages —— 内核粘贴处理器 intakeImages 的同一落点），实现
 * 拖拽 = 粘贴 = 选择三种方式的完全一致效果。路由不可达（浏览器直开旧内核/
 * file:// 残留壳）时浏览器半边自动回退既有「路径提示」语义，零回归。
 *
 *   POST /dsh-file-drop/read-image   body { path, name?, size? }
 *     → 200 { ok:true, dataUrl, mediaType, name, size }
 *     → 4xx { ok:false, error }
 *
 * 防线（载荷不可信，与 dsh-terminal-tab 路由同款惯例）：
 *   · 仅回环连接（socket remoteAddress 判定）+ 仅 POST + JSON 体 ≤ 8KB；
 *   · 路径必须绝对（含 UNC \\ 前缀）、无控制字符、长度 ≤ 4096；
 *   · 扩展名必须在内核附件白名单（png/jpg/jpeg/webp/gif）；
 *   · stat 体积 ≤ 3.5MB（dsh-attachment-local 默认单图上限镜像）；
 *   · 魔数嗅探（PNG/JPEG/GIF/WEBP）确认内容确为图片，MIME 以嗅探结果为准
 *     （改名文件按真实类型裁决——真实图片照进管道，非图片内容拒绝）。
 */
import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

export const name = "dsh-file-drop";
export const inject = ["webServer"];

const READ_IMAGE_ROUTE = "/dsh-file-drop/read-image";
const MAX_BODY_BYTES = 8 * 1024;
const MAX_PATH_LEN = 4096;
/** 内核 dsh-attachment-local DEFAULT_MAX_IMAGE_BYTES 镜像（3670016）。 */
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;
/** 内核附件媒体白名单：扩展名 → 声明 MIME（最终以魔数嗅探为准）。 */
const EXT_MIME = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
]);

function isLoopback(req) {
  const ra = req.socket && req.socket.remoteAddress;
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

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function extOf(fileName) {
  const s = String(fileName || "");
  const dot = s.lastIndexOf(".");
  return dot <= 0 ? "" : s.slice(dot).toLowerCase();
}

function baseNameOf(p) {
  const parts = String(p || "").split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : "拖入图片";
}

/** 魔数嗅探：识别 PNG/JPEG/GIF/WEBP，返回真实 MIME；不识别返回 null。 */
export function sniffImageMime(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 6) {
    const head = buf.subarray(0, 6).toString("latin1");
    if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  }
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF"
    && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/** 路径净化：绝对（含 UNC）、无控制字符、限长；不合法返回空串。 */
export function saneImagePath(raw) {
  const p = String(raw == null ? "" : raw).trim();
  if (!p || p.length > MAX_PATH_LEN) return "";
  for (const ch of p) {
    const c = ch.codePointAt(0);
    if (c < 0x20 || c === 0x7f) return "";
  }
  if (!isAbsolute(p) && !p.startsWith("\\\\")) return "";
  return p;
}

export async function handleReadImage(req, res) {
  try {
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
    let body;
    try {
      body = JSON.parse((await readBody(req, MAX_BODY_BYTES)).replace(/^\uFEFF/, ""));
    } catch {
      sendJson(res, 400, { ok: false, error: "invalid JSON body" });
      return;
    }
    const target = saneImagePath(body && body.path);
    if (!target) {
      sendJson(res, 400, { ok: false, error: "invalid path" });
      return;
    }
    if (!EXT_MIME.has(extOf(target))) {
      sendJson(res, 415, { ok: false, error: "unsupported image type" });
      return;
    }
    let meta;
    try {
      meta = await stat(target);
    } catch {
      sendJson(res, 404, { ok: false, error: "file not found" });
      return;
    }
    if (!meta.isFile()) {
      sendJson(res, 400, { ok: false, error: "not a file" });
      return;
    }
    if (meta.size > MAX_IMAGE_BYTES) {
      sendJson(res, 413, { ok: false, error: "image too large" });
      return;
    }
    const bytes = await readFile(target);
    const real = sniffImageMime(bytes);
    if (!real) {
      sendJson(res, 415, { ok: false, error: "not an image" });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      dataUrl: `data:${real};base64,${bytes.toString("base64")}`,
      mediaType: real,
      name: String((body && body.name) || baseNameOf(target)).slice(0, 200) || baseNameOf(target),
      size: bytes.length,
    });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String((err && err.message) || err) });
  }
}

export function apply(ctx) {
  const dispose = ctx.webServer.register({ kind: "exact", path: READ_IMAGE_ROUTE, handler: handleReadImage });
  return () => {
    dispose();
  };
}
