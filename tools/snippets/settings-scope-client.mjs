// 页内 bundle 用的 settings 适配器（单一事实源）。
//
// 为什么要有这个文件：内核里**没有** `ctx.settingsScope` 这个服务
// （@deepseek-ai/* 全文 0 处命中），真实形状是 `ctx.remote.settings`：
//   describe() → { ok, value: { writable, hasDocument, namespaces: [view] } }
//   mutate(ns, [{ op: "set", path: [...], value }], revision) → { ok, value: view }
// 而页内 bundle 是 classic script，浏览器模块系统对裸标识符一律 throw，
// 所以不能做成运行时 import 的共享包 —— 只能构建期把这段原样打进每个 bundle。
// 由 tools/codemod/apply-settings-scope.mjs 盖进各包，
// tools/audit/settings-api.js 断言每份副本与本文件逐字节一致（防漂移）。
//
// ⚠ ns 是 **profile 条目 id**（各包 cordis.patch.yml 的 `- id:`），不是 npm 包名，
//   也不是这些包历史上写死的 `dsh-<包名>`。用错键不报错，只是永远取不到值。
export const CLIENT_SNIPPET = `// <<BEGIN settings-scope（由 tools/codemod/apply-settings-scope.mjs 生成，勿单包手改）>>
function bindSettingsScope(ctx, entryId) {
	let snapshot = { status: "loading", value: undefined, writable: false, revision: undefined };
	const listeners = /* @__PURE__ */ new Set();
	const emit = () => { for (const fn of [...listeners]) fn(); };
	// 快照引用必须稳定：selector 走 Object.is 比较，每轮都换新对象会自激重渲染。
	const adopt = (next) => {
		if (next.status === snapshot.status && next.writable === snapshot.writable
			&& JSON.stringify(next.value) === JSON.stringify(snapshot.value)) return;
		snapshot = next;
		emit();
	};
	async function refresh() {
		let response;
		try {
			response = await ctx.remote.settings.describe();
		} catch (error) {
			adopt({ ...snapshot, status: "failed" });
			return;
		}
		if (!response || !response.ok) {
			adopt({ ...snapshot, status: "failed" });
			return;
		}
		const rows = response.value && Array.isArray(response.value.namespaces) ? response.value.namespaces : [];
		const view = rows.find((row) => row.ns === entryId);
		if (view === undefined) {
			// 条目不在 describe() 里 = 它的 Config 没有任何 volatile 字段，
			// 内核就不为它生成表单（volatileForm(schema) 为空即跳过）。
			adopt({ ...snapshot, status: "missing" });
			return;
		}
		adopt({
			status: "ready",
			value: view.value,
			writable: response.value.writable !== false,
			revision: view.revision
		});
	}
	void refresh();
	return {
		getSnapshot: () => snapshot,
		subscribe(fn) {
			listeners.add(fn);
			return () => { listeners.delete(fn); };
		},
		// 旧 API 的 watch(cb) 与 subscribe(cb) 同义，保留名字免得调用方各写一套。
		watch(fn) {
			return this.subscribe(fn);
		},
		async set(field, value) {
			const next = await ctx.remote.settings.mutate(entryId, [{ op: "set", path: [field], value }], snapshot.revision);
			if (next && next.ok && next.value) {
				adopt({ ...snapshot, value: next.value.value, revision: next.value.revision });
				return;
			}
			await refresh();
			if (!next || !next.ok) throw new Error(next && next.error && next.error.message || "settings write rejected");
		},
		refresh
	};
}
// <<END settings-scope>>`;
