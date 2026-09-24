# 微信 Clawbot 开放文档核对笔记

来源：https://developers.weixin.qq.com/doc/aispeech/knowledge/openapi/Clawbotrelated.html
（微信智能对话开放平台 → 开放接口 → clawbot 相关接口）
抓取时间：2026-06（本地快照，正文要点如下）

## 文档内容摘要

该页属于「微信智能对话开放平台」（aispeech 域）的开放 API，名为 clawbot 相关接口，
共三个微信通道接口，均为平台侧 HTTP API（非 iLink 直连协议）：

1. `POST /api/v1/wechat/qrcode` —— 获取微信登录二维码。
   响应 `data.qrcode_url`（图片 URL，可直接前端显示）+ `data.qrcode`（二维码 token）。
   示例 qrcode_url 内含
   `https://ilinkai.weixin.qq.com/ilink/bot/get_qrcode_status?qrcode=xxx` ——
   **与 lib/wechat.js 直连的 iLink 域名/路径同源**。
2. `POST /api/v1/wechat/qrcode/status` —— 长轮询扫码状态。
   入参 `{qrcode}`；状态 `wait|scaned|confirmed|expired`；
   confirmed 时返回 `credentials{bot_token, ilink_bot_id, ilink_user_id}` + `baseurl`（默认
   `https://ilinkai.weixin.qq.com`，可能覆盖默认值）。
3. `POST /api/v1/wechat/channel_reset` —— 入参 `{channel_id}`，重置 IM 通道：
   删除数据库 IM 通道记录并停止该通道的 longpoll 轮询（需平台临时令牌认证）。

## 对本桥的结论（D-02 合规立场：官方接口）

- 该平台 API 是**托管服务**：需要微信智能对话开放平台账号 + 平台侧令牌，
  且返回的 credentials 本身仍是 iLink Bot 凭据（bot_token/ilink_bot_id）。
- **lib/wechat.js 现行实现 = 直接 iLink 协议**（`/ilink/bot/get_bot_qrcode?bot_type=3`、
  `get_qrcode_status`、`getupdates` 长轮询、`sendmessage`），
  与官方 Clawbot 平台内部所用 baseurl 一致 → **实现方向与官方文档一致，无需改动**。
- 平台 API 的 QR 状态机（wait/scaned/confirmed/expired）与本桥 state 机
  （waiting-qr → waiting-scan → connected/expired）语义吻合。
- 无需引入平台依赖；若未来平台开放更稳定的官方通道再评估。
