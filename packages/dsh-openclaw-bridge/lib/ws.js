// @deepseek-ai/dsh-openclaw-bridge/lib/ws.js
// 自研最小 WebSocket 客户端（RFC 6455）：用 node:net/node:tls/node:crypto 实现，
// 规避 Node ≥22 内置 WebSocket 的全局对象差异与平台依赖（SPEC §6/§7「vendored WS」）。
// 仅实现客户端需要的子集：文本/二进制收发、分片重组、ping/pong、close 握手；
// 不做 per-message-deflate（服务端若强制压缩，握手时通过 Sec-WebSocket-Extensions 协商关闭）。
//
// 用法：
//   const ws = connect("wss://host/path", { headers: { Authorization: "..." } });
//   ws.on("open", () => ws.send("hello"));
//   ws.on("message", (data) => { /* data: string（文本帧）或 Buffer（二进制帧） */ });
//   ws.close(1000, "bye");
import { EventEmitter } from "node:events";
import { createHash, randomBytes } from "node:crypto";
import net from "node:net";
import tls from "node:tls";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const OP_TEXT = 0x1;
const OP_BINARY = 0x2;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;
const OP_CONT = 0x0;

export const CONNECTING = 0;
export const OPEN = 1;
export const CLOSING = 2;
export const CLOSED = 3;

function acceptKey(key) {
  return createHash("sha1").update(key + GUID).digest("base64");
}

/**
 * 连接一个 WebSocket 服务。
 * @param {string} url  ws:// 或 wss://
 * @param {{ headers?: object, protocols?: string[], handshakeTimeoutMs?: number }} opts
 * @returns {EventEmitter & { send: Function, ping: Function, close: Function, readyState: number }}
 */
