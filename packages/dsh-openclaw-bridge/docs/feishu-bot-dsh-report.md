# 飞书通道接入报告（官方核对版）

> 版本：SPEC v0.7.0 §6 / P1
> 日期：2026-08（本报告数据基于 **@larksuiteoapi/node-sdk v1.73.0** 官方 SDK 源码逐行核对 + 对开放平台在线实测）
> 核对方法：① 拉取 npm 官方 SDK 包源码（`https://registry.npmjs.org/@larksuiteoapi/node-sdk/-/node-sdk-1.73.0.tgz`）阅读 `WSClient` / `RequestHandle` / protobuf 定义；② 用假凭据对 `open.feishu.cn` 实测各端点响应形状（不会泄露任何真实凭据）。

## 1. 结论摘要

- 飞书 **事件订阅「长连接模式」** 完全可用、免公网 IP、免回调 URL：官方 SDK 内置 `WSClient` 即此协议。本插件自研 vendored WS 客户端（`lib/ws.js`）可承载。
- 接入流程三段：**tenant_access_token** → **POST /callback/ws/endpoint 换取 WebSocket URL + 客户端配置** → **连接并收发 protobuf 帧**。
- 事件以 JSON 推送（可配 AES 加密信封），**每条事件必须回 ACK 帧**（否则服务端重推）。
- 发送/回复走标准 REST：`POST /open-apis/im/v1/messages` 与 `POST /open-apis/im/v1/messages/:message_id/reply`。
- 合规：全部为飞书开放平台官方接口，无任何逆向/非官方协议。

## 2. 端到端实测记录

| 探测 | 请求 | 实测响应（假凭据） | 结论 |
|---|---|---|---|
| token 接口 | `POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal`，body `{"app_id":"cli_...","app_secret":"..."}` | `HTTP 200 {"code":10003,"data":{},"msg":"invalid param"}` | 端点/字段形状正确（假 app_id 格式不合规被拒）；真实凭据应返回 `{"code":0,"tenant_access_token":"t-...","expire":7200,"msg":"ok"}`（SDK 常量与文档一致） |
| WS 端点发现 | `POST https://open.feishu.cn/callback/ws/endpoint`，headers `locale:zh` + UA，body `{"AppID":"...","AppSecret":"..."}` | `HTTP 200 {"code":1000040346,"msg":"app_id is invalid","data":{"URL":""}}` | 端点/字段形状正确；成功时 `data.URL` = WebSocket 连接地址（query 含 `device_id`、`service_id`），`data.ClientConfig` = `{PingInterval, ReconnectCount, ReconnectInterval, ReconnectNonce}`（单位：秒） |
| 直连 `wss://open.feishu.cn/connect` | 任意路径均回开放平台前端 HTML（HTTP 200） | —— | **长连接接入必须先走 endpoint 发现接口拿 URL，不存在可硬编码的公开 WS 地址** |

> SDK 源码出处（`es/index.js`）：`pullConnectConfig()` 构造 `{domain}/callback/ws/endpoint` POST，body `{AppID, AppSecret}`；`connect()` 用 `new WebSocket(connectUrl)`；`wsConfigUrl` getter 见 `WSConfig`。

## 3. 长连接协议（自 SDK 源码逐项还原）

### 3.1 帧格式（protobuf，服务端下发/客户端上行同构）

`pbbp2.Frame`（字段号）：

| 字段号 | 类型 | 名称 | 说明 |
|---|---|---|---|
| 1 | uint64 | SeqID | 序号 |
| 2 | uint64 | LogID | 日志 ID |
| 3 | int32 | service | 服务 ID（ping 帧须填 `service_id`） |
| 4 | int32 | method | **0 = control，1 = data** |
| 5 | repeated Header | headers | Header = { 1: key(string), 2: value(string) } |
| 6 | string | payloadEncoding | 载荷编码 |
| 7 | string | payloadType | 载荷类型 |
| 8 | bytes | payload | 载荷 |
| 9 | string | LogIDNew | 新日志 ID |

