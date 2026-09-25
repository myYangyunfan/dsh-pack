// 宿主半边用的 settings 适配器（单一事实源）。
//
// 为什么要有它：内核 0.1.7-rc.1 的 `SettingsForms` 只有
// describe/update/configure/schema/prepareDocument，**没有 `register`**（全内核 0 处命中）。
// 各包原先写的 `ctx.settings.register(NS, Config, {base})` 会抛 TypeError，
// 又被 try/catch 降级成一行 warn ⇒ 设置静默存不住。
//
// 声明式形状：插件导出 `Config`，cordis 的 resolveConfig() 校验 profile 行的 `config:`，
// 结果就是 `apply(ctx, config)` 的第二参。标了 `.volatile()` 的字段会被包成
// cosmokit 引用（`Object.freeze({ get, [write] })`），设置页写回后**原地更新**；
// 没标的字段是普通值，配置变更走整条重挂载。两种形状都要能读，故有下面的 unwrap。
//
// volatile 判据不猜：cosmokit 用的是 `Symbol.for("cosmokit.volatile.write")`
// （cosmokit/lib/index.js:83,116-118），全局符号注册表 ⇒ 不 import 也能拿到同一个符号，
// 判据与内核 `isVolatile()` 逐字一致。
//
// 变更通知：内核写完（update → describe）时会 emit "settings/document-updated"(ns, revision)；
// 没有把该事件桥接给页内，所以宿主侧能拿到的就是这一个信号。
export const HOST_SNIPPET = `// <<BEGIN settings-host（由 tools/codemod/apply-settings-scope.mjs 生成，勿单包手改）>>
const VOLATILE_WRITE = Symbol.for("cosmokit.volatile.write");

/** 把 config 里的 volatile 引用摊平成普通值（同 dsh-settings 的 plainConfig）。 */
function plainSettings(value) {
	if (typeof value !== "object" || value === null) return value;
	if (VOLATILE_WRITE in value) return plainSettings(typeof value.get === "function" ? value.get() : undefined);
	if (Array.isArray(value)) return value.map(plainSettings);
	return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, plainSettings(child)]));
}

/**
 * 用声明式 Config 顶掉不存在的 ctx.settings.register。
 * @param ctx - 本插件作用域
 * @param entryConfig - apply 第二参（resolveConfig 校验过的 profile 行 config）
 * @param entryId - **profile 条目 id**，即 settings/document-updated 回传的 ns
 * @returns 与旧 scope 同名的 { get(), watch(fn) }，调用方不必改形状
 */
function mountSettingsScope(ctx, entryConfig, entryId) {
	const state = { current: plainSettings(entryConfig) || {} };
	const listeners = /* @__PURE__ */ new Set();
	ctx.on("settings/document-updated", (ns) => {
		if (ns !== entryId) return;
		state.current = plainSettings(entryConfig) || {};
		for (const fn of [...listeners]) fn(state.current);
	});
	return {
		get: () => state.current,
		watch(fn) {
			listeners.add(fn);
			return () => { listeners.delete(fn); };
		}
	};
}
// <<END settings-host>>`;