export function connect(url, opts = {}) {
  const parsed = new URL(url);
  const isTls = parsed.protocol === "wss:";
  if (!isTls && parsed.protocol !== "ws:") throw new Error("unsupported WebSocket protocol: " + parsed.protocol);
  const port = parsed.port ? Number(parsed.port) : isTls ? 443 : 80;
  const host = parsed.hostname;
  const path = (parsed.pathname || "/") + (parsed.search || "");

  const em = new EventEmitter();
  let readyState = CONNECTING;
  let disposed = false;
  let userClosed = false;
  let buffer = Buffer.alloc(0);
  let pendingMessage = null; // { opcode, chunks: Buffer[] }

  const accepts = (opts.protocols && opts.protocols.length ? "Sec-WebSocket-Protocol: " + opts.protocols.join(", ") + "\r\n" : "");
  const key = randomBytes(16).toString("base64");
  const headers = opts.headers || {};

  const socket = isTls
    ? tls.connect({ host, port, servername: host })
    : net.connect(port, host);

  const headerText =
    "GET " + path + " HTTP/1.1\r\n" +
    "Host: " + host + ":" + port + "\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    "Sec-WebSocket-Key: " + key + "\r\n" +
    "Sec-WebSocket-Version: 13\r\n" +
    accepts +
    Object.entries(headers)
      .map(([k, v]) => k + ": " + v + "\r\n")
      .join("") +
    "\r\n";

  // 立刻发送握手请求（连接建立前 write 由 Node 缓冲，连接后自动发出）
  socket.write(headerText);

  let handshakeDone = false;
  let handshakeBuf = "";

  const fail = (err) => {
    if (readyState === CLOSED) return;
    readyState = CLOSED;
    em.emit("error", err);
    em.emit("close", 1006, String(err && err.message || "handshake failed"));
  };

  const handshakeTimeout = setTimeout(() => {
    if (!handshakeDone) fail(new Error("WebSocket handshake timeout"));
  }, opts.handshakeTimeoutMs || 15000);

  socket.on("error", (err) => {
    if (!handshakeDone) {
      clearTimeout(handshakeTimeout);
      fail(err);
    } else {
      em.emit("error", err);
    }
  });
  socket.on("end", () => {
    if (!userClosed && readyState === OPEN) em.emit("close", 1006, "connection ended");
    readyState = CLOSED;
    disposed = true;
  });
  socket.on("close", () => {
    clearTimeout(handshakeTimeout);
    if (!userClosed && readyState !== CLOSED) em.emit("close", 1006, "connection closed");
    readyState = CLOSED;
    disposed = true;
  });

  socket.on("data", (chunk) => {
    if (!handshakeDone) {
      handshakeBuf += chunk.toString("latin1");
      const idx = handshakeBuf.indexOf("\r\n\r\n");
      if (idx === -1) {
        if (handshakeBuf.length > 65536) fail(new Error("WebSocket handshake too large"));
        return;
      }
      const head = handshakeBuf.slice(0, idx);
      // 保留 \r\n\r\n 之后的字节：同一 TCP 段可能已带有握手后第一帧（如 QQ 网关的 HELLO）
      const tail = handshakeBuf.slice(idx + 4);
      handshakeBuf = "";
      const lines = head.split("\r\n");
      const status = (lines[0] || "").split(" ")[1] || "";
      if (status !== "101") {
        fail(new Error("WebSocket upgrade rejected: HTTP " + status + " (" + lines[0] + ")"));
        return;
      }
      const respHeaders = {};
      for (const line of lines.slice(1)) {
        const ci = line.indexOf(":");
        if (ci > 0) respHeaders[line.slice(0, ci).trim().toLowerCase()] = line.slice(ci + 1).trim();
      }
      if (!respHeaders["sec-websocket-accept"] || respHeaders["sec-websocket-accept"] !== acceptKey(key)) {
        fail(new Error("WebSocket accept key mismatch"));
        return;
      }
      handshakeDone = true;
      clearTimeout(handshakeTimeout);
      readyState = OPEN;
      em.emit("open");
      // 余下字节可能是握手后第一帧
      const restBuf = Buffer.from(tail, "latin1");
      buffer = restBuf;
      parseFrames();
      return;
    }
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
    parseFrames();
  });

  function parseFrames() {
    for (;;) {
      if (buffer.length < 2) return;
      const b0 = buffer[0];
      const b1 = buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buffer.length < 4) return;
        len = buffer.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buffer.length < 10) return;
        const high = buffer.readUInt32BE(2);
        const low = buffer.readUInt32BE(6);
        len = high * 0x100000000 + low;
        off = 10;
      }
      let maskKey = null;
      if (masked) {
        if (buffer.length < off + 4) return;
        maskKey = buffer.subarray(off, off + 4);
        off += 4;
      }
      if (len > 64 * 1024 * 1024) {
        fail(new Error("WebSocket frame too large: " + len));
        return;
      }
      if (buffer.length < off + len) return;
      let payload = buffer.subarray(off, off + len);
      buffer = buffer.subarray(off + len);
      if (maskKey) {
        const out = Buffer.allocUnsafe(payload.length);
        for (let i = 0; i < payload.length; i++) out[i] = payload[i] ^ maskKey[i & 3];
        payload = out;
      }
      handleFrame(fin, opcode, payload);
      if (disposed) return;
    }
  }

  function handleFrame(fin, opcode, payload) {
    switch (opcode) {
      case OP_TEXT:
      case OP_BINARY: {
        if (!fin) {
          pendingMessage = { opcode, chunks: [payload] };
          return;
        }
        emitMessage(opcode, payload);
        return;
      }
      case OP_CONT: {
        if (!pendingMessage) return; // 非法 continuation，忽略
        pendingMessage.chunks.push(payload);
        if (fin) {
          const op = pendingMessage.opcode;
          const data = Buffer.concat(pendingMessage.chunks);
          pendingMessage = null;
          emitMessage(op, data);
        }
        return;
      }
      case OP_PING:
        sendFrame(OP_PONG, payload);
        em.emit("ping", payload);
        return;
      case OP_PONG:
        return;
      case OP_CLOSE: {
        let code = 1005;
        let reason = "";
        if (payload.length >= 2) {
          code = payload.readUInt16BE(0);
          reason = payload.subarray(2).toString("utf8");
        }
        if (!userClosed) {
          sendFrame(OP_CLOSE, Buffer.from([0x03, 0xe8])); // echo 1000
        }
        readyState = CLOSED;
        disposed = true;
        userClosed = true;
        socket.end();
        em.emit("close", code, reason);
        return;
      }
      default:
        // 未知 opcode 忽略
        return;
    }
  }

  function emitMessage(opcode, data) {
    if (opcode === OP_TEXT) em.emit("message", data.toString("utf8"));
    else em.emit("message", data);
  }

  function sendFrame(opcode, payload, fin = true) {
    if (disposed || readyState !== OPEN) throw new Error("WebSocket is not open");
    const mask = randomBytes(4);
    let len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(6);
      header[1] = 0x80 | len;
    } else if (len < 65536) {
      header = Buffer.alloc(8);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(14);
      header[1] = 0x80 | 127;
      header.writeUInt32BE(Math.floor(len / 0x100000000), 2);
      header.writeUInt32BE(len >>> 0, 6);
    }
    header[0] = (fin ? 0x80 : 0) | (opcode & 0x0f);
    header.set(mask, header.length - 4);
    const maskedPayload = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) maskedPayload[i] = payload[i] ^ mask[i & 3];
    socket.write(Buffer.concat([header, maskedPayload]));
  }

  function encodePayload(data) {
    if (typeof data === "string") return { opcode: OP_TEXT, buf: Buffer.from(data, "utf8") };
    if (Buffer.isBuffer(data)) return { opcode: OP_BINARY, buf: data };
    if (data instanceof ArrayBuffer) return { opcode: OP_BINARY, buf: Buffer.from(data) };
    throw new Error("unsupported send data type");
  }

  em.send = (data) => {
    const { opcode, buf } = encodePayload(data);
    sendFrame(opcode, buf);
  };
  em.ping = (data) => {
    sendFrame(OP_PING, typeof data === "string" ? Buffer.from(data) : data || Buffer.alloc(0));
  };
  em.close = (code = 1000, reason = "") => {
    if (readyState !== OPEN) return;
    userClosed = true;
    const reasonBuf = Buffer.from(String(reason), "utf8");
    const payload = Buffer.alloc(2 + reasonBuf.length);
    payload.writeUInt16BE(code, 0);
    reasonBuf.copy(payload, 2);
    try {
      sendFrame(OP_CLOSE, payload);
    } catch {
      // 已关闭则直接断开
    }
    readyState = CLOSING;
    socket.end();
  };
  Object.defineProperty(em, "readyState", { get: () => readyState });
  em.destroy = () => {
    if (!disposed) {
      disposed = true;
      userClosed = true;
      socket.destroy();
    }
  };
  return em;
}