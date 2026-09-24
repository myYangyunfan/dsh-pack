// @deepseek-ai/dsh-openclaw-bridge/lib/channels/qq.js
// QQ 开放平台机器人通道（P2，SPEC §7 / docs/qq-bot-dsh-report.md）。
// 官方协议：bot.q.qq.com 开放平台；AppID + 客户端密钥 → access_token（Bearer 前缀 QQBot）；
// WebSocket 网关（GET /gateway/bot 取接入点）收事件，REST 发消息。
// 零依赖纯 ESM：WS 复用 lib/ws.js，HTTP 用全局 fetch。
//
// 协议事实（已对照官方 Go SDK tencent-connect/botgo 源码核对）：
//   op: 0 DISPATCH / 1 HEARTBEAT / 2 IDENTITY / 6 RESUME / 7 RECONNECT /
//       9 INVALID_SESSION / 10 HELLO / 11 HEARTBEAT_ACK
//   intents: 1<<25 群消息(GROUP_AT_MESSAGE_CREATE+C2C_MESSAGE_CREATE) / 1<<30 频道@消息
//   identify d: {token:"QQBot <at>", intents, shard:[0,1], properties:{os,browser,device}}
//   heartbeat d = 最后收到的 seq(s)；resume d = {token, session_id, seq}
//   close 码：4009 可 resume；4004 重新取 token；4013/4014 intents 未授权(降级)；
//            4914/4915 下架/封禁(停止)
//   发送：POST /v2/groups/{group_openid}/messages、/v2/users/{user_openid}/messages
//         （body {content, msg_type:0, msg_id?}，msg_id=被动回复）
import { connect as wsConnect } from "../ws.js";

const TOKEN_URL = process.env.OPENCLAW_BRIDGE_QQ_TOKEN_URL || "https://bots.qq.com/app/getAppAccessToken";
const PROD_BASE = process.env.OPENCLAW_BRIDGE_QQ_BASE || "https://api.sgroup.qq.com";
const SANDBOX_BASE = process.env.OPENCLAW_BRIDGE_QQ_SANDBOX_BASE || "https://sandbox.api.sgroup.qq.com";

const OP = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTITY: 2,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
};
const INTENT_GROUP = 1 << 25; // GROUP_AT_MESSAGE_CREATE + C2C_MESSAGE_CREATE ...
const INTENT_GUILD_AT = 1 << 30; // AT_MESSAGE_CREATE（频道@）
const INTENT_FULL = INTENT_GROUP | INTENT_GUILD_AT;
const TOKEN_INVALID_CODE = 11244;
const CLOSE_RESUME_OK = new Set([4009]);
const CLOSE_RETOKEN = new Set([4004]);
const CLOSE_STOP = new Set([4914, 4915]); // 下架/封禁
const CLOSE_INTENT_DOWNGRADE = new Set([4013, 4014]); // intents 未授权
const MAX_HEARTBEAT_MISSES = 3;
const DEFAULT_HEARTBEAT_MS = 40000;
const TOKEN_EXPIRE_DELTA_MS = 9000; // 过期前提前量（同 SDK defaultExpiryDeltaMillSec）

function cleanContent(s) {
  return String(s || "").replace(/<@!?[^>]*>/g, "").trim();
}

/**
 * 宽容提取 getAppAccessToken 响应负载（修复④：官方网关可能返回
 * 平铺 {code, access_token, expires_in} 或嵌套 {code, data:{access_token, expires_in}}）。
 * @param {object} body
 * @returns {{code:number, access_token?:string, expires_in?:number|string}}
 */
export function pickTokenPayload(body) {
  const obj = (body && typeof body === "object") ? body : {};
  const inner =
    obj.data && typeof obj.data === "object" && obj.data !== null && ("access_token" in obj.data || "expires_in" in obj.data)
      ? obj.data
      : obj;
  const code = Number(obj.code ?? inner.code ?? 0);
  return { code, access_token: inner.access_token, expires_in: inner.expires_in };
}

function memberIdOf(d) {
  return (
    (d.author && (d.author.user_openid || d.author.member_openid || d.author.id)) ||
    (d.member && (d.member.openid || d.member.user_openid)) ||
    d.user_openid ||
    ""
  );
}

