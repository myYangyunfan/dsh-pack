# QQ 开放平台机器人接入调研报告（dsh-openclaw-bridge P2）

状态：**已核对（2026-06）**。协议事实来源：
- 官方 Go SDK `tencent-connect/botgo`（master，逐文件核对：`dto/websocket_*.go`、
  `dto/message.go`、`dto/message_create.go`、`websocket/client/client.go`、
  `token/token_source.go`、`errs/err.go`、`openapi/v1/{ws,message}.go`、
  `openapi/v1/resource.go`（URI 常量）、`constant/constant.go`）
- 官方文档站 bot.q.qq.com/wiki（SPA 壳，正文经 chunk 懒加载；以 SDK 源码为准）

## 1. 结论（D-05：QQ 渠道 = 官方 QQ 开放平台机器人）

- 形态：QQ 开放平台（bot.q.qq.com）应用 → AppID + 客户端密钥（AppSecret）→
  `POST https://bots.qq.com/app/getAppAccessToken` 换取 access_token（Bearer 前缀 **`QQBot`**）。
- 收消息：**WebSocket 网关**（生产 `https://api.sgroup.qq.com` / 沙箱
  `https://sandbox.api.sgroup.qq.com`），`GET /gateway/bot` 取接入 URL，JSON 文本帧协议。
- 发消息：REST `POST /v2/groups/{group_openid}/messages`（群）、
  `POST /v2/users/{user_openid}/messages`（C2C 私聊）、
  `POST /channels/{channel_id}/messages`（频道），`msg_id` 被动回复。
- 群@ = `GROUP_AT_MESSAGE_CREATE`，C2C 私聊 = `C2C_MESSAGE_CREATE`，
  频道@ = `AT_MESSAGE_CREATE`，频道私信 = `DIRECT_MESSAGE_CREATE`。
- 沙箱默认开启（qqSandbox='1'，SPEC D-06），发布需平台审核。

## 2. 鉴权与令牌

| 项 | 值 |
| --- | --- |
| 令牌端点 | `POST https://bots.qq.com/app/getAppAccessToken` |
| 请求体 | `{"appId": "...", "clientSecret": "..."}`（SDK 字段名 appId/clientSecret） |
| 响应 | `{"code":0, "message":"ok", "access_token":"...", "expires_in":"7200"(字符串秒)}` |
| 鉴权头 | `Authorization: QQBot <access_token>`（SDK `TypeQQBot="QQBot"`；识别帧同前缀） |
| 刷新策略 | 过期前 ~9s + 随机 0–500ms 提前量（SDK `getRefreshMilliSec`）；本桥按凭据键控缓存 |
| token 失效 | OpenAPI 错误码 11244（token 过期或不存在）→ 清缓存重试一次 |

## 3. WebSocket 网关协议（对照 botgo `websocket/client/client.go`）

- 接入点：`GET {base}/gateway/bot` → `{"url":"wss://...","shards":N,
  "session_start_limit":{"total","remaining","reset_after","max_concurrency"}}`
- 帧为 **JSON 文本帧**：`{"op": n, "d": data, "s": seq, "t": 事件名, "id": 事件id}`
- Opcode（`dto/websocket_opcode.go`，iota 自 0）：
  | op | 名称 | 说明 |
  | --- | --- | --- |
  | 0 | DISPATCH | 事件下发；s=序号（心跳与 resume 用），READY/RESUMED 也在其中 |
  | 1 | HEARTBEAT | 客户端心跳，d=最后收到的 seq（可为 0） |
  | 2 | IDENTITY | 鉴权：`d={token:"QQBot <at>", intents, shard:[0,1], properties:{os,browser,device}}` |
  | 6 | RESUME | 断线续传：`d={token:"QQBot <at>", session_id, seq}` |
  | 7 | RECONNECT | 服务端要求重连（可 resume） |
  | 9 | INVALID_SESSION | session 失效 → 重新 IDENTITY |
  | 10 | HELLO | 首帧：`d={heartbeat_interval}`(ms) → 启动心跳 |
  | 11 | HEARTBEAT_ACK | 心跳应答 |
- 心跳：hello 后按 heartbeat_interval 定时发 op1(d=lastSeq)；本桥实现 3 连丢 ack 主动重连。
- READY：`d={version, session_id, user:{id,username,bot}, shard:[0,2]}` → 记录 session_id。
- Close 码（`errs/err.go`）：4009 session 超时（可 resume）；4004 鉴权失败（重新取 token）；
  4013/4014 intents 未授权（**降级 intents 重连**）；4001–4012 其余协议错误；
  4914 机器人下架 / 4915 封禁（停止重连）。
