/**
 * dsh-client-file-changes —— 宿主半边（cordis 插件）
 *
 * 「文件」视图的头号功能「还原」在自制壳时代走壳层桥的 revertFiles
 * （Tauri command file_revert / Electron ipc dsh:file-revert）。桥退役后这条
 * 链路由本路由承接：
 *
 *   POST /api/dsh-files/revert   body = { changes: [{ path, op, oldText, newText }] }
 *     → { ok: boolean, results: [{ path, status, error? }], applied: number }
 *
 * 注意路由前缀同为 /api/dsh-files/*，但登记在**本包**里：目录树/静态预览/端口
 * 探测那组 exact 路由属姊妹包 dsh-file-changes（webServer 的 (kind,path) 全局
 * 唯一，重复登记会抛），故这里只新增 /revert 一条，不与它争任何一条路径。
 *
 * 应用语义逐字对齐 file_revert：逆序应用 → 内容精确匹配 newText 才动手 →
 * 只替换首处命中 → 原子写。围栏语义见 ./fence.js。
 */

import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Fence, ensureSaneAbsolute } from "./fence.js";

const name = "dsh-client-file-changes"; // 与退役前的插件标识一致，勿改
const inject = ["webServer"];

const REVERT_ROUTE = "/api/dsh-files/revert";

const MAX_BODY_BYTES = 32 * 1024 * 1024; // 变更集含全文，留足余量但有硬上限
const MAX_CHANGES = 2000;                // 与投影侧 MAX_CHANGES 同档

/** 还原落点允许根：DSH_HOME（home 外另要求「已存在常规文件」，见 resolveTarget）。 */
function fenceRoots() {
  const env = process.env.DSH_HOME;
  const home = typeof env === "string" && env.trim() !== "" ? env.trim() : join(homedir(), ".dsh");
  return [home];
}

/**
 * 单条变更的目标路径解析（纯函数注入 fs 探针以便单测）：
 *   · 非法/相对路径 → invalid；
 *   · 围栏内 → 清洗后路径；
 *   · 围栏外 → 仅接受**已存在的常规文件**（自制壳 R5/#137 口径：工作区在用户
 *     自选目录，只放行 dsh_home 会把还原主场景全拒；而内核进程本就能读写任意
 *     路径，围栏挡内核能做的事只伤可用性。不得借还原创建新路径）。
 * @returns {{ ok: true, path: string } | { ok: false, error: string }}
 */
export function resolveRevertTarget(rawPath, roots, isExistingFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}) {
  const path = String(rawPath ?? "");
  const sane = ensureSaneAbsolute(path);
  if (sane) return { ok: false, error: sane };
  const fence = new Fence(roots);
  try {
    return { ok: true, path: fence.ensure(path) };
  } catch {
    if (!isExistingFile(path)) {
      return { ok: false, error: "[E_FENCE_ROOT] home 外须为已存在文件: " + path };
    }
    return { ok: true, path };
  }
}

/** 逆序应用一条变更；返回 'applied' | 'skipped' | 错误文案（字符串）。 */
async function applyOne(change, roots, io) {
  const target = resolveRevertTarget(change.path, roots, io.exists);
  if (!target.ok) return target.error;
  let content;
  try {
    content = await io.read(target.path);
  } catch (err) {
    return "读取 " + target.path + ": " + String((err && err.message) || err);
  }
  const oldText = typeof change.oldText === "string" ? change.oldText : "";
  const newText = typeof change.newText === "string" ? change.newText : "";
  // 内容不匹配（文件已被后续改动）或无写后文本：跳过，幂等安全。
  if (!newText || !content.includes(newText)) return "skipped";
  const reverted = content.replace(newText, () => oldText); // 只替换首处，且不解释 $ 模式
  try {
    await io.write(target.path, reverted);
  } catch (err) {
    return "写入 " + target.path + ": " + String((err && err.message) || err);
  }
  return "applied";
}

/**
 * 变更集 → 按 path 汇总的还原结果（status: reverted | conflict | failed）。
 * 逆序在此处完成（与 file_revert 一致：末次变更先还原，逐层回到首次写前状态）。
 */
export async function revertChanges(changes, roots, io) {
  const perPath = new Map(); // path -> { applied, skipped, errors[] }
  const track = (path) => {
    if (!perPath.has(path)) perPath.set(path, { applied: 0, skipped: 0, errors: [] });
    return perPath.get(path);
  };
  const ordered = Array.isArray(changes) ? [...changes].reverse() : [];
  for (const change of ordered) {
    const path = String(change?.path ?? "");
    const outcome = await applyOne(change || {}, roots, io);
    const bucket = track(path);
    if (outcome === "applied") bucket.applied += 1;
    else if (outcome === "skipped") bucket.skipped += 1;
    else bucket.errors.push(outcome);
  }
  const results = [];
  let applied = 0;
  for (const [path, bucket] of perPath) {
    applied += bucket.applied;
    let status = "conflict";
    if (bucket.errors.length > 0) status = "failed";
    else if (bucket.applied > 0) status = "reverted";
    results.push({
      path,
      status,
      ...(bucket.errors.length > 0 ? { error: bucket.errors.join("；") } : {}),
    });
  }
  return { ok: results.every((r) => r.status !== "failed"), results, applied };
}

const DEFAULT_IO = {
  read: (p) => readFile(p, "utf8"),
  exists: (p) => {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  },
  // 原子写：先写同目录 .revert-tmp 再 rename（口径同 atomic_write）。
  // 目标含换行/无扩展名时 withExtension 式命名会丢扩展名，故统一用后缀式。
  write: async (p, content) => {
    const tmp = p + ".revert-tmp";
    try {
      await writeFile(tmp, content, "utf8");
      await rename(tmp, p);
    } catch (err) {
      await unlink(tmp).catch(() => {});
      throw err;
    }
  },
};

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
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        rejectPromise(new Error("body must be JSON"));
      }
    });
    req.on("error", rejectPromise);
  });
}

async function handleRevertRoute(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, { allow: "POST" });
    res.end();
    return;
  }
  // 与姊妹包 /api/dsh-files/* 同一口径：只接受回环来源。
  if (!isLoopback(req)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { ok: false, results: [], error: String((err && err.message) || err) });
    return;
  }
  const changes = payload && Array.isArray(payload.changes) ? payload.changes : null;
  if (!changes) {
    sendJson(res, 400, { ok: false, results: [], error: "changes must be an array" });
    return;
  }
  if (changes.length > MAX_CHANGES) {
    sendJson(res, 400, { ok: false, results: [], error: "too many changes (max " + MAX_CHANGES + ")" });
    return;
  }
  try {
    const outcome = await revertChanges(changes, fenceRoots(), DEFAULT_IO);
    sendJson(res, 200, outcome);
  } catch (err) {
    sendJson(res, 500, { ok: false, results: [], error: String((err && err.message) || err) });
  }
}

function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({ kind: "exact", path: REVERT_ROUTE, handler: handleRevertRoute }),
    "client-file-changes: /revert route",
  );
}

export { apply, inject, name };

// 官方模块加载器下宿主半边没有 require 面，单测经此命中纯函数
//（口径对齐 dsh-balance / dsh-client-file-changes 客户端的同名惯例）。
export const __internals = {
  REVERT_ROUTE,
  MAX_BODY_BYTES,
  MAX_CHANGES,
  fenceRoots,
  handleRevertRoute,
  isLoopback,
  readJsonBody,
};
