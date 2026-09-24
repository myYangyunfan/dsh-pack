// @deepseek-ai/dsh-openclaw-bridge/lib/channels/feishu.js
// 飞书渠道适配器（SPEC §6 / docs/feishu-bot-dsh-report.md）。
// 零依赖实现：手写 protobuf 帧编解码（RFC: pbbp2.Frame）、AES-256-CBC 事件解密、
// sum/seq 分片重组、ping 心跳循环、断线自动重连；HTTP 用全局 fetch，WS 用 lib/ws.js。
//
// 协议要点（对照官方 @larksuiteoapi/node-sdk v1.73.0 WSClient）：
//   1) POST {base}/callback/ws/endpoint  body {AppID, AppSecret} -> data.URL + data.ClientConfig
//   2) connect(URL)（URL 自带鉴权参数；数据为二进制帧，protobuf 编解码）
//   3) open 后立即发 control 帧 {type:ping}，之后每 PingInterval（默认 120s）重发
//   4) control 帧 type=pong -> payload 为 {PingInterval,ReconnectCount,ReconnectInterval,ReconnectNonce}
//   5) data 帧 type=event -> 按 message_id + sum/seq 重组 -> JSON（可能带 {"encrypt":...} 信封）
//   6) 每事件回 ACK data 帧（原 headers + biz_rt，payload {"code":200}），否则服务端重推
//   7) 断线重连：ReconnectNonce*random() 后按 ReconnectInterval 重试，ReconnectCount 次上限
import { connect as wsConnect } from "../ws.js";
import { createHash, createDecipheriv } from "node:crypto";

const DEFAULT_BASE = process.env.OPENCLAW_BRIDGE_FEISHU_BASE || "https://open.feishu.cn";
const TOKEN_PATH = "/open-apis/auth/v3/tenant_access_token/internal";
const ENDPOINT_PATH = "/callback/ws/endpoint";
const MSG_PATH = "/open-apis/im/v1/messages";
const TOKEN_INVALID_CODES = new Set([99991663, 99991668]); // token 失效/过期 -> 刷新重试一次
const BOT_AGENT = "dsh-openclaw-bridge/0.7.0";

// ---- protobuf 编解码（pbbp2.Header / pbbp2.Frame）----
// Header: 1 key(string), 2 value(string)
// Frame: 1 SeqID(uint64), 2 LogID(uint64), 3 service(int32), 4 method(int32),
//        5 headers(repeated Header), 6 payloadEncoding(string), 7 payloadType(string),
//        8 payload(bytes), 9 LogIDNew(string)
const WT_VARINT = 0;
const WT_LEN = 2;

