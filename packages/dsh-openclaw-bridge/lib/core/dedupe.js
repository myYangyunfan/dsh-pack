// @deepseek-ai/dsh-openclaw-bridge/lib/core/dedupe.js
// 入站事件去重：key = "<channel>:<eventId>"。LRU 语义的 Map，容量上限 5 万条
// （超出后淘汰最旧一条）。飞书/QQ 事件自带 eventId；微信 iLink 消息无稳定 id，
// 去重仅在 eventId 非空时生效（微信由调用方传空串跳过）。
export function createDedupe(limit = 50000) {
  const map = new Map(); // key -> seenAt(ms)

  /**
   * 检查并记录一条事件键。重复（已存在）返回 false。
   * @param {string} key
   * @returns {boolean} true = 首次见到，可以处理
   */
  function check(key) {
    if (!key) return true;
    if (map.has(key)) return false;
    map.set(key, Date.now());
    if (map.size > limit) {
      const oldest = map.keys().next().value;
      if (oldest !== void 0) map.delete(oldest);
    }
    return true;
  }

  return { check, size: () => map.size };
}