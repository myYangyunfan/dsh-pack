// @deepseek-ai/dsh-prompt-custom
// 服务端半边：在 DSH 设置页注册「自定义提示词」命名空间 dsh-prompt，
// 并对每个新建 agent 向其作用域注入提示词节，覆盖/追加官方内核的默认 persona。
//
// 注入方式：
//   - mode = "replace"：注册与预设 persona 同名的 deployment:persona（order 0），
//     在 agent 作用域遮蔽（shadow）预设 persona，实现整体替换。
//   - mode = "append"：注册新节 dsh:custom-prompt（order 1），紧随 persona 之后追加。
//
// 不修改任何官方包，仅通过官方 systemPrompt.section() 与 dsh-settings 能力注入。
// 设置保存后「新创建的会话/agent」立即生效；运行中会话保持原提示词（与官方 preset 语义一致）。
//
// 另提供一个 webServer 路由 GET /api/dsh-prompt-custom/preview，返回渲染后的官方
// system prompt 全文（只读），供客户端设置页「预览官方提示词」入口对照编辑自定义提示词。

import z from "@deepseek-ai/schemastery";
import { PERSONA_PREFIX_SECTION, PERSONA_SUFFIX_SECTION, renderPrompt } from "@deepseek-ai/dsh-system-prompt";

// <<BEGIN settings-host（由 tools/codemod/apply-settings-scope.mjs 生成，勿单包手改）>>
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
// <<END settings-host>>

const name = "@dsh-pack/dsh-prompt-custom";
const inject = ["settings", "systemPrompt", "webServer"];

const NS = "dsh-prompt";
const Config = z.object({
	enabled: z.boolean().volatile().default(false),
	mode: z.union([z.const("replace"), z.const("append")]).volatile().default("append"),
	text: z.string().volatile().default("")
});

// 取配置的 getter；setSource 会被替换为 settings scope 读取器（热生效）。
let liveConfig = () => ({ enabled: false, mode: "append", text: "" });

// ---------------------------------------------------------------------------
// 预览官方提示词：GET /api/dsh-prompt-custom/preview
// 用 renderPrompt 渲染 ctx.systemPrompt.assemble({}) 的结果（不含本插件的自定义节），
// 供客户端设置页对照编辑。渲染缺变量等异常时降级为「拼接原始节文本」而非抛错。
// ---------------------------------------------------------------------------

const PREVIEW_ROUTE = "/api/dsh-prompt-custom/preview";

function isLoopback(req) {
	const ra = req.socket && req.socket.remoteAddress;
	return ra === "127.0.0.1" || ra === "::1" || ra === "::ffff:127.0.0.1";
}

function sendJson(res, status, body) {
	const data = Buffer.from(JSON.stringify(body), "utf8");
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"content-length": String(data.length)
	});
	res.end(data);
}

async function renderOfficialPrompt(ctx) {
	let assembly;
	try {
		assembly = await ctx.systemPrompt.assemble({});
	} catch (error) {
		return { ok: false, message: "系统提示词组装失败：" + ((error && error.message) || error) };
	}
	try {
		return { ok: true, text: renderPrompt(assembly) };
	} catch (error) {
		// 容错：缺变量/变量无值导致渲染抛错时，退化为拼接各节原始文本，保留 {{var}} 占位。
		const text = (assembly.sections || [])
			.map((s) => (typeof s.text === "string" ? s.text : String(s.text)))
			.filter((t) => t && t.trim())
			.join("\n\n");
		return {
			ok: true,
			text,
			message: "部分变量未能替换，已保留原文：" + ((error && error.message) || error)
		};
	}
}

async function handlePreviewRoute(ctx, req, res) {
	if (req.method !== "GET") {
		res.writeHead(405, { allow: "GET" });
		res.end();
		return;
	}
	if (!isLoopback(req)) {
		res.writeHead(403);
		res.end("forbidden");
		return;
	}
	try {
		sendJson(res, 200, await renderOfficialPrompt(ctx));
	} catch (error) {
		sendJson(res, 500, { ok: false, message: String((error && error.message) || error) });
	}
}

function apply(ctx, config) {
	liveConfig = () => config || {};
	// settings 已在本插件 inject 中声明，apply 时服务必在；直接同步注册并
	// try/catch：存储的 dsh-prompt 配置节非法会让 register() 抛异常 → 插件
	// fiber 失败 → dsh fail-loud 启动崩溃。降级为组合配置继续运行（不阻断启动）。
	try {
		const scope = mountSettingsScope(ctx, config, "prompt-custom");
		liveConfig = () => scope.get();
		scope.watch(() => {
			const cfg = liveConfig() || {};
			console.log("[dsh-prompt-custom] settings updated: " + JSON.stringify({ enabled: cfg.enabled, mode: cfg.mode }));
		});
	} catch (error) {
		console.warn("[dsh-prompt-custom] settings section unavailable (invalid stored config); falling back to composition config: " + ((error && error.message) || error));
	}

	// 每个 agent 创建时，向 agent 作用域注册提示词节。
	// 注册随 agent 纤维自动销毁，无泄漏。
	ctx.on("agent/created", ({ agent }) => {
		const cfg = liveConfig() || {};
		if (!cfg.enabled || !String(cfg.text || "").trim()) return;
		const text = String(cfg.text).trim();
		// rc.1 起官方把人设节拆成 prefix/suffix 两节，顺序键同步改名
		// DEPLOYMENT_PERSONA_PREFIX / _SUFFIX（旧键 DEPLOYMENT_PERSONA 已不存在，
		// 取不到值会让 order 变 NaN）。
		const sp = agent.ctx.systemPrompt;
		const prefixOrder = sp.getSectionOrder("DEPLOYMENT_PERSONA_PREFIX");
		const suffixOrder = sp.getSectionOrder("DEPLOYMENT_PERSONA_SUFFIX");
		if (cfg.mode === "replace") {
			// 官方以 `config.personaSuffix ?? ""` 注册该节，空文本明确合法 → 置空即等价
			// alpha.5 的单节整段替换。
			sp.section({ name: PERSONA_PREFIX_SECTION, order: prefixOrder, text });
			sp.section({ name: PERSONA_SUFFIX_SECTION, order: suffixOrder, text: "" });
		} else {
			sp.section({ name: "dsh:custom-prompt", order: suffixOrder + 1, text });
		}
	});

	// 预览官方提示词路由（回环地址限定）。
	return ctx.webServer.register({
		kind: "exact",
		path: PREVIEW_ROUTE,
		handler: (req, res) => handlePreviewRoute(ctx, req, res)
	});
}

export { Config, apply, inject, name };