function writeVarint(parts, value) {
  let v = BigInt(value);
  const buf = [];
  for (;;) {
    if (v < 0x80n) {
      buf.push(Number(v));
      break;
    }
    buf.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  parts.push(Buffer.from(buf));
}

function writeField(parts, field, wireType, buf) {
  writeVarint(parts, (field << 3) | wireType);
  parts.push(buf);
}

function writeLenDelim(parts, field, payload) {
  writeField(parts, field, WT_LEN, payload);
}

function encodeHeader(key, value) {
  const parts = [];
  const kb = Buffer.from(String(key), "utf8");
  const vb = Buffer.from(String(value), "utf8");
  writeVarint(parts, 10); // field 1, wireType 2
  writeVarint(parts, kb.length);
  parts.push(kb);
  writeVarint(parts, 18); // field 2, wireType 2
  writeVarint(parts, vb.length);
  parts.push(vb);
  return Buffer.concat(parts);
}

/**
 * @param {{ service?: number, method: number, headers?: Array<{key:string,value:string}>, payload?: Buffer }} frame
 */
export function encodeFrame(frame) {
  const parts = [];
  if (frame.service) {
    writeVarint(parts, 24); // field 3 varint: service
    writeVarint(parts, frame.service);
  }
  writeVarint(parts, 32); // field 4 varint: method
  writeVarint(parts, frame.method || 0);
  for (const h of frame.headers || []) {
    const hb = encodeHeader(h.key, h.value);
    writeVarint(parts, 42); // field 5, wireType 2
    writeVarint(parts, hb.length);
    parts.push(hb);
  }
  if (frame.payload && frame.payload.length) {
    writeVarint(parts, 66); // field 8, wireType 2
    writeVarint(parts, frame.payload.length);
    parts.push(frame.payload);
  }
  return Buffer.concat(parts);
}

export function decodeFrame(buf) {
  let pos = 0;
  const frame = { SeqID: 0, LogID: 0, service: 0, method: 0, headers: [], payload: null, payloadEncoding: "", payloadType: "", LogIDNew: "" };
  while (pos < buf.length) {
    const tag = readVarint(buf, pos);
    pos = tag.pos;
    const field = tag.value >> 3;
    const wire = tag.value & 7;
    if (wire === WT_VARINT) {
      const v = readVarint(buf, pos);
      pos = v.pos;
      const num = Number(v.value);
      if (field === 1) frame.SeqID = num;
      else if (field === 2) frame.LogID = num;
      else if (field === 3) frame.service = num;
      else if (field === 4) frame.method = num;
    } else if (wire === WT_LEN) {
      const len = readVarint(buf, pos);
      pos = len.pos;
      const n = Number(len.value);
      const data = buf.subarray(pos, pos + n);
      pos += n;
      if (field === 5) {
        frame.headers.push(decodeHeader(data));
      } else if (field === 6) {
        frame.payloadEncoding = data.toString("utf8");
      } else if (field === 7) {
        frame.payloadType = data.toString("utf8");
      } else if (field === 8) {
        frame.payload = Buffer.from(data);
      } else if (field === 9) {
        frame.LogIDNew = data.toString("utf8");
      }
    } else if (wire === 1) {
      pos += 8;
    } else if (wire === 5) {
      pos += 4;
    } else {
      break; // 未知 wire type：跳过本帧
    }
  }
  return frame;
}

function decodeHeader(buf) {
  let pos = 0;
  const out = { key: "", value: "" };
  while (pos < buf.length) {
    const tag = readVarint(buf, pos);
    pos = tag.pos;
    const field = tag.value >> 3;
    const len = readVarint(buf, pos);
    pos = len.pos;
    const n = Number(len.value);
    if (field === 1) out.key = buf.subarray(pos, pos + n).toString("utf8");
    else if (field === 2) out.value = buf.subarray(pos, pos + n).toString("utf8");
    pos += n;
  }
  return out;
}

function readVarint(buf, pos) {
  let value = 0n;
  let shift = 0n;
  for (let i = 0; i < 10; i++) {
    if (pos + i >= buf.length) break;
    const byte = buf[pos + i];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: value > BigInt(Number.MAX_SAFE_INTEGER) ? value : Number(value), pos: pos + i + 1 };
    }
    shift += 7n;
  }
  return { value, pos: buf.length };
}

// ---- 事件解密（官方 SDK AESCipher 同构：key=sha256(encryptKey)，IV=密文前 16 字节，AES-256-CBC）----
export function feishuDecrypt(encryptB64, encryptKey) {
  const key = createHash("sha256").update(encryptKey).digest();
  const cipher = Buffer.from(encryptB64, "base64");
  const iv = cipher.subarray(0, 16);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(cipher.subarray(16)), decipher.final()]).toString("utf8");
}

// ---- 事件归一化（SPEC §4）----
export function normalizeFeishuEvent(parsed) {
  const header = (parsed && parsed.header) || {};
  const event = (parsed && parsed.event) || {};
  if (header.event_type !== "im.message.receive_v1") return null;
  const message = event.message;
  const sender = event.sender;
  if (!message || !sender) return null;
  if (message.message_type !== "text") return null; // M1 只处理纯文本
  let text = "";
  try {
    text = (JSON.parse(message.content || "{}").text || "").trim();
  } catch {
    return null;
  }
  if (!text) return null;
  const kind = message.chat_type === "group" ? "group" : "p2p";
  if (kind === "group") {
    // H-01（docs §5）：仅当 mentions 命中机器人（mentioned_type=app 或 id.app_id）才触发
    const mentions = message.mentions || [];
    const botHit = mentions.some((m) => m && (m.mentioned_type === "app" || (m.id && m.id.app_id)));
    if (!botHit) return null;
  }
  const memberId = (sender.sender_id && sender.sender_id.open_id) || "";
  if (!memberId) return null;
  return {
    channel: "feishu",
    eventId: String(header.event_id || ""),
    ts: Number(header.create_time || Date.now()),
    conv: {
      kind,
      id: message.chat_id,
      memberId,
      member: { id: memberId, name: undefined }, // H-02：M1 无联系人权限，名字为空，署名回退短 id
    },
    text,
    replyToMessageId: message.message_id,
    raw: parsed,
  };
}

