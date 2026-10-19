// ===========================================================================
// dsh-goal-completion —— 宿主半边（cordis 插件）
//
// 纯界面插件：空的 apply 只是让本包出现在宿主 cordis.yml / Loader 的名单里，
// 真实行为全在浏览器半边（lib/client.js，经 package.json 的 dsh.client 声明被
// 发现）。口径对齐官方 @deepseek-ai/dsh-client-ui-plan 的同款写法。
//
// 不在这里做任何事的原因：目标的状态机、CAS 与事件都由官方 @deepseek-ai/dsh-goal
// 拥有并以 `ctx.remote.goals` 暴露；我们再提供一个写通道就是第二个写者，
// 与本仓库「sidecar 是唯一写者」这类单写者纪律同源。
// ===========================================================================

const name = "dsh-goal-completion";

const inject = [];

function apply() {}

export { apply, inject, name };