function memberNameOf(d) {
  return (
    (d.author && (d.author.username || d.author.nickname)) ||
    (d.member && (d.member.nick || d.member.username)) ||
    ""
  );
}

/**
 * QQ 事件归一化 → 共享入站消息（M1 纯文本）。
 * @param {object} parsed  网关 DISPATCH 帧（{op,t,s,id,d}）
 * @returns 归一化消息或 null（非目标事件/空文本/缺会话 id）
 */
export function normalizeQqEvent(parsed) {
  const t = parsed && parsed.t;
  const d = (parsed && parsed.d) || {};
  const id = String(d.id || "");
  const text = cleanContent(d.content);
  const memberId = memberIdOf(d);
  const name = memberNameOf(d);
  if (t === "GROUP_AT_MESSAGE_CREATE") {
    const convId = String(d.group_openid || d.group_id || "");
    if (!text || !convId) return null;
    return {
      channel: "qq",
      eventId: id,
      ts: Number(d.timestamp || Date.now()),
      conv: { kind: "group", id: convId, memberId, member: { id: memberId, name } },
      text,
      msgId: id,
      raw: parsed,
    };
  }
  if (t === "C2C_MESSAGE_CREATE") {
    const convId = memberId || String(d.user_openid || "");
    if (!text || !convId) return null;
    return {
      channel: "qq",
      eventId: id,
      ts: Number(d.timestamp || Date.now()),
      conv: { kind: "p2p", id: convId, memberId: convId, member: { id: convId, name } },
      text,
      msgId: id,
      raw: parsed,
    };
  }
  if (t === "AT_MESSAGE_CREATE") {
    // 频道 @：每频道一会话（视作群）
    const convId = String(d.channel_id || d.guild_id || "");
    if (!text || !convId) return null;
    return {
      channel: "qq",
      eventId: id,
      ts: Number(d.timestamp || Date.now()),
      conv: { kind: "group", id: convId, memberId, member: { id: memberId, name } },
      text,
      msgId: id,
      raw: parsed,
    };
  }
  if (t === "DIRECT_MESSAGE_CREATE") {
    // 频道私信：按来源频道会话
    const convId = String(d.src_guild_id || d.guild_id || "");
    if (!text || !convId) return null;
    return {
      channel: "qq",
      eventId: id,
      ts: Number(d.timestamp || Date.now()),
      conv: { kind: "p2p", id: convId, memberId, member: { id: memberId, name } },
      text,
      msgId: id,
      raw: parsed,
    };
  }
  return null;
}

/**
 * 创建 QQ 适配器（适配器契约见 SPEC §4.1）。
 * @param {{getConfig:()=>{appId?:string,appSecret?:string,qqSandbox?:string},
 *          logger?:{info,warn,error}, onState:(s)=>void, onMessage:(m)=>void|Promise,
 *          fetchImpl?:Function}} opts
 */
