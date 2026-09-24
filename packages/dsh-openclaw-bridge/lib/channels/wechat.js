// @deepseek-ai/dsh-openclaw-bridge/lib/channels/wechat.js
// 微信渠道适配器：把 iLink 客户端（../wechat.js）包装成统一渠道接口（SPEC §4）：
//   { id, title, status, start, verify, stop, send, dispose }
// 微信回复仍走 client.sendText(conv.id, text, contextToken)，P0 仅 p2p（iLink 群消息 M3）。
import { createWechatClient } from "../wechat.js";

export const WECHAT_CHANNEL_ID = "wechat";

export function createWechatAdapter({ sessionFile, onState, onMessage, logger }) {
  const client = createWechatClient({
    sessionFile,
    onState: (s) => {
      if (logger) logger.info("state -> " + JSON.stringify(s));
      if (onState) onState(s);
    },
    onMessage,
  });

  return {
    id: WECHAT_CHANNEL_ID,
    title: "微信",
    implemented: true,
    status: () => client.status(),
    /** 开始扫码登录（适配器接口的 start）。 */
    start: async () => {
      await client.startLogin();
      return client.status();
    },
    verify: (code) => ({
      ok: client.submitVerify(code),
      status: client.status(),
    }),
    stop: () => {
      client.logout();
      return client.status();
    },
    /**
     * 发送文本到会话。conv 使用归一化 {kind,id,memberId?}：
     *   p2p：id = from_user_id；群聊（未来）id = 群 id、memberId = 目标用户。
     * @param {{kind:string,id:string,memberId?:string}} conv
     * @param {string} text
     * @param {{ contextToken?: string }} opts
     */
    async send(conv, text, opts = {}) {
      const to = (conv && (conv.memberId || conv.id)) || "";
      const r = await client.sendText(to, String(text), opts.contextToken);
      return { ok: r.ok, detail: r };
    },
    dispose: () => client.dispose(),
  };
}