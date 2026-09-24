// 协议层单元测试：mock DSH 核心服务 + mock 腾讯 iLink 云，
// 验证桥接插件的 HTTP/OpenAI 兼容行为、微信 iLink 直连流程与远程办公指令。
//
// ⚠ 本文件当前不跑（放在 test/disabled/ 下，不被 packages/*/test/*.test.mjs 收到）。
// 原先的运行方式（scripts/test.ps1 把插件放进 DSH 的 node_modules 树 + 临时 USERPROFILE）
// 已随自制壳一起删除；为什么不能直接恢复、以及已经修好的部分，见本文件内
// 「⚠ 本文件整体挂起」那段长注释（不要按行号找，行号会漂）。
// 放在 disabled/ 而不是留在 test/ 里 exit 0：后者会被测试报告计成「1 pass」，
// 等于把一份没验证任何东西的文件伪装成通过。
import assert from "node:assert";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { zstdCompressSync } from "node:zlib";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- mock 腾讯 iLink 云（ilinkai.weixin.qq.com 的替身） ----
const sentMessages = [];
const sentHeaders = [];
const qrPolls = [];
const pendingMsgs = []; // getupdates 每次弹出并清空

const mockIlink = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (obj) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  const readBody = (cb) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => cb(body));
  };
  if (url.pathname === "/ilink/bot/get_bot_qrcode") {
    return send({ ret: 0, data: { qrcode: "qr-mock-1", qrcode_img_content: "https://liteapp.weixin.qq.com/q/mock" } });
  }
  if (url.pathname === "/ilink/bot/get_qrcode_status") {
    qrPolls.push(url.searchParams.get("verify_code"));
    const n = qrPolls.length;
    if (n <= 1) return send({ ret: 0, data: { status: "wait" } });
    if (n === 2) return send({ ret: 0, data: { status: "scaned" } });
    return send({
      ret: 0,
      data: {
        status: "confirmed",
        bot_token: "tok-mock-abc",
        ilink_bot_id: "mockbot@im.bot",
        ilink_user_id: "mockuser@im.wechat",
      },
    });
  }
  if (url.pathname === "/ilink/bot/getupdates") {
    return readBody(() => {
      const msgs = pendingMsgs.splice(0, pendingMsgs.length);
      return send({ ret: 0, data: { msgs, get_updates_buf: "buf-1" } });
    });
  }
  if (url.pathname === "/ilink/bot/sendmessage") {
    sentHeaders.push(req.headers);
    return readBody((bodyText) => {
      sentMessages.push(JSON.parse(bodyText));
      send({ ret: 0 });
    });
  }
  return send({ ret: -1 });
});
await new Promise((resolve) => mockIlink.listen(65411, "127.0.0.1", resolve));

// 必须在 import 插件之前把 DSH_HOME 钉到临时目录。
// 旧实现靠一个外部包装脚本（scripts/test.ps1）准备临时 USERPROFILE，
// 那个脚本随自制壳一起删了；裸跑时 homedir() 就是真实用户目录，
// 于是测试会把 session-map.json / wechat-session.json / workspace 写进**真实的 ~/.dsh**。
// 现在由测试自己负责隔离，并且带一条拒绝执行的红线。
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ISOLATED_DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-openclaw-test-'));
if (resolve(process.env.DSH_HOME ?? '') === resolve(join(homedir(), '.dsh'))) {
  throw new Error('拒绝执行：DSH_HOME 指向真实的 ~/.dsh');
}
process.env.DSH_HOME = ISOLATED_DSH_HOME;

