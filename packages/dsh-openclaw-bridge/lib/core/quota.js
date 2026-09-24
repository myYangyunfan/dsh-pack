// @deepseek-ai/dsh-openclaw-bridge/lib/core/quota.js
// 入站限流 + 出站排队。
//  - 入站：每用户（key = "<channel>:<userId>"）滑动窗口限流，默认 20 条/分钟，
//    超限直接丢弃（省 agent 配额），返回 retryAfter 供日志/将来 429 提示。
//  - 出站：每渠道串行发送队列，可配最小发送间隔（默认 0，即不节流）。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createInboundQuota({ maxPerMinute = 20 } = {}) {
  const hits = new Map(); // key -> number[]（最近 1 分钟内的时间戳）

  // 定期清理过期条目，防 map 无限增长（惰性清理已足够：只会在命中时收敛）
  function prune(key, now) {
    const arr = hits.get(key) || [];
    const kept = [];
    for (const t of arr) if (now - t < 60000) kept.push(t);
    return kept;
  }

  /**
   * @param {string} key 用户维度 key
   * @returns {{ allowed: boolean, retryAfter?: number }}
   */
  function allow(key, now = Date.now()) {
    if (!key) return { allowed: true };
    const kept = prune(key, now);
    if (kept.length >= maxPerMinute) {
      hits.set(key, kept);
      return { allowed: false, retryAfter: Math.max(0, 60000 - (now - kept[0])) };
    }
    kept.push(now);
    hits.set(key, kept);
    return { allowed: true };
  }

  return { allow };
}

/**
 * 出站发送队列：串行执行、失败不阻塞后续、可配最小间隔。
 * @param {{ minIntervalMs?: number }} opts
 * @returns {{ enqueue: Function }}
 */
export function createOutboundQueue({ minIntervalMs = 0 } = {}) {
  let chain = Promise.resolve();
  let lastAt = 0;
  let pending = 0;

  /**
   * @param {Function} fn async () => any
   * @returns {Promise<any>}
   */
  function enqueue(fn) {
    pending += 1;
    const run = chain.then(async () => {
      const wait = lastAt + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      const out = await fn();
      lastAt = Date.now();
      return out;
    });
    chain = run.then(
      () => {},
      () => {}
    );
    const settled = run.finally(() => {
      pending -= 1;
    });
    return settled;
  }

  return { enqueue, pending: () => pending };
}