- 重连策略（SDK）：断线 → 先 resume（带 session_id+seq），RESUMED 或事件续传；
  INVALID_SESSION / 4009 之外的关闭 → 重新 identify。本桥：指数退避 1s→2s→…→60s cap。

## 4. Intents 与事件

| Intent | 值 | 事件 |
| --- | --- | --- |
| GROUP_MESSAGES | 1<<25 | `GROUP_AT_MESSAGE_CREATE`（群@）、`C2C_MESSAGE_CREATE`（C2C 私聊）、`SUBSCRIBE_MESSAGE_STATUS`、`C2C_FRIEND_ADD/DEL` |
| GUILD_AT_MESSAGE | 1<<30 | `AT_MESSAGE_CREATE`（频道@）、`PUBLIC_MESSAGE_DELETE` |
| DIRECT_MESSAGE | 1<<12 | `DIRECT_MESSAGE_CREATE/DELETE`（频道私信） |

本桥订阅 `(1<<25)|(1<<30)`（群 + 频道@）；收到 4013/4014 关闭自动降级为 `1<<25`。

事件 payload 要点（api-v2）：
- `GROUP_AT_MESSAGE_CREATE`：`{author:{user_openid,...}, group_openid, group_id, id, timestamp, content, mentions[]}` — content 为纯文本（已隐含@机器人）。
- `C2C_MESSAGE_CREATE`：`{author:{user_openid}, user_openid, id, timestamp, content, msg_seq}`。
- `AT_MESSAGE_CREATE`（频道）：`{id, channel_id, guild_id, content(含 <@bot> 提及), author:{id, username}, mentions[{id:"all"|user_id}]}` — 需清洗 `<@...>`。
- `DIRECT_MESSAGE_CREATE`：`{id, guild_id, src_guild_id, channel_id, author{id,username}, content}`。
- 归一化（本桥 M1 纯文本）：群/频道@ → conv.kind=group（conv.id=group_openid||channel_id，
  memberId=author.user_openid||author.id）；C2C/私信 → p2p（conv.id=memberId=user_openid||author.id）；
  eventId/msgId=消息 id；文本清洗 `/<@!?[^>]*>/g`。

## 5. 发送 API

| 场景 | 端点 | 请求体 |
| --- | --- | --- |
| 群 | `POST /v2/groups/{group_openid}/messages` | `{content, msg_type:0, msg_id?}` |
| C2C | `POST /v2/users/{user_openid}/messages` | 同上 |
| 频道 | `POST /channels/{channel_id}/messages` | 同上 |
| 引用 | （同发送体）`message_reference:{message_id, ignore_get_message_error}` | 可选 |
| 撤回 | `DELETE /v2/groups/{gid}/messages/{mid}`、`/v2/users/{uid}/messages/{mid}` | — |
| 富媒体(M3) | `POST /v2/groups/{gid}/files`、`/v2/users/{uid}/files`（上传→file_info 复用） | 待核对字段 |

- `msg_id` = 被动回复（事件消息 id）；为空 = 主动消息（受频控/审核约束）。
- 成功响应 200 + `{id, timestamp, ...}`；失败 `{code, message, trace_id}`。

## 6. 待核对（O-02，回填 SPEC §4.3 配额默认值）

- 主动消息频控数值：群聊每日限额、C2C 每日限额、频道每日限额（官方频率限制页数值，
  本机无法登录态核对）。
- 被动回复时间窗（msg_id 有效窗口，群/C2C 各多少秒）。
- C2C 私聊能力当前对个人开发者的申请/开放状态（SPEC O-01 降级条款：收紧则仅频道+群+沙箱）。

## 7. 实现要点（lib/channels/qq.js，零依赖纯 ESM）

- 复用 `lib/ws.js` connect()（文本帧 string 事件）；env 可覆盖：`OPENCLAW_BRIDGE_QQ_BASE`、
  `OPENCLAW_BRIDGE_QQ_SANDBOX_BASE`、`OPENCLAW_BRIDGE_QQ_TOKEN_URL`（测试指向 mock）。
- tokenCache 按 `appId\x00appSecret` 键控（沿用飞书教训）；validate 走 ensureToken。
- 状态机：disconnected|connecting|connected|reconnecting|failed；status() 暴露
  {state, appId, sandbox, lastError, botId}。
- 事件→归一化→共享管道（去重/限流/白名单/分段/署名），与 wechat/feishu 一致。