/**
 * 构造飞书渠道适配器（长连接被动模式）。
 * @param {{ getConfig: () => ({appId:string,appSecret:string,encryptKey:string}),
 *           logger: object, onState: Function, onMessage: Function,
 *           base?: string, fetchImpl?: Function }} params
 * @returns adapter { id, title, implemented, status, start, stop, send, validate, verify, dispose }
 */
export function createFeishuAdapter({ getConfig, logger, onState = () => {}, onMessage = async () => {}, base = DEFAULT_BASE, fetchImpl = fetch }) {
  let state = "disconnected"; // disconnected | connecting | connected | reconnecting | failed
  let lastError = "";
  let ws = null;
  let generation = 0;
  let pingTimer = null;
  let reconnectTimer = null;
  let pingIntervalMs = 120000;
  let reconnectCount = -1;
  let reconnectIntervalMs = 120000;
  let reconnectNonceMs = 30000;
  let serviceId = 0;
  let disposed = false;
  // token 缓存按凭据键控（appId+\x00+appSecret），避免换 Secret 后命中旧缓存
  const tokenCache = new Map();
  let pongCount = 0; // 收到服务端 pong 的次数（status() 暴露，测试观测用）
  // 分片重组缓存：message_id -> { sum, parts, trace_id, createTime }
  const fragmentCache = new Map();
  let sweepTimer = null;

  const emitState = (s, info) => {
    state = s;
    if (info && info.error) lastError = String(info.error);
    else if (s === "connected") lastError = "";
    onState({ state: s, ...(info || {}) });
  };

  const cfg = () => getConfig() || {};

  // ---- token ----
  async function jsonFetch(path, opts) {
    const res = await fetchImpl(base + path, opts);
    const text = await res.text();
    let body = {};
    try {
      body = JSON.parse(text);
    } catch {
      body = { code: -1, msg: text.slice(0, 200) };
    }
    return { httpStatus: res.status, body };
  }

  async function ensureToken(appId, appSecret) {
    const now = Date.now();
    const cacheKey = appId + "\x00" + appSecret;
    const hit = tokenCache.get(cacheKey);
    if (hit && hit.expiresAt - 60_000 > now) return hit.token;
    const { body } = await jsonFetch(TOKEN_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const token = body.tenant_access_token;
    if (!token) throw new Error("tenant_access_token 获取失败: code=" + body.code + " msg=" + (body.msg || ""));
    tokenCache.set(cacheKey, { token, expiresAt: now + Number(body.expire || 7200) * 1000 });
    return token;
  }

  // ---- 端点发现 ----
  async function discoverEndpoint(appId, appSecret) {
    const { body } = await jsonFetch(ENDPOINT_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", locale: "zh", "User-Agent": BOT_AGENT },
      body: JSON.stringify({ AppID: appId, AppSecret: appSecret }),
    });
    if (body.code !== 0 || !body.data || !body.data.URL) {
      throw new Error("长连接端点获取失败: code=" + body.code + " msg=" + (body.msg || ""));
    }
    const cc = (body.data.ClientConfig || {});
    return {
      url: body.data.URL,
      clientConfig: cc,
      serviceId: Number(new URL(body.data.URL).searchParams.get("service_id") || 0),
    };
  }

  // ---- 帧收发 ----
  function sendFramePing() {
    if (!ws || ws.readyState !== 1) return;
    const frame = encodeFrame({ service: serviceId, method: 0, headers: [{ key: "type", value: "ping" }] });
    try {
      ws.send(frame);
    } catch (e) {
      if (logger) logger.warn("feishu ping send failed: " + String(e && e.message || e));
    }
  }

  function sendAck(orig, ok) {
    if (!ws || ws.readyState !== 1) return;
    const headers = (orig.headers || []).map((h) => ({ key: h.key, value: h.value }));
    headers.push({ key: "biz_rt", value: String(0) });
    const respPayload = ok ? { code: 200 } : { code: 500 };
    const frame = encodeFrame({
      service: orig.service,
      method: 1,
      headers,
      payload: Buffer.from(JSON.stringify(respPayload), "utf8"),
    });
    try {
      ws.send(frame);
    } catch (e) {
      if (logger) logger.warn("feishu ack send failed: " + String(e && e.message || e));
    }
  }

  function handleControl(data) {
    const type = (data.headers.find((h) => h.key === "type") || {}).value;
    if (type === "pong" && data.payload && data.payload.length) {
      pongCount += 1;
      try {
        const cc = JSON.parse(data.payload.toString("utf8"));
        pingIntervalMs = Number(cc.PingInterval) * 1000 || pingIntervalMs;
        reconnectCount = Number.isInteger(cc.ReconnectCount) ? cc.ReconnectCount : reconnectCount;
        reconnectIntervalMs = Number(cc.ReconnectInterval) * 1000 || reconnectIntervalMs;
        reconnectNonceMs = Number(cc.ReconnectNonce) * 1000 || reconnectNonceMs;
        if (logger) logger.info("feishu pong updated ws config: ping=" + pingIntervalMs + "ms");
      } catch {
        // 配置解析失败忽略
      }
    }
    // type=ping：官方 SDK 不回 pong，忽略即可
  }

  function handleEvent(data) {
    const headers = {};
    for (const h of data.headers || []) headers[h.key] = h.value;
    if (headers.type !== "event") return false;
    const messageId = headers.message_id || "";
    const payload = data.payload;
    if (!messageId || !payload) return false;
    const sum = Number(headers.sum || 1);
    const seq = Number(headers.seq || 0);
    let entry = fragmentCache.get(messageId);
    if (!entry) {
      entry = { sum, parts: [], createTime: Date.now(), traceId: headers.trace_id || "" };
      fragmentCache.set(messageId, entry);
    }
    entry.parts[seq] = payload;
    if (entry.parts.filter(Boolean).length < entry.sum) return true; // 未收齐
    fragmentCache.delete(messageId);
    const merged = Buffer.concat(entry.parts);
    let parsed = null;
    try {
      parsed = JSON.parse(merged.toString("utf8"));
      const encrypt = parsed && parsed.encrypt;
      const key = (cfg().encryptKey || "").trim();
      if (encrypt && key) parsed = JSON.parse(feishuDecrypt(encrypt, key));
      else if (encrypt) {
        if (logger) logger.warn("feishu encrypted event but feishuEncryptKey is not configured — dropped");
        sendAck(data, false);
        return true;
      }
    } catch (e) {
      if (logger) logger.error("feishu event parse failed: " + String(e && e.message || e));
      sendAck(data, false);
      return true;
    }
    processEvent(data, parsed);
    return true;
  }

  function processEvent(frame, parsed) {
    const normalized = normalizeFeishuEvent(parsed);
    if (!normalized) {
      sendAck(frame, true); // 非本适配器关注的事件（im 之外/非文本/未@机器人）也 ACK
      return;
    }
    sendAck(frame, true); // 先 ACK 防重推；去重由共享层负责
    Promise.resolve()
      .then(() => onMessage(normalized))
      .catch((e) => {
        if (logger) logger.error("feishu onMessage failed: " + String(e && e.message || e));
      });
  }

  function onFrame(buf) {
    let data = null;
    try {
      data = decodeFrame(buf);
    } catch (e) {
      if (logger) logger.error("feishu frame decode failed: " + String(e && e.message || e));
      return;
    }
    if (data.method === 0) handleControl(data);
    else if (data.method === 1) handleEvent(data);
  }

  // ---- 心跳 ----
  function startPingLoop() {
    clearTimeout(pingTimer);
    sendFramePing();
    pingTimer = setTimeout(startPingLoop, pingIntervalMs);
    if (pingTimer && pingTimer.unref) pingTimer.unref();
  }

  // ---- 重连 ----
  function scheduleReconnect() {
    if (disposed || generation === 0) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    emitState("reconnecting");
    const nonceDelay = reconnectNonceMs ? Math.floor(reconnectNonceMs * Math.random()) : 0;
    reconnectTimer = setTimeout(() => loopReconnect(0), nonceDelay);
    if (reconnectTimer && reconnectTimer.unref) reconnectTimer.unref();
  }

  async function loopReconnect(attempt) {
    if (disposed || generation === 0) return;
    try {
      await connectCycle();
    } catch (e) {
      attempt++;
      if (reconnectCount >= 0 && attempt >= reconnectCount) {
        emitState("failed", { error: "重连次数耗尽: " + String(e && e.message || e) });
        return;
      }
      reconnectTimer = setTimeout(() => loopReconnect(attempt), reconnectIntervalMs);
      if (reconnectTimer && reconnectTimer.unref) reconnectTimer.unref();
    }
  }

  // ---- 连接循环 ----
  async function connectCycle() {
    const appId = String(cfg().appId || "").trim();
    const appSecret = String(cfg().appSecret || "").trim();
    if (!appId || !appSecret) throw new Error("飞书凭据未配置（feishuAppId/feishuAppSecret）");
    emitState("connecting");
    const { url, serviceId: sid } = await discoverEndpoint(appId, appSecret);
    serviceId = sid;
    await connectWs(url);
    return true;
  }

  function connectWs(url) {
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
      const instance = wsConnect(url, { handshakeTimeoutMs: 15000 });
      ws = instance;
      instance.on("error", (e) => {
        if (logger) logger.warn("feishu ws error: " + String(e && e.message || e));
        if (opened) scheduleReconnectSafe();
        else fail(e); // 首连失败：由上层 retry 路径负责，close 事件不再触发
      });
      instance.on("message", (buf) => {
        if (myGen !== generation) return;
        onFrame(Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), "utf8"));
      });
      instance.on("open", () => {
        if (myGen !== generation) return;
        if (settled) return;
        settled = true;
        opened = true;
        emitState("connected");
        startPingLoop();
        resolve(true);
      });
      instance.on("close", () => {
        if (myGen !== generation) return;
        if (opened) {
          scheduleReconnectSafe(); // 已建立后的断线：统一走重连
          return;
        }
        if (!settled) fail(new Error("飞书长连接关闭（握手未完成）"));
        // 已 fail 过（error 已 reject）：忽略
      });
    });
  }

  function scheduleReconnectSafe() {
    if (disposed || generation === 0) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    scheduleReconnect();
  }

  // ---- 分片缓存清理（10s，与 SDK DataCache 一致）----
  function startSweep() {
    clearInterval(sweepTimer);
    sweepTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of fragmentCache) {
        if (now - entry.createTime > 10000) fragmentCache.delete(key);
      }
    }, 10000);
    if (sweepTimer && sweepTimer.unref) sweepTimer.unref();
  }

  // ---- 发送（回复优先，其次按 conv 类型选 receive_id_type）----
  async function send(conv, text, opts = {}) {
    const c = cfg();
    if (!String(c.appId || "").trim() || !String(c.appSecret || "").trim()) {
      return { ok: false, detail: "飞书凭据未配置" };
    }
    const content = JSON.stringify({ text: String(text) });
    const body = { msg_type: "text", content };
    let path;
    if (opts.replyTo) {
      path = "/open-apis/im/v1/messages/" + encodeURIComponent(String(opts.replyTo)) + "/reply";
    } else {
      const receiveIdType = conv && conv.kind === "group" ? "chat_id" : "open_id";
      body.receive_id = conv && conv.id ? conv.id : "";
      path = MSG_PATH + "?receive_id_type=" + receiveIdType;
    }
    const doSend = async (token) => {
      return jsonFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(body),
      });
    };
    let r = await doSend(await ensureToken(c.appId, c.appSecret));
    if (r.body && TOKEN_INVALID_CODES.has(Number(r.body.code))) {
      tokenCache.delete(c.appId + "\x00" + c.appSecret);
      r = await doSend(await ensureToken(c.appId, c.appSecret));
    }
    if (r.body && Number(r.body.code) === 0) {
      return { ok: true, detail: (r.body.data && r.body.data.message_id) || "sent" };
    }
    return { ok: false, detail: "code=" + (r.body && r.body.code) + " msg=" + ((r.body && r.body.msg) || "") };
  }

  // ---- 适配器接口 ----
  const status = () => {
    const c = cfg();
    return { state, appId: String(c.appId || "").trim(), lastError: lastError || undefined, pongCount };
  };
  return {
    id: "feishu",
    title: "飞书",
    implemented: true,
    status,
    async start() {
      if (disposed) disposed = false;
      generation++;
      startSweep();
      const myGen = generation;
      try {
        await connectCycle();
      } catch (e) {
        if (myGen === generation) {
          if (logger) logger.error("feishu start failed: " + String(e && e.message || e));
          emitState("failed", { error: String(e && e.message || e) });
          throw e;
        }
      }
    },
    async stop() {
      generation++;
      clearTimeout(pingTimer);
      clearTimeout(reconnectTimer);
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
      if (!appId || !appSecret) return { ok: false, detail: "缺少 feishuAppId/feishuAppSecret" };
      try {
        await ensureToken(appId, appSecret);
        return { ok: true, detail: "凭据有效：tenant_access_token 获取成功" };
      } catch (e) {
        return { ok: false, detail: String(e && e.message || e) };
      }
    },
    verify() {
      return { ok: false, status: { error: "飞书长连接模式无需配对码" } };
    },
    async send(conv, text, opts = {}) {
      return send(conv, text, opts);
    },
    dispose() {
      disposed = true;
      generation++;
      clearTimeout(pingTimer);
      clearTimeout(reconnectTimer);
      clearInterval(sweepTimer);
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