export function createQqAdapter({ getConfig, logger, onState, onMessage, fetchImpl }) {
  const doFetch = fetchImpl || ((url, opts2) => fetch(url, opts2));
  let state = "disconnected";
  let lastError = undefined;
  let botId = undefined;
  let disposed = false;
  let generation = 0;
  let ws = null;
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let heartbeatIntervalMs = DEFAULT_HEARTBEAT_MS;
  let heartbeatMisses = 0;
  let lastSeq = 0;
  let sessionId = "";
  let intents = INTENT_FULL;
  let readyResolve = null;
  let readyTimer = null;
  // token 缓存按凭据键控（appId+\x00+appSecret），换 Secret 不命中旧缓存
  const tokenCache = new Map();

  const cfg = () => getConfig() || {};
  const sandboxOn = () => String(cfg().qqSandbox || "1").trim() !== "0"; // 缺省沙箱（D-06）
  const base = () => (sandboxOn() ? SANDBOX_BASE : PROD_BASE);

  const emitState = (s, info) => {
    state = s;
    if (info && info.error) lastError = String(info.error);
    else if (s === "connected") lastError = "";
    onState({ state: s, ...(info || {}) });
  };

  const log = (level, msg) => {
    if (logger && typeof logger[level] === "function") logger[level]("qq: " + msg);
  };

  async function jsonFetch(url, opts2) {
    const res = await doFetch(url, opts2);
    const text = await res.text();
    let body = {};
    try {
      body = JSON.parse(text);
    } catch {
      body = { code: -1, message: text.slice(0, 200) };
    }
    return { httpStatus: res.status, body };
  }

  // ---- token（bots.qq.com/app/getAppAccessToken）----
  async function ensureToken(appId, appSecret) {
    const now = Date.now();
    const cacheKey = appId + "\x00" + appSecret;
    const hit = tokenCache.get(cacheKey);
    if (hit && hit.expiresAt - TOKEN_EXPIRE_DELTA_MS > now) return hit.token;
    const { body } = await jsonFetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, clientSecret: appSecret }),
    });
    const payload = pickTokenPayload(body);
    if (!payload.access_token || Number(payload.code) !== 0) {
      const msg = (body && (body.message || body.msg)) || "";
      throw new Error("QQ access_token 获取失败: code=" + payload.code + " msg=" + msg);
    }
    tokenCache.set(cacheKey, {
      token: payload.access_token,
      expiresAt: now + Number(payload.expires_in || 7200) * 1000,
    });
    return payload.access_token;
  }

  // ---- 网关接入点 ----
  async function discoverGateway(token) {
    const { httpStatus, body } = await jsonFetch(base() + "/gateway/bot", {
      headers: { Authorization: "QQBot " + token },
    });
    if (!body.url) {
      throw new Error("QQ gateway 获取失败: status=" + httpStatus + " body=" + JSON.stringify(body).slice(0, 200));
    }
    return body;
  }

  // ---- WS 收发 ----
  function sendRaw(obj) {
    if (!ws || ws.readyState !== 1) return false;
    try {
      ws.send(JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  }

  function handleFrame(p) {
    if (!p || typeof p.op !== "number") return;
    switch (p.op) {
      case OP.HELLO: {
        heartbeatIntervalMs = Number((p.d && p.d.heartbeat_interval) || DEFAULT_HEARTBEAT_MS);
        startHeartbeat();
        return;
      }
      case OP.HEARTBEAT_ACK:
        heartbeatMisses = 0;
        return;
      case OP.DISPATCH: {
        if (p.s > lastSeq) lastSeq = p.s;
        if (p.t === "READY") {
          sessionId = (p.d && p.d.session_id) || "";
          botId = (p.d && p.d.user && p.d.user.id) || botId;
          heartbeatMisses = 0;
          if (readyResolve) {
            const r = readyResolve;
            readyResolve = null;
            if (readyTimer) {
              clearTimeout(readyTimer);
              readyTimer = null;
            }
            r();
          }
          emitState("connected", botId ? { botId } : undefined);
          return;
        }
        if (p.t === "RESUMED") {
          heartbeatMisses = 0;
          if (readyResolve) {
            const r = readyResolve;
            readyResolve = null;
            if (readyTimer) {
              clearTimeout(readyTimer);
              readyTimer = null;
            }
            r();
          }
          emitState("connected", botId ? { botId } : undefined);
          return;
        }
        const m = normalizeQqEvent(p);
        if (m) {
          try {
            const r = onMessage(m);
            if (r && typeof r.catch === "function") r.catch((e) => log("warn", "onMessage failed: " + String(e && e.message || e)));
          } catch (e) {
            log("warn", "onMessage failed: " + String(e && e.message || e));
          }
        }
        return;
      }
      case OP.RECONNECT: {
        // 服务端要求重连：可 resume
        log("info", "server requested reconnect (op=7)");
        if (ws) {
          try {
            ws.destroy();
          } catch {}
        }
        scheduleReconnect(true);
        return;
      }
      case OP.INVALID_SESSION: {
        // session 失效 → 重新 identify
        log("warn", "invalid session (op=9), re-identify");
        if (ws) {
          try {
            ws.destroy();
          } catch {}
        }
        scheduleReconnect(false);
        return;
      }
      default:
        return;
    }
  }

  function connectWs(url, token, mode) {
    return new Promise((resolve, reject) => {
      const myGen = generation;
      let settled = false;
      let opened = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        if (ws) {
          try {
            ws.destroy();
          } catch {}
          ws = null;
        }
        reject(err);
      };
      const em = wsConnect(url, { handshakeTimeoutMs: 15000 });
      ws = em;
      em.on("message", (data) => {
        let text = data;
        if (typeof data !== "string") text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
        try {
          handleFrame(JSON.parse(text));
        } catch (e) {
          log("warn", "frame parse failed: " + String(e && e.message || e));
        }
      });
      em.on("open", () => {
        if (myGen !== generation) return;
        opened = true;
        if (!settled) {
          settled = true;
          resolve();
        }
        if (mode === "resume" && sessionId) {
          sendRaw({ op: OP.RESUME, d: { token: "QQBot " + token, session_id: sessionId, seq: lastSeq } });
        } else {
          sendRaw({
            op: OP.IDENTITY,
            d: {
              token: "QQBot " + token,
              intents,
              shard: [0, 1],
              properties: { os: process.platform, browser: "dsh-openclaw-bridge", device: "dsh-openclaw-bridge" },
            },
          });
        }
      });
      em.on("error", (e) => {
        if (myGen !== generation) return;
        log("warn", "ws error: " + String(e && e.message || e));
        if (opened) scheduleReconnect(sessionId ? true : false, e);
        else fail(e);
      });
      em.on("close", (code, reason) => {
        if (myGen !== generation) return;
        if (!opened) {
          fail(new Error("qq ws closed before open: code=" + code + " " + String(reason || "")));
          return;
        }
        if (CLOSE_STOP.has(code)) {
          log("error", "bot offline/banned, stop: code=" + code + " " + String(reason || ""));
          clearHeartbeat();
          emitState("failed", { error: "QQ bot offline/banned (close " + code + ")" });
          return;
        }
        if (CLOSE_RETOKEN.has(code)) {
          log("warn", "auth fail (close " + code + "), refresh token");
          for (const k of tokenCache.keys()) tokenCache.delete(k);
          scheduleReconnect(false);
          return;
        }
        if (CLOSE_INTENT_DOWNGRADE.has(code)) {
          log("warn", "intents not authorized (close " + code + "), downgrade to group intents");
          intents = INTENT_GROUP;
          scheduleReconnect(false);
          return;
        }
        scheduleReconnect(CLOSE_RESUME_OK.has(code) || sessionId ? true : false, reason);
      });
    });
  }

  // ---- 心跳 ----
  function startHeartbeat() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (disposed || !ws || ws.readyState !== 1) return;
      heartbeatMisses++;
      sendRaw({ op: OP.HEARTBEAT, d: lastSeq });
      if (heartbeatMisses >= MAX_HEARTBEAT_MISSES) {
        heartbeatMisses = 0;
        log("warn", "heartbeat missed " + MAX_HEARTBEAT_MISSES + "x, reconnect");
        try {
          ws.destroy();
        } catch {}
      }
    }, heartbeatIntervalMs);
    if (heartbeatTimer && heartbeatTimer.unref) heartbeatTimer.unref();
  }

  function clearHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  // ---- 重连（指数退避 1s→2s→…→60s cap；resume 优先）----
  function scheduleReconnect(resume, reason) {
    if (disposed || generation === 0) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 60000);
    if (reason) log("info", "reconnect in " + delay + "ms (resume=" + !!resume + "): " + String(reason || ""));
    emitState("reconnecting", { error: reason ? String(reason) : undefined });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (disposed) return;
      connectCycle(resume)
        .then(() => {
          reconnectAttempts = 0;
        })
        .catch((e) => {
          log("warn", "reconnect attempt failed: " + String(e && e.message || e));
          scheduleReconnect(true, e && e.message);
        });
    }, delay);
    if (reconnectTimer && reconnectTimer.unref) reconnectTimer.unref();
  }
  let reconnectAttempts = 0;

  // ---- 连接循环（start/重连共用；resolve 时机 = 收到 READY/RESUMED）----
  async function connectCycle(resume = false) {
    const c = cfg();
    const appId = String(c.appId || "").trim();
    const appSecret = String(c.appSecret || "").trim();
    if (!appId || !appSecret) throw new Error("QQ 凭据未配置（qqBotAppId/qqBotToken）");
    const token = await ensureToken(appId, appSecret);
    emitState("connecting");
    const gw = await discoverGateway(token);
    const url = String(gw.url || "");
    if (!/^wss?:/i.test(url)) throw new Error("QQ gateway url 无效: " + url.slice(0, 120));
    await new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyTimer = setTimeout(() => {
        readyResolve = null;
        reject(new Error("QQ READY 超时（网关未下发 READY）"));
      }, 10000);
      connectWs(url, token, resume).catch((e) => {
        readyResolve = null;
        if (readyTimer) {
          clearTimeout(readyTimer);
          readyTimer = null;
        }
        reject(e);
      });
    });
    if (readyTimer) {
      clearTimeout(readyTimer);
      readyTimer = null;
    }
  }

  // ---- 发送 ----
  async function send(conv, text, opts = {}) {
    const c = cfg();
    const appId = String(c.appId || "").trim();
    const appSecret = String(c.appSecret || "").trim();
    if (!appId || !appSecret) return { ok: false, detail: "QQ 凭据未配置" };
    const body = { content: String(text), msg_type: 0 };
    if (opts.msgId) body.msg_id = String(opts.msgId);
    const isGroup = conv && conv.kind === "group";
    const path = (isGroup ? "/v2/groups/" : "/v2/users/") + encodeURIComponent((conv && conv.id) || "") + "/messages";
    const doSend = async (token) =>
      jsonFetch(base() + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "QQBot " + token },
        body: JSON.stringify(body),
      });
    let r = await doSend(await ensureToken(appId, appSecret));
    if (r.httpStatus === 401 || (r.body && Number(r.body.code) === TOKEN_INVALID_CODE)) {
      tokenCache.delete(appId + "\x00" + appSecret);
      r = await doSend(await ensureToken(appId, appSecret));
    }
    if (r.httpStatus >= 200 && r.httpStatus < 300) {
      return { ok: true, detail: (r.body && r.body.id) || "sent" };
    }
    return { ok: false, detail: "status=" + r.httpStatus + " code=" + (r.body && r.body.code) + " msg=" + ((r.body && r.body.message) || "") };
  }

  // ---- 适配器接口 ----
  const status = () => {
    const c = cfg();
    return {
      state,
      appId: String(c.appId || "").trim(),
      sandbox: sandboxOn(),
      lastError: lastError || undefined,
      botId,
    };
  };
  return {
    id: "qq",
    title: "QQ",
    implemented: true,
    status,
    async start() {
      if (disposed) disposed = false;
      generation++;
      reconnectAttempts = 0;
      const myGen = generation;
      try {
        await connectCycle(false);
      } catch (e) {
        if (myGen === generation) {
          log("error", "start failed: " + String(e && e.message || e));
          emitState("failed", { error: String(e && e.message || e) });
          throw e;
        }
      }
    },
    async stop() {
      generation++;
      clearHeartbeat();
      if (readyTimer) {
        clearTimeout(readyTimer);
        readyTimer = null;
      }
      readyResolve = null;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        try {
          ws.destroy();
        } catch {}
        ws = null;
      }
      emitState("disconnected");
      return status();
    },
    async validate(ccfg) {
      const appId = String((ccfg && ccfg.appId) || cfg().appId || "").trim();
      const appSecret = String((ccfg && ccfg.appSecret) || cfg().appSecret || "").trim();
      if (!appId || !appSecret) return { ok: false, detail: "缺少 qqBotAppId/qqBotToken" };
      try {
        await ensureToken(appId, appSecret);
        return { ok: true, detail: "凭据有效：access_token 获取成功" };
      } catch (e) {
        return { ok: false, detail: String(e && e.message || e) };
      }
    },
    verify() {
      return { ok: false, status: { error: "QQ 开放平台机器人无需配对码" } };
    },
    async send(conv, text, opts = {}) {
      return send(conv, text, opts);
    },
    dispose() {
      disposed = true;
      generation++;
      clearHeartbeat();
      if (readyTimer) {
        clearTimeout(readyTimer);
        readyTimer = null;
      }
      readyResolve = null;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        try {
          ws.destroy();
        } catch {}
        ws = null;
      }
      emitState("disconnected");
    },
  };
}
