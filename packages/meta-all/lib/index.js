// 元包宿主半边是显式空实现：它只负责让自己成为 bundle，从而由 cordis.patch.yml 插入成员行。
// 不 inject 任何内核服务：装上一个不含任何插件代码的分层壳，不该在内核侧产生任何副作用。
export const name = "@dsh-pack/all";
export const inject = [];
export function apply() {
  return () => {};
}
export default { name, inject, apply };
