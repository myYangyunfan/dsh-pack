/**
 * dsh-input-history — host half (no-op).
 *
 * 终端式上下键命令历史回溯完全由浏览器半边完成（conversation.input.left 槽位
 * 拿到 inputActions/input/session，捕获阶段 keydown 拦 ↑/↓，用 setDraft 写回
 * 历史草稿）。本半边仅为让包成为合法 bundle。
 */
export const name = 'dsh-input-history';
export const inject = [];
export function apply() {
  // no-op.
}
