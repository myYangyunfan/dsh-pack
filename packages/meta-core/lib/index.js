/**
 * @dsh-pack/core —— 核心体验层元包本体（no-op）。
 *
 * 元包唯一的职责是随包携带那份由 tools/build-meta-patches.mjs 生成的
 * cordis.patch.yml：dsh 把 bundle 包也当插件 import，所以必须有合法的
 * main，但它什么都不做——成员的功能全在成员自己的包里。
 *
 * 为什么行要由元包插：docs/spike-official-client.md §0.3 实测，元包光靠
 * dependencies 是惰性的（传递依赖不会成为 bundle、row 也不组合、用户无报错）。
 */
export const name = 'meta-core';
export const inject = [];
export function apply() {
  // no-op：挂载全部由本包的 cordis.patch.yml 完成。
}
