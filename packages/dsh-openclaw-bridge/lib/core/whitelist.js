// @deepseek-ai/dsh-openclaw-bridge/lib/core/whitelist.js
// 渠道白名单解析与判定。格式：逗号分隔的 id 列表；
// 留空 = 允许所有（v0.6.0 微信语义，跨渠道保持一致）。
export function parseWhitelist(str) {
  return String(str || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** list 留空放行；非空时仅列出的 id 通过。 */
export function isAllowed(list, id) {
  const arr = Array.isArray(list) ? list : parseWhitelist(list);
  return arr.length === 0 || arr.includes(String(id || ""));
}