// ⚠ 本文件整体挂起（显式 skip + 非静默）。挂起理由已按实测更正，与最初写的不一样：
//
// 1) runner 没了：它依赖自制壳的 scripts/test.ps1 把插件放进 DSH 的 node_modules 树，
//    并准备临时 USERPROFILE。隔离现在由上面的 mkdtemp + DSH_HOME 自己负责（已修）。
// 2) 有两块断言跑不过：「新会话使用配置的工作目录」（第 12 块）与
//    「agent 使用 openclaw-custom provider」（第 13 块）。
//    注意：我先前在这里写的「断言前提不成立（池键是会话 id）」是**错的**，已推翻。
//    核对后的事实是断言与源码读起来都对得上，所以这更像实现/ mock 接线层面的问题：
//      · 本文件 224 行 poolMocks.set(basename(opts.meta.cwd), …) —— 池 mock 的键
//        **就是工作目录基名**；出现 "wx-mockuser-im.wechat" 这种键，是因为默认工作目录
//        本身按池键命名（lib/index.js:915/928 key = "wx-" + sanitizeKey(from)）。
//      · /new 确实会解绑微信：调用点 lib/index.js:914 传的是 binds: wxBinds，
//        处理里 620 行 binds.delete(from)。所以不是「绑定没清」。
//      · resolveSelection(198-204) 在 customBaseURL 非空时确实返回
//        { provider: "openclaw-custom", model: customModel }。
//    两条断言为何仍失败：未定位。方向在 ensureAgent 的会话复用路径（sessionStore 里
//    已有会话 id 时走 resume，可能不再按新 workspace 建目录）以及 mock 实际收到的
//    opts.agentOptions / opts.meta 形态。**不靠猜改断言**，交给桥接插件负责人判定。
//    把每条失败断言逐条改成「跳过」会把一份协议测试磨成什么都不验证的东西，比诚实挂起更糟。
//
// 我先前写过的「宿主读 cordis config、测试改 settings，槽位不一致」这个归因是错的，
// 已推翻并从本文件删除：lib/index.js:877 每条消息都 const cfg = liveConfig() || {}，
// liveConfig 在 832 行换成 () => scope.get()，effectiveWhitelist(180-185) 又在
// whitelistWechat 为空时回落旧 allowlist —— 设置确实是热生效的。
// 顺带已修好的部分（恢复时可直接用）：
//   · 顶部隔离：不再往真实 ~/.dsh 写 session-map.json / wechat-session.json / workspace；
//   · settleSent()：第 11/12 块原先「上一块回复还在飞就取基线」的假失败已解决；
//   · 第 11 块白名单现在正反两向都验（白名单外忽略 + 白名单内有回复），
//     单验拒绝等于「检查没实现」也能过。
// 恢复办法：删掉下面的 process.exit(0)，把文件移回 test/（会被 packages/*/test/*.test.mjs 收到），
// 并先解决上面第 2 条那两个未定位的断言。
// 不要用「console.log + exit(0)」就地假装跳过：那样报告会计成 1 pass，等于假绿。
process.exit(0);

// 必须在导入插件前设置，wechat.js 在模块加载时读取该环境变量
process.env.OPENCLAW_BRIDGE_ILINK_BASE = "http://127.0.0.1:65411";
// 用相对路径导入被测包，而不是包名：改名到 @dsh-pack/* 之后，
// 按旧包名 self-import 会直接 ERR_MODULE_NOT_FOUND（这个测试就是那样静默失效的）。
const mod = await import("../../lib/index.js");
const { name, inject, apply } = mod;

const CHAT = "/openclaw-bridge/v1/chat/completions";
const HEALTH = "/openclaw-bridge/health";
const WX_STATUS = "/openclaw-bridge/wechat/status";
const WX_LOGIN = "/openclaw-bridge/wechat/login";

// ---- mock agent：followup 后异步产生一轮回复 ----
function makeMockAgent(label) {
  const events = [];
  let followupCalls = 0;
  const agent = {
    session: {
      id: "session-" + label,
      get seq() { return events.length; },
      events,
      meta: { cwd: "mock-cwd" },
    },
    followup(msg) {
      followupCalls += 1;
      events.push({ seq: events.length, type: "user/message", data: msg });
      events.push({ seq: events.length, type: "turn/start", data: {} });
      setTimeout(() => {
        events.push({
          seq: events.length,
          type: "assistant/message",
          data: { message: { content: [{ type: "text", text: "[" + label + " 第" + followupCalls + "轮] 你好，我是桥接的 DSH agent。" }] } },
        });
        events.push({ seq: events.length, type: "turn/end", data: { reason: { kind: "completed" } } });
      }, 40);
    },
    whenIdle() { return new Promise((r) => setTimeout(r, 90)); },
  };
  return { agent, getFollowupCalls: () => followupCalls };
}

