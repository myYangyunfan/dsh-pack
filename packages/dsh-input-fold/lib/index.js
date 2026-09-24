/**
 * dsh-input-fold — host half (no-op).
 *
 * 用户提示词折叠完全由浏览器半边（lib/client.js）完成：纯 DOM 定位 user 消息
 * 气泡（data-chat-flow-kind="user" + [class*="bubble"]），CSS 限高折叠 + 事件
 * 委托展开/收起。本半边仅为让包成为合法 bundle。
 */
export const name = 'dsh-input-fold';
export const inject = [];
export function apply() {
  // no-op.
}