### 3.2 头部键与消息类型

- HeaderKey：`type`、`message_id`、`sum`、`seq`、`trace_id`、`biz_rt`、`handshake-status`、`handshake-msg`、`handshake-autherrcode`
- FrameType：control=0 / data=1
- MessageType：`event` / `card` / `ping` / `pong`

### 3.3 连接生命周期（对 SDK `WSClient` 的忠实复刻）

1. **发现**：POST `/callback/ws/endpoint`（见 §2）→ `data.URL` + `data.ClientConfig`。
2. **连接**：`connect(data.URL)`（TLS WebSocket；URL 自带鉴权参数）。
3. **激活**：`open` 后**立即**发送一个 control 帧 `{headers:[{type:ping}], service: service_id, method:0, SeqID:0, LogID:0}`；此后每 `PingInterval`（服务端配置，默认 **120s**）重发。
4. **心跳应答**：服务端回 control 帧 `type=pong`，payload 为 JSON `{"PingInterval":...,"ReconnectCount":...,"ReconnectInterval":...,"ReconnectNonce":...}` → 客户端用新值更新自身配置（SDK 行为）。
5. **事件推送**：data 帧 `method=1`，headers 含 `type=event`、`message_id`、`sum`、`seq`、`trace_id`。**大事件按 `sum`/`seq` 拆成多帧**，须按 `message_id` 重组（SDK `DataCache`：10s 过期清理）。重组后 payload = 事件 JSON（UTF-8）。
6. **ACK**：每收到一个完整 event，回一个 data 帧：headers = 原 headers + `{key:"biz_rt", value:"<负耗时毫秒>"}`，payload = `{"code":200}`（SDK 构造 `{code:HttpStatusCode.ok}`，若 handler 有返回则附 `data: base64(JSON)`）。**不回 ACK 服务端会重推**。
7. **断线重连**：`close`/`error` → 等待 `ReconnectNonce*random()` 后按 `ReconnectInterval` 重试（最多 `ReconnectCount` 次；-1 = 无限）；每次重连都重新走「发现→连接」。
8. **服务端握手帧**：连接后服务端可能下发带 `handshake-status`/`handshake-msg`/`handshake-autherrcode` 头的 control 帧（SDK 忽略其内容，仅作信息）；SDK 以 WS `open` 为就绪信号。本实现同样忽略内容、记录日志。

### 3.4 事件加密（可选）

- 应用配置「加密 Key」后，事件 payload JSON 形如 `{"encrypt":"<base64>"}`。
- 解密算法（SDK `AESCipher`，与旧版文档「app_secret 前 16 字节」**不同**，以 SDK 为准）：
  - `key = sha256(encryptKey)`（32 字节）
  - `cipher = base64decode(encrypt)`；`iv = cipher[0..16)`；密文 = `cipher[16..)`
  - `AES-256-CBC` 解密，PKCS7 填充（Node `createDecipheriv('aes-256-cbc', key, iv)` + `final`）。
- WS 模式**无需**校验签名（`RequestHandle.parse(..., {needCheck:false})`；HTTP 模式才验 `X-Lark-Signature = sha1(timestamp+nonce+verificationToken+body)`）。本实现不配置 verificationToken，WS 模式校验关闭。

### 3.5 事件 JSON 结构（v2 信封，`im.message.receive_v1`）

```json
{
  "schema": "2.0",
  "header": { "event_id": "evt_xxx", "event_type": "im.message.receive_v1",
              "create_time": "1700000000000", "token": "...", "app_id": "cli_xxx", "tenant_key": "..." },
  "event": {
    "sender": { "sender_id": { "union_id": "...", "user_id": "...", "open_id": "ou_xxx" },
                "sender_type": "user", "tenant_key": "..." },
    "message": {
      "message_id": "om_xxx", "chat_id": "oc_xxx", "chat_type": "p2p | group",
      "message_type": "text", "content": "{\"text\":\"你好\"}",
      "mentions": [ { "key": "@_user_1", "id": { "open_id": "ou_xxx" }, "mentioned_type": "app|user", "name": "..." } ]
    }
  }
}
```

