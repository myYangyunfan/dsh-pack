// @deepseek-ai/dsh-openclaw-bridge/lib/core/router.js
// 统一 IM 入站管道（SPEC §3/§4）：
//   gate（去重 → 限流）→ 渠道 handler 内做白名单 → 会话映射 → runTurn → 分段发送。
// 微信渠道（P0）保留既有直连流程（指令/接管/链式队列）以零回归；
// 飞书/QQ（P1/P2）将复用 gate + routeToAgent + segmentReply。
import { parseWhitelist, isAllowed } from "./whitelist.js";
import { agentKeyFor, sessionIdFor, segmentReply } from "./session.js";

/**
 * 构造某渠道的入站闸门（去重 + 用户限流）。
 * @param {{ channel: string, dedupe: object, quota: object, logger: object }} deps
 * @returns {Function} (msg) => { allowed: boolean, reason?: string }
 *   msg 使用归一化入站形态 { eventId?, channel, ts, conv:{kind,id,title?,member?}, text, raw }
 */
export function createChannelGate({ channel, dedupe, quota, logger }) {
  return function gate(msg) {
    if (msg && msg.eventId && !dedupe.check(channel + ":" + msg.eventId)) {
      logger.warn("duplicate event dropped: " + channel + ":" + msg.eventId);
      return { allowed: false, reason: "duplicate" };
    }
    const uid = (msg && msg.conv && (msg.conv.memberId || msg.conv.id)) || "";
    const q = quota.allow(channel + ":" + uid);
    if (!q.allowed) {
      logger.warn("rate-limited user " + uid + " retryAfter=" + q.retryAfter + "ms");
      return { allowed: false, reason: "rate-limited", retryAfter: q.retryAfter };
    }
    return { allowed: true };
  };
}

/** 白名单判定：listStr 为空放行。 */
export function userAllowed(listStr, userId) {
  return isAllowed(parseWhitelist(listStr), userId);
}

/**
 * 通用 IM 消息 → agent 回合（飞书/QQ 用；微信保有自己的 wxBinds/链式路径）。
 * 与现有 handleChat 的 rec.chain 串行语义一致。
 * @param {{ ensureAgent: Function, runTurn: Function, key: string, inject: string[], logger?: object }} p
 * @returns {Promise<{text: string}>}
 */
export async function routeToAgent({ ensureAgent, runTurn, key, inject = [], logger }) {
  const rec = await ensureAgent(key);
  const task = () => runTurn(rec, inject, null);
  const work = rec.chain.then(task, task);
  rec.chain = work.then(
    () => {},
    () => {}
  );
  const result = await work;
  if (logger) logger.info("agent turn done for key '" + key + "'");
  return result;
}

/** 群聊署名（A-03 默认开）：成员触发时回复前缀 "[群友 用户名] "。 */
export function groupSignature(member, enabled) {
  if (!enabled || !member || !member.name) return "";
  return "[" + member.name + "] ";
}

export { agentKeyFor, sessionIdFor, segmentReply };