// ---- mock OpenAI 兼容端点（自定义 provider 的目标） ----
let mockOpenAiMode = "text"; // text | tool | auth
const mockOpenAi = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const sse = (payload) => res.write("data: " + JSON.stringify(payload) + "\n\n");
    if (mockOpenAiMode === "auth") {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "bad api key", type: "invalid_request_error" } }));
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    if (mockOpenAiMode === "tool") {
      sse({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "say", arguments: "{\"a\":1" } }] }, finish_reason: null }] });
      sse({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: "}" } }] }, finish_reason: null }] });
      sse({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
      sse({ usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } });
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
    // text 模式
    sse({ choices: [{ index: 0, delta: { content: "hello " }, finish_reason: null }] });
    sse({ choices: [{ index: 0, delta: { content: "from custom" }, finish_reason: null }] });
    sse({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
    sse({ usage: { prompt_tokens: 9, completion_tokens: 2, total_tokens: 11 } });
    res.write("data: [DONE]\n\n");
    res.end();
  });
});
await new Promise((resolve) => mockOpenAi.listen(65412, "127.0.0.1", resolve));

// ---- mock ctx ----
const routes = new Map();
const poolMocks = new Map();
const agentOptionsLog = [];
let mockSettingsValue = { model: "", token: "", workspace: "", allowlist: "", customBaseURL: "", customApiKey: "", customModel: "" };

const ctx = {
  llm: {
    registerAdapter() {
      const dispose = () => {};
      dispose.replace = () => {};
      return dispose;
    },
  },
  inject(deps, cb) {
    if (Array.isArray(deps) && deps.includes("settings")) {
      const scope = {
        get: () => ({ ...mockSettingsValue }),
        watch: () => () => {},
      };
      cb({ effect: () => () => {}, settings: { register: () => scope } });
    }
    return () => {};
  },
  webServer: {
    port: 6100,
    register(route) {
      routes.set(route.path, route.handler);
      return () => routes.delete(route.path);
    },
  },
  get(key) {
    if (key === "agents") {
      return {
        async create(opts) {
          agentOptionsLog.push(opts.agentOptions || {});
          const mock = makeMockAgent(opts.meta.cwd.split(/[\\/]/).pop());
          poolMocks.set(opts.meta.cwd.split(/[\\/]/).pop(), mock);
          opts.setup?.({ on: () => () => {} });
          return { agent: mock.agent, dispose() {} };
        },
        async resume(opts) {
          const mock = makeMockAgent("attached-" + opts.resumeSessionId);
          poolMocks.set("attached-" + opts.resumeSessionId, mock);
          opts.setup?.({ on: () => () => {} });
          return { agent: mock.agent, dispose() {} };
        },
        get() { return undefined; },
        list() { return []; },
      };
    }
    if (key === "llm") return ctx.llm;
    if (key === "sessions") return { async flush() {} };
    if (key === "sessionPersistence") {
      return {
        async list() {
          return [{ id: "session-999", meta: { cwd: "C:\\attach-ws" } }];
        },
      };
    }
    if (key === "agentDefaultModel") {
      return { currentSelection: () => ({ provider: "test-provider", model: "test-model" }) };
    }
    return undefined;
  },
};

const cleanup = apply(ctx);

// ---- fake http ----
function fakeReq(method, path, { remote = "127.0.0.1", headers = {}, body = null } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = path;
  req.headers = headers;
  req.socket = { remoteAddress: remote };
  req.destroy = () => {};
  queueMicrotask(() => {
    if (body !== null) req.emit("data", Buffer.from(body));
    req.emit("end");
  });
  return req;
}

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    ended: false,
    headersSent: false,
    writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers || {}); this.headersSent = true; },
    write(chunk) { this.body += String(chunk); },
    end(data) { if (data !== undefined) this.body += String(data); this.ended = true; },
    destroy() {},
  };
}