（字段名逐一对照 SDK `types/index.d.ts` 的 `im.message.receive_v1` 定义。）

## 4. 发送 / 回复 API（REST，HTTP 标准）

| 操作 | 请求 | 说明 |
|---|---|---|
| 发消息 | `POST {domain}/open-apis/im/v1/messages?receive_id_type=open_id\|chat_id\|user_id\|email`，Header `Authorization: Bearer <tenant_access_token>`，body `{"receive_id":"ou_xxx/oc_xxx","msg_type":"text","content":"{\"text\":\"...\"}"}` | 群聊用 `chat_id`，私聊用 `open_id`；body 字段与 SDK `im/v1/messages` API 定义一致 |
| 回复 | `POST {domain}/open-apis/im/v1/messages/:message_id/reply`，body `{"msg_type":"text","content":"{\"text\":\"...\"}"}` | 被动回复，免 `receive_id` |
| 查消息 | `GET {domain}/open-apis/im/v1/messages/:message_id` | 备用 |

- token：`tenant_access_token` 有效期 7200s；缓存至过期前 60s 刷新；遇 `99991663`（token 失效）刷新后重试一次。
- 权限（应用后台开启）：`im:message`（读取消息）、`im:message.p2p_msg`（私聊）、`im:message.group_at_msg`（群@）、`im:chat`（获取群信息，可选）、`im:resource`（M3 图片/文件下载用）。

## 5. 待核对项（SPEC §14 / O-02 回填）

| 项 | 状态 |
|---|---|
| 应用级频控数值（默认 QPS / 日配额；现需「提升限额」申请） | 待核对（开放平台「频控与调用限制」页，需登录态，未纳入本期 mock 验证；出站已按 SPEC 串行+最小间隔，超限回 429 时退避重试） |
| 群@事件中机器人的 `mentions[].mentioned_type` 取值（'app' 或 'user'） | 假设 H-01：`mentioned_type==='app'` 或 mention.id 含 `app_id` 视为@机器人；真机首验后回填 |
| 群聊发言者昵称获取（署名 `[群友 xxx]`）：`GET /open-apis/contact/v3/users/:user_id?user_id_type=open_id` 需 `contact:user.base:readonly` 权限 | 假设 H-02：M1 未申请联系人权限时回退 `[群友 <open_id 前 8 位>]`；权限开通后自动升级为真实昵称 |
| 长连接 URL 的 query 参数含义（device_id/service_id 用途） | 已确认由服务端下发，客户端原样使用即可（SDK 仅解析存储） |

## 6. 实现要点（对应 lib/channels/feishu.js）

- 零依赖：protobuf 编解码手写（varint + wire type 2），AES 用 `node:crypto`，WS 用 `lib/ws.js`，HTTP 用 `node:http/https`。
- 状态机：`disconnected → connecting → connected → (reconnecting) → failed`；断线自动重连（指数/服务端配置间隔），`stop()`/`dispose()` 幂等终止。
- 入站归一化（对齐 SPEC §4）：`{channel:'feishu', eventId: header.event_id, ts, conv:{kind: p2p|group, id: chat_id, memberId: open_id, memberName?}, text, replyToMessageId: message_id, raw}`；群消息**仅当命中机器人 mention 才上送**（H-01）。
- 出站：`send(conv, text, {replyTo})` → replyTo 优先走 reply API，否则按 conv.kind 选 receive_id_type；经 `segmentReply` 分段后逐段发送（SPEC 共享层）。
- ACK：每事件必回（§3.3-6），handler 抛错时回 `{"code":500}`。
- 日志：`~/.dsh/openclaw-bridge/logs/feishu.log`（1MB 轮转，共享层）。