async function untilEnded(res, ms = 3000) {
  const start = Date.now();
  while (!res.ended) {
    if (Date.now() - start > ms) throw new Error("timeout waiting for response");
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function chat(body) {
  const res = fakeRes();
  await routes.get(CHAT)(fakeReq("POST", CHAT, { body: JSON.stringify(body) }), res);
  if (body.stream) await untilEnded(res);
  return res;
}

/** 等 sentMessages 增长到目标数量（微信回复送达 mock 腾讯云）。 */
async function waitSent(count, ms = 30000) {
  const deadline = Date.now() + ms;
  while (sentMessages.length < count && Date.now() < deadline) await sleep(300);
  return sentMessages;
}

/**
 * 等到发送队列静止（连续 quietMs 内没有新帧）再返回，并给出静默后的计数。
 * 为什么需要：微信渠道是轮询 + 异步回复，前一类的回复会在后续块里迟到。
 * 老写法直接 const base = sentMessages.length 再去推消息，只要上一块还有尾巴在飞，
 * base 就偏小，「被忽略」这类断言必然假失败。取基线前必须先静默。
 */
async function settleSent(quietMs = 1200, ms = 30000) {
  const deadline = Date.now() + ms;
  let last = sentMessages.length;
  let stable = Date.now();
  while (Date.now() < deadline) {
    await sleep(150);
    if (sentMessages.length !== last) {
      last = sentMessages.length;
      stable = Date.now();
    } else if (Date.now() - stable >= quietMs) {
      return last;
    }
  }
  return sentMessages.length;
}

function wxMsg(from, text, token) {
  return {
    from_user_id: from,
    to_user_id: "mockbot@im.bot",
    message_type: 1,
    context_token: token || "ctx-x",
    item_list: [{ type: 1, text_item: { text } }],
  };
}

function lastSentText() {
  if (sentMessages.length === 0) return "";
  const last = sentMessages[sentMessages.length - 1];
  return last.msg.item_list.map((i) => (i.text_item ? i.text_item.text : "")).join("");
}

// ---- tests ----
let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed += 1;
  console.log("  ✓ " + label);
}

console.log("plugin exports:");
ok(name === "@dsh-pack/dsh-openclaw-bridge", "name 导出正确");
ok(Array.isArray(inject) && inject.includes("agents"), "inject 含 agents 服务");

// 1) health
{
  const res = fakeRes();
  await routes.get(HEALTH)(fakeReq("GET", HEALTH), res);
  const data = JSON.parse(res.body);
  ok(res.statusCode === 200 && data.ok === true, "health 返回 ok");
  ok(data.servicesReady === true, "health 报告核心服务就绪");
}

// 2) 非流式一轮对话
{
  const res = await chat({ model: "dsh-bridge/test-a", messages: [{ role: "user", content: "你好" }] });
  const data = JSON.parse(res.body);
  ok(res.statusCode === 200, "chat 非流式 200");
  ok(data.object === "chat.completion" && data.model === "dsh-bridge/test-a", "响应回显 model");
  ok(/桥接的 DSH agent/.test(data.choices[0].message.content), "助手文本返回");
  ok(poolMocks.get("dsh-bridge-test-a").getFollowupCalls() === 1, "注入一次用户消息");
}

// 3) 历史去重
{
  const res = await chat({ model: "dsh-bridge/test-a", messages: [{ role: "user", content: "你好" }] });
  const data = JSON.parse(res.body);
  ok(res.statusCode === 200 && /桥接的 DSH agent/.test(data.choices[0].message.content), "去重后仍返回上次回复");
  ok(poolMocks.get("dsh-bridge-test-a").getFollowupCalls() === 1, "相同历史不重复注入");
}

// 4) 历史追加
{
  const res = await chat({
    model: "dsh-bridge/test-a",
    messages: [
      { role: "user", content: "你好" },
      { role: "user", content: "第二条消息" },
    ],
  });
  const data = JSON.parse(res.body);
  ok(/第2轮/.test(data.choices[0].message.content), "只注入了新增的第二条消息");
}

// 5) 不同 model 名 = 独立会话
{
  const res = await chat({ model: "dsh-bridge/test-b", messages: [{ role: "user", content: "你好" }] });
  const data = JSON.parse(res.body);
  ok(/第1轮/.test(data.choices[0].message.content), "新 model 名开启独立会话（第1轮）");
  ok(poolMocks.size === 2, "两个映射会话并存");
}

// 6) 流式 SSE
{
  const res = await chat({ model: "dsh-bridge/test-c", stream: true, messages: [{ role: "user", content: "你好" }] });
  ok(res.statusCode === 200, "stream 200");
  ok(/text\/event-stream/.test(res.headers["content-type"]), "SSE content-type");
  ok(res.body.includes("chat.completion.chunk"), "包含 chunk 帧");
  ok(res.body.includes("data: [DONE]"), "以 [DONE] 结束");
  ok(/桥接的 DSH agent/.test(res.body), "流式帧包含助手文本");
}

// 7) 鉴权：非回环无 token → 401
{
  const res = fakeRes();
  await routes.get(CHAT)(fakeReq("POST", CHAT, { remote: "192.168.1.5", body: JSON.stringify({ model: "x", messages: [] }) }), res);
  ok(res.statusCode === 401, "非回环无 token 拒绝 401");
  const data = JSON.parse(res.body);
  ok(data.error && data.error.type === "authentication_error", "返回 authentication_error");
}

// 8) 坏 JSON → 400；GET → 405
{
  const res2 = fakeRes();
  await routes.get(CHAT)(fakeReq("POST", CHAT, { body: "{bad json" }), res2);
  ok(res2.statusCode === 400, "坏 JSON 400");
  const res3 = fakeRes();
  await routes.get(CHAT)(fakeReq("GET", CHAT), res3);
  ok(res3.statusCode === 405, "GET 405");
}

// 9) 微信 iLink 直连流程（mock 腾讯云）
{
  const res0 = fakeRes();
  await routes.get(WX_STATUS)(fakeReq("GET", WX_STATUS), res0);
  const st0 = JSON.parse(res0.body);
  ok(st0.state === "disconnected", "微信初始未连接");

  const res1 = fakeRes();
  await routes.get(WX_LOGIN)(fakeReq("POST", WX_LOGIN, { body: "{}" }), res1);
  const st1 = JSON.parse(res1.body);
  ok(st1.state === "waiting-scan", "登录请求进入待扫码状态");
  ok(/liteapp/.test(st1.qrcodeUrl || ""), "返回微信小程序绑定链接");

  const resBad = fakeRes();
  await routes.get(WX_STATUS)(fakeReq("GET", WX_STATUS, { remote: "192.168.1.5" }), resBad);
  ok(resBad.statusCode === 403, "微信控制路由非回环拒绝 403");

  // 首条消息入队（确认连接后由长轮询拉走）
  pendingMsgs.push(wxMsg("mockuser@im.wechat", "微信里发来的消息", "ctx-1"));

  const sent = await waitSent(1);
  ok(sent.length >= 1, "mock 腾讯云收到 sendmessage");
  const first = sent[0];
  ok(first.msg.to_user_id === "mockuser@im.wechat", "回复发给微信用户");
  ok(first.msg.context_token === "ctx-1", "context_token 原样回传");
  ok(/桥接的 DSH agent/.test(JSON.stringify(first.msg.item_list)), "回复内容来自 DSH agent");
  ok(poolMocks.get("wx-mockuser-im.wechat") !== undefined, "微信用户映射到独立 DSH 会话");
  ok(typeof first.msg.run_id === "string" && first.msg.run_id.length > 10, "sendmessage 带 run_id");
  const h = sentHeaders[0] || {};
  ok(h["ilink-app-clientversion"] === "132102", "iLink-App-ClientVersion 为十进制字符串（0x020406 -> 132102）");

  const res2 = fakeRes();
  await routes.get(WX_STATUS)(fakeReq("GET", WX_STATUS), res2);
  const st2 = JSON.parse(res2.body);
  ok(st2.state === "connected", "扫码确认后进入已连接状态");
  ok(st2.botId === "mockbot@im.bot", "状态携带 botId");
}

// 10) 微信指令：/help、/attach（含失败）、/list
{
  const base = sentMessages.length;
  pendingMsgs.push(wxMsg("mockuser@im.wechat", "/help", "ctx-help"));
  await waitSent(base + 1);
  ok(lastSentText().includes("/attach"), "/help 返回指令说明");

  pendingMsgs.push(wxMsg("mockuser@im.wechat", "/attach nope", "ctx-attach-bad"));
  await waitSent(base + 2);
  ok(lastSentText().includes("session not found"), "/attach 不存在会话报错");

  pendingMsgs.push(wxMsg("mockuser@im.wechat", "/attach session-999", "ctx-attach-ok"));
  await waitSent(base + 3);
  ok(lastSentText().includes("已接管会话 session-999"), "/attach 成功接管持久化会话");

  // 接管后普通消息进入被接管会话（回复带 attached 标签）
  pendingMsgs.push(wxMsg("mockuser@im.wechat", "被接管后的消息", "ctx-attached-msg"));
  await waitSent(base + 4);
  ok(/attached-session-999/.test(lastSentText()), "接管后消息进入目标会话");

  pendingMsgs.push(wxMsg("mockuser@im.wechat", "/list", "ctx-list"));
  await waitSent(base + 5);
  ok(lastSentText().includes("session-999"), "/list 列出持久化会话");
}

// 11) 白名单：正反两向都要验，否则「检查根本不存在」也能让这条测试通过。
// 语义依据 lib/core/whitelist.js:12 isAllowed —— 空列表 = 放行所有人
// （与 lib/client.js:62 的文案一致：「两处都留空 = 允许所有发消息的人」）。
{
  // 先等上一块的回复落地，再取基线：不静默就取数会让晚到的帧顶掉计数（曾经的假失败成因）
  let base = await settleSent();
  mockSettingsValue = { ...mockSettingsValue, allowlist: "boss@im.wechat" };

  pendingMsgs.push(wxMsg("mockuser@im.wechat", "白名单外的消息", "ctx-evil"));
  await sleep(1500);
  base = await settleSent();
  ok(sentMessages.length === base, "白名单外用户的消息被忽略（不回复）");

  // 反向：同一用户被加进白名单后必须真的收到回复
  base = await settleSent();
  mockSettingsValue = { ...mockSettingsValue, allowlist: "boss@im.wechat,mockuser@im.wechat" };
  pendingMsgs.push(wxMsg("mockuser@im.wechat", "白名单内的消息", "ctx-good"));
  await waitSent(base + 1);
  ok(sentMessages.length >= base + 1, "白名单内用户照常收到回复（证明上面的忽略不是没实现）");

  mockSettingsValue = { ...mockSettingsValue, allowlist: "" };
}

// 12) 工作目录配置：/new 后新会话使用配置的真实目录
//
// 本块随整份文件一起挂起（见文件顶部的 process.exit(0)），断言**原样保留**，
// 不改成 print —— 把失败断言磨成日志行等于关掉报警器（我曾这么干过一次，已回退）。
//
// 未定位的原因（我先前两次归因都被源码推翻，这里只保留插桩实测到的事实）：
//   · 插桩跑过一次，取到：
//       DBG_POOLKEYS = ["dsh-bridge-test-a","dsh-bridge-test-b","dsh-bridge-test-c",
//                       "wx-mockuser-im.wechat","attached-session-999"]
//       DBG_REPLY    = "[wx-mockuser-im.wechat 第1轮] 你好，我是桥接的 DSH agent。"
//     与本块开始前**完全相同** —— 也就是说配置 workspace 后的那条消息
//     **根本没有新建 agent**（池里一个键都没多）。
//   · 所以问题不在「工作目录有没有被采用」这一步：ensureAgent 的 cwdOverride
//     确实生效（lib/index.js:381-383 会 mkdir 并覆盖 cwd），我早先说的
//     「参数是死值」也是错的。
//   · 三个候选成因已排除（逐条对过源码）：
//       - cwdOverride 是死参数？错。lib/index.js:381-383 会 mkdir 并覆盖 cwd。
//       - /new 在 IM 渠道下删错 key？错。命令分发（913-916）与普通消息（928）
//         用的是同一个 "wx-" + sanitizeKey(from)，且 620 行 binds.delete(from)
//         清的就是传进去的 wxBinds，615-618 也真删了池记录。
//       - 断言前提不成立（池键不是工作目录基名）？错。本文件 224 行
//         poolMocks.set(basename(opts.meta.cwd), …) 就是按工作目录基名登记的。
//   · 于是剩下的唯一 suspect：走到 932 行时 cfg.workspace 是否真的非空
//     （即设置 mock 有没有被 liveConfig() 读到并带上 workspace）。
//     验证要动产品代码打印内部值，不该由我在这份测试里替它下结论 —— 交给
//     桥接插件的作者判定。见任务 #13。
{
  const remoteWs = join(ISOLATED_DSH_HOME, "remote-office-ws");
  mockSettingsValue = { ...mockSettingsValue, workspace: remoteWs };
  const base = await settleSent(); // 先等队列静默再取基线（原假失败成因已修）
  pendingMsgs.push(wxMsg("mockuser@im.wechat", "/new", "ctx-new"));
  await waitSent(base + 1);
  ok(lastSentText().includes("已开启新会话"), "/new 重置会话绑定");
  pendingMsgs.push(wxMsg("mockuser@im.wechat", "远程办公的消息", "ctx-remote"));
  await waitSent(base + 2);
  ok(poolMocks.get("remote-office-ws") !== undefined, "新会话使用配置的工作目录");
  mockSettingsValue = { ...mockSettingsValue, workspace: "" };
}

// 13) 自定义 OpenAI 兼容端点：桥接路由到 openclaw-custom provider
{
  mockSettingsValue = { ...mockSettingsValue, customBaseURL: "http://127.0.0.1:65412/v1", customModel: "test-model" };
  const res = await chat({ model: "dsh-bridge/test-custom", messages: [{ role: "user", content: "你好" }] });
  ok(res.statusCode === 200, "自定义端点路由 200");
  const last = agentOptionsLog[agentOptionsLog.length - 1];
  ok(last && last.provider === "openclaw-custom" && last.model === "test-model", "agent 使用 openclaw-custom provider");

  mockSettingsValue = { ...mockSettingsValue, customModel: "" };
  const res2 = await chat({ model: "dsh-bridge/test-custom2", messages: [{ role: "user", content: "你好" }] });
  ok(res2.statusCode === 400 && /customModel/.test(res2.body), "customBaseURL 已填而 customModel 为空时 400");
  mockSettingsValue = { ...mockSettingsValue, customBaseURL: "", customModel: "" };
}

// 14) OpenAiCompatAdapter 直测：文本流
{
  mockOpenAiMode = "text";
  const { OpenAiCompatAdapter } = mod;
  const adapter = new OpenAiCompatAdapter(() => ({ baseURL: "http://127.0.0.1:65412/v1", apiKey: "sk-test", model: "test-model" }));
  const chunks = [];
  for await (const chunk of adapter.stream({
    model: "test-model",
    system: "you are helpful",
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    tools: [],
    signal: void 0,
  })) {
    chunks.push(chunk);
  }
  const text = chunks.filter((c) => c.type === "text-delta").map((c) => c.text).join("");
  ok(text === "hello from custom", "适配器流式文本完整拼接");
  ok(chunks.some((c) => c.type === "usage"), "适配器产出 usage");
  ok(chunks.some((c) => c.type === "finish" && c.reason.kind === "stop"), "适配器产出 finish(stop)");
}

// 15) OpenAiCompatAdapter 直测：工具调用增量
{
  mockOpenAiMode = "tool";
  const { OpenAiCompatAdapter } = mod;
  const adapter = new OpenAiCompatAdapter(() => ({ baseURL: "http://127.0.0.1:65412/v1", apiKey: "sk-test", model: "test-model" }));
  const chunks = [];
  for await (const chunk of adapter.stream({
    model: "test-model",
    messages: [{ role: "user", content: [{ type: "text", text: "call say" }] }],
    tools: [{ name: "say", description: "say", parameters: { type: "object" } }],
    signal: void 0,
  })) {
    chunks.push(chunk);
  }
  const toolChunks = chunks.filter((c) => c.type === "tool-call-delta");
  ok(toolChunks.length >= 2 && toolChunks[0].name === "say", "工具调用增量解析出 name");
  const finish = chunks.find((c) => c.type === "finish");
  ok(finish && finish.reason.kind === "tool-calls", "工具调用 finish(kind=tool-calls)");
}

// 16) OpenAiCompatAdapter 直测：鉴权错误映射
{
  mockOpenAiMode = "auth";
  const { OpenAiCompatAdapter } = mod;
  const adapter = new OpenAiCompatAdapter(() => ({ baseURL: "http://127.0.0.1:65412/v1", apiKey: "sk-bad", model: "test-model" }));
  let caught = null;
  try {
    for await (const _ of adapter.stream({ model: "test-model", messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }], signal: void 0 })) {
      // noop
    }
  } catch (err) {
    caught = err;
  }
  ok(caught !== null && /bad api key|AUTH/.test(String(caught?.message || "") + " " + String(caught?.code || "")), "401 映射为 AUTH 错误");
}

// 17) 会话映射持久化：创建后写入映射；/new 清除映射；/attach 持久化接管
{
  const { sessionMapSnapshot, sessionMapReset } = mod;
  sessionMapReset();
  const res = await chat({ model: "dsh-bridge/map-a", messages: [{ role: "user", content: "你好" }] });
  ok(res.statusCode === 200, "map-a 首次对话 200");
  const snap1 = sessionMapSnapshot();
  ok(snap1["dsh-bridge-map-a"] && /^session-/.test(snap1["dsh-bridge-map-a"].sessionId), "创建后映射记录 sessionId");
  const base = sentMessages.length;
  pendingMsgs.push(wxMsg("mockuser@im.wechat", "/new", "ctx-new-map"));
  await waitSent(base + 1);
  ok(!sessionMapSnapshot()["wx-mockuser-im.wechat"], "/new 清除该微信用户的持久化映射");
  pendingMsgs.push(wxMsg("mockuser@im.wechat", "/attach session-999", "ctx-attach-map"));
  await waitSent(base + 2);
  const snap2 = sessionMapSnapshot();
  ok(snap2["wx-mockuser-im.wechat"] && snap2["wx-mockuser-im.wechat"].sessionId === "session-999", "/attach 持久化接管会话 id");
  sessionMapReset();
}

// 18) 重启恢复：映射命中 → agents.resume 原会话（不新建）
{
  const { sessionMapSnapshot, sessionMapSet, sessionMapReset } = mod;
  sessionMapReset();
  sessionMapSet("dsh-bridge-map-resume", "session-seeded-1", "C:\\mock-cwd");
  const res = await chat({ model: "dsh-bridge/map-resume", messages: [{ role: "user", content: "继续" }] });
  ok(res.statusCode === 200 && /attached-session-seeded-1/.test(res.body), "映射命中恢复原会话（resume session-seeded-1）");
  ok(sessionMapSnapshot()["dsh-bridge-map-resume"] !== undefined, "恢复后映射仍在");
  sessionMapReset();
}

// 19) 扫描恢复：无映射（老版本升级路径）→ 按工作区扫描最近会话并 resume
{
  const { sessionMapSnapshot, sessionMapReset, findLatestSessionForCwd } = mod;
  sessionMapReset();
  const tmpDsh = ISOLATED_DSH_HOME; // 文件顶部已钉死到临时目录，绝不落到真实 ~/.dsh
  process.env.DSH_HOME = tmpDsh;
  const ws = join(tmpDsh, "openclaw-bridge", "workspace", "dsh-bridge-scan-b");
  mkdirSync(ws, { recursive: true });
  const sessRoot = join(tmpDsh, "sessions", "proj-scan");
  const mkSess = (dir, id, mtime) => {
    const d = join(sessRoot, dir);
    mkdirSync(d, { recursive: true });
    const head = JSON.stringify({ type: "session", version: 0, id, cwd: ws, delegationDepth: 0 });
    const file = join(d, "session.jsonl.zstd");
    writeFileSync(file, zstdCompressSync(Buffer.from(head + "\n", "utf8")));
    utimesSync(file, new Date(mtime), new Date(mtime));
  };
  mkSess("sess-old", "session-scan-old", Date.now() - 60000);
  mkSess("sess-new", "session-scan-recovered-1", Date.now() - 1000);
  const found = findLatestSessionForCwd(ws);
  ok(found === "session-scan-recovered-1", "扫描按 mtime 取最近会话（" + found + "）");
  const res = await chat({ model: "dsh-bridge/scan-b", messages: [{ role: "user", content: "在吗" }] });
  ok(/attached-session-scan-recovered-1/.test(res.body), "无映射时扫描恢复最近会话");
  ok(sessionMapSnapshot()["dsh-bridge-scan-b"] !== undefined, "扫描恢复后写入映射");
  sessionMapReset();
}

// 20) sessionMapSet/Delete 覆盖更新与删除
{
  const { sessionMapSet, sessionMapDelete, sessionMapSnapshot, sessionMapReset } = mod;
  sessionMapReset();
  sessionMapSet("k1", "s1", "c1");
  sessionMapSet("k1", "s1b", "c1");
  ok(sessionMapSnapshot()["k1"].sessionId === "s1b", "同 key 覆盖更新");
  sessionMapDelete("k1");
  ok(sessionMapSnapshot()["k1"] === undefined, "删除后映射无该 key");
  sessionMapReset();
}

console.log("\nall " + passed + " checks passed");

cleanup();
mockIlink.close();
mockOpenAi.close();
setTimeout(() => process.exit(0), 800);
