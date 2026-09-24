window.__ModuleLoader__.load({
	id: "dsh-external/dsh-basics-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/locales.ts
		/**
		* zh/en copy for the panel. The copy follows the DSH i18n system: the client
		* apply attaches the locale service (`ctx.locale`) through {@link attachLocale},
		* and `t()` resolves the active locale from it (Host-backed preference wins,
		* switching live). Without an attached service the browser language is used.
		*/
		const zh = {
			nav: "基础能力",
			intro: "可视化并管理 DSH 的 MCP 服务器、技能与规则",
			tabMcp: "MCP 服务器",
			tabSkills: "技能",
			tabRules: "规则",
			refresh: "刷新",
			loading: "加载中…",
			error: "加载失败",
			retry: "重试",
			empty: "暂无数据",
			mcpIntro: "DSH 的 MCP 服务器来自配置组合：用户级（profile）与预设级（preset）。切换开关会写入对应配置文件并热重载。",
			mcpNoProject: "DSH 暂无项目级 MCP 组合文件，项目级配置请关注后续版本。",
			mcpScopeProfile: "用户配置",
			mcpScopePreset: "预设",
			mcpReadOnly: "只读",
			mcpConnected: "已连接",
			mcpEnabled: "已启用",
			mcpDisabled: "已禁用",
			mcpNotMounted: "未生效",
			mcpTools: "{count} 个工具",
			mcpToggle: "启用该 MCP 服务器",
			mcpTakesEffectNewSession: "已保存，将在新会话中生效",
			mcpTakesEffectLive: "已保存，热重载生效",
			mcpFieldCommand: "命令",
			mcpFieldArgs: "参数",
			mcpFieldEnv: "环境变量",
			mcpFieldUrl: "地址",
			mcpFieldHeaders: "请求头",
			mcpFieldCwd: "工作目录",
			mcpFieldTransport: "传输",
			mcpFieldTimeout: "调用超时",
			mcpSeconds: "{count} 秒",
			mcpMasked: "已脱敏",
			mcpLoadFailed: "MCP 列表加载失败",
			mcpToggleFailed: "切换失败",
			mcpCreate: "新建",
			mcpEmpty: "暂无 MCP 服务器，点击「新建」添加",
			skillsIntro: "按作用域展示全部技能。项目级技能（项目 .dsh/skills）优先级高于用户级，同名技能显示生效版本。",
			skillsSearch: "搜索技能…",
			skillsFilterAll: "全部",
			skillsScopeProject: "项目级",
			skillsScopeCustom: "自定义",
			skillsScopeUser: "用户级",
			skillsScopeBundled: "内置",
			skillsScopeRuntime: "运行时",
			skillsScopeOther: "其他",
			skillsEditable: "可编辑",
			skillsReadonly: "只读",
			skillsModelInvocable: "模型可调用",
			skillsUserInvocable: "用户可调用",
			skillsDisableModel: "禁用模型调用",
			skillsNoSkills: "没有找到技能",
			skillsIncomplete: "部分技能未能完整读取",
			skillsBack: "返回列表",
			skillsName: "名称",
			skillsDescription: "描述",
			skillsWhenToUse: "使用时机",
			skillsMetadata: "元数据 (JSON)",
			skillsBody: "正文",
			skillsSave: "保存",
			skillsCancel: "取消",
			skillsSaved: "已保存，热刷新已生效",
			skillsSaveFailed: "保存失败",
			skillsConflict: "文件已被修改，请刷新后重试",
			skillsLocation: "位置",
			skillsOpen: "编辑",
			close: "关闭",
			rulesIntro: "规则文件（AGENTS.md 兼容指令）决定助手的行为约束：全局规则适用于所有项目与所有会话，项目链规则（项目根至当前目录）优先于全局规则。规则在会话启动时加载，修改后将在新会话中生效。",
			rulesGlobal: "全局规则",
			rulesProject: "项目规则",
			rulesSessionCwd: "当前会话目录",
			rulesProjectRoot: "项目根",
			rulesCreate: "新建规则",
			rulesCreateFailed: "创建失败",
			rulesCreateName: "文件名",
			rulesCreateScope: "作用域",
			rulesScopeGlobal: "全局 (~/.dsh)",
			rulesScopeProject: "项目根",
			rulesScopeCwd: "当前工作目录",
			rulesScopeHintGlobal: "全局规则文件固定为 AGENTS.md",
			rulesScopeHintProject: "写入项目根目录，对整个项目生效",
			rulesScopeHintCwd: "写入当前工作目录，仅该目录生效",
			rulesExists: "该文件已存在，请直接编辑",
			rulesNoRules: "暂无规则文件，点击「新建规则」创建",
			rulesPath: "路径",
			rulesBytes: "{count} 字节",
			rulesEdit: "编辑",
			rulesBack: "返回列表",
			rulesContent: "内容",
			rulesSave: "保存",
			rulesCancel: "取消",
			rulesSaved: "已保存，将在新会话中生效",
			rulesSaveFailed: "保存失败",
			rulesConflict: "文件已被修改，请刷新后重试",
			rulesLoadFailed: "规则列表加载失败"
		};
		const en = {
			nav: "Basics Panel",
			intro: "Visualize and manage MCP servers, skills and rules",
			tabMcp: "MCP servers",
			tabSkills: "Skills",
			tabRules: "Rules",
			refresh: "Refresh",
			loading: "Loading…",
			error: "Failed to load",
			retry: "Retry",
			empty: "Nothing here yet",
			mcpIntro: "DSH MCP servers come from the composition: user (profile) and preset scopes. Toggling writes the config file and hot-reloads it.",
			mcpNoProject: "DSH has no project-level MCP composition file yet; project-level config is planned.",
			mcpScopeProfile: "User config",
			mcpScopePreset: "Preset",
			mcpReadOnly: "Read-only",
			mcpConnected: "Connected",
			mcpEnabled: "Enabled",
			mcpDisabled: "Disabled",
			mcpNotMounted: "Not active",
			mcpTools: "{count} tools",
			mcpToggle: "Enable this MCP server",
			mcpTakesEffectNewSession: "Saved — takes effect for new sessions",
			mcpTakesEffectLive: "Saved — hot-reloaded",
			mcpFieldCommand: "Command",
			mcpFieldArgs: "Args",
			mcpFieldEnv: "Env",
			mcpFieldUrl: "URL",
			mcpFieldHeaders: "Headers",
			mcpFieldCwd: "Working dir",
			mcpFieldTransport: "Transport",
			mcpFieldTimeout: "Call timeout",
			mcpSeconds: "{count}s",
			mcpMasked: "masked",
			mcpLoadFailed: "Failed to load MCP servers",
			mcpToggleFailed: "Toggle failed",
			mcpCreate: "Add",
			mcpEmpty: "No MCP servers yet — click \"Add\" to create one",
			skillsIntro: "All skills grouped by scope. Project skills outrank user skills; same-name skills show the effective version.",
			skillsSearch: "Search skills…",
			skillsFilterAll: "All",
			skillsScopeProject: "Project",
			skillsScopeCustom: "Custom",
			skillsScopeUser: "User",
			skillsScopeBundled: "Bundled",
			skillsScopeRuntime: "Runtime",
			skillsScopeOther: "Other",
			skillsEditable: "Editable",
			skillsReadonly: "Read-only",
			skillsModelInvocable: "Model-invocable",
			skillsUserInvocable: "User-invocable",
			skillsDisableModel: "Disable model invocation",
			skillsNoSkills: "No skills found",
			skillsIncomplete: "Some skills could not be fully read",
			skillsBack: "Back to list",
			skillsName: "Name",
			skillsDescription: "Description",
			skillsWhenToUse: "When to use",
			skillsMetadata: "Metadata (JSON)",
			skillsBody: "Body",
			skillsSave: "Save",
			skillsCancel: "Cancel",
			skillsSaved: "Saved — hot-reloaded",
			skillsSaveFailed: "Save failed",
			skillsConflict: "The file changed — refresh and retry",
			skillsLocation: "Location",
			skillsOpen: "Edit",
			close: "Close",
			rulesIntro: "Rule files (AGENTS.md-compatible instructions) shape assistant behavior: global rules apply to every project and session, project-chain rules (project root to current dir) take precedence over global ones. Rules load at session start, so edits take effect for new sessions.",
			rulesGlobal: "Global rules",
			rulesProject: "Project rules",
			rulesSessionCwd: "Session cwd",
			rulesProjectRoot: "Project root",
			rulesCreate: "New rule",
			rulesCreateFailed: "Create failed",
			rulesCreateName: "File name",
			rulesCreateScope: "Scope",
			rulesScopeGlobal: "Global (~/.dsh)",
			rulesScopeProject: "Project root",
			rulesScopeCwd: "Current working dir",
			rulesScopeHintGlobal: "The global rule file is fixed to AGENTS.md",
			rulesScopeHintProject: "Writes to the project root, applies to the whole project",
			rulesScopeHintCwd: "Writes to the current working dir, applies there only",
			rulesExists: "This file already exists — edit it directly",
			rulesNoRules: "No rule files yet — click \"New rule\" to create one",
			rulesPath: "Path",
			rulesBytes: "{count} bytes",
			rulesEdit: "Edit",
			rulesBack: "Back to list",
			rulesContent: "Content",
			rulesSave: "Save",
			rulesCancel: "Cancel",
			rulesSaved: "Saved — takes effect for new sessions",
			rulesSaveFailed: "Save failed",
			rulesConflict: "The file changed — refresh and retry",
			rulesLoadFailed: "Failed to load rules"
		};
		/** The dictionary namespace this plugin owns in the DSH locale registry. */
		const LOCALE_NS = "basicsPanel";
		/** The DSH locale service attached by the client apply (absent → browser detection). */
		let localeService;
		/** Attach (or detach, with undefined) the DSH locale service. */
		function attachLocale(service) {
			localeService = service;
		}
		/** The active locale id ('zh' | 'en'). */
		function activeLocale() {
			return localeService?.getSnapshot().active ?? (typeof navigator !== "undefined" ? navigator.language : "") ?? "en";
		}
		/** Translate a copy key; `{name}` placeholders interpolate from `params`. */
		function t(key, params) {
			let text = (activeLocale().toLowerCase().startsWith("zh") ? zh : en)[key];
			if (params !== void 0) for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
			return text;
		}
		//#endregion
		//#region src/client/api.ts
		var BasicsApiError = class extends Error {
			code;
			constructor(code, message) {
				super(message);
				this.code = code;
			}
		};
		/** Read the current session ref for skill scoping. */
		function currentSession(ctx) {
			const snap = ctx.sessions.list.getSnapshot();
			const sessionId = snap.current ?? "";
			return {
				sessionId,
				cwd: sessionId !== "" ? snap.byId[sessionId]?.cwd : void 0
			};
		}
		async function call(method, payload) {
			let response;
			try {
				response = await fetch(`/basics/api/${method}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload)
				});
			} catch (error) {
				throw new BasicsApiError("internal", `网络请求失败: ${error instanceof Error ? error.message : String(error)}`);
			}
			let body;
			try {
				body = await response.json();
			} catch {
				body = void 0;
			}
			if (body === void 0 || body.ok !== true || body.error !== void 0) throw new BasicsApiError(body?.error?.code ?? "internal", body?.error?.message ?? `HTTP ${response.status}`);
			return body.value;
		}
		function skillPayload(ref, extra) {
			return {
				sessionId: ref.sessionId,
				...ref.cwd !== void 0 ? { cwd: ref.cwd } : {},
				...extra
			};
		}
		const api = {
			skillsList(ref) {
				return call("skills.list", {
					sessionId: ref.sessionId,
					...ref.cwd !== void 0 ? { cwd: ref.cwd } : {}
				});
			},
			skillsGet(ref, name) {
				return call("skills.get", skillPayload(ref, { name }));
			},
			skillsSave(ref, name, expectedMtime, edit) {
				return call("skills.save", skillPayload(ref, {
					name,
					...expectedMtime !== void 0 ? { expectedMtime } : {},
					edit
				}));
			},
			mcpList() {
				return call("mcp.list", {});
			},
			mcpSetEnabled(path, rowId, serverName, enabled) {
				return call("mcp.setEnabled", {
					path,
					...rowId !== null ? { rowId } : {},
					serverName,
					enabled
				});
			},
			mcpSave(path, rowId, serverName, patch) {
				return call("mcp.save", {
					path,
					...rowId !== null ? { rowId } : {},
					serverName,
					patch
				});
			},
			mcpCreate(path, config) {
				return call("mcp.create", {
					...path !== null ? { path } : {},
					...config
				});
			},
			rulesList(ref) {
				return call("rules.list", {
					sessionId: ref.sessionId,
					...ref.cwd !== void 0 ? { cwd: ref.cwd } : {}
				});
			},
			rulesGet(ref, key) {
				return call("rules.get", skillPayload(ref, { key }));
			},
			rulesSave(ref, key, expectedMtime, content) {
				return call("rules.save", skillPayload(ref, {
					key,
					...expectedMtime !== void 0 ? { expectedMtime } : {},
					content
				}));
			},
			rulesCreate(ref, scope, fileName) {
				return call("rules.create", skillPayload(ref, {
					scope,
					fileName
				}));
			}
		};
		//#endregion
		//#region \0dsh-css:C:\Users\delinger\AppData\Local\Temp\dsh-Basics-Panel\src\client\panel.module.css.mjs
		const css = "._31G1ZW_section{box-sizing:border-box;flex-direction:column;gap:14px;width:100%;height:100%;min-height:0;display:flex;overflow-y:auto}._31G1ZW_intro{color:var(--dsw-alias-label-tertiary);margin:0;padding:0 2px;font-size:13px;line-height:20px}._31G1ZW_tabs{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:12px;flex:none;gap:4px;padding:4px;display:flex}._31G1ZW_tab{font:inherit;cursor:pointer;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-radius:8px;flex:1;padding:7px 12px;font-size:13px;line-height:18px}._31G1ZW_tabActive{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 2px #00000026}._31G1ZW_group{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:16px;flex-direction:column;flex:none;gap:8px;padding:16px 18px 18px;display:flex}._31G1ZW_groupHeading{color:var(--dsw-alias-label-primary);align-items:baseline;gap:7px;padding:0 2px 4px;font-size:13px;font-weight:600;line-height:20px;display:flex}._31G1ZW_groupSub{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:400;line-height:18px;overflow:hidden}._31G1ZW_count{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;margin-left:auto;font-size:12px}._31G1ZW_row{border-top:1px solid var(--dsw-alias-border-l2);align-items:center;gap:12px;padding:8px 2px;display:flex}._31G1ZW_row:first-of-type{border-top:none}._31G1ZW_rowText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}._31G1ZW_title{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}._31G1ZW_desc{color:var(--dsw-alias-label-tertiary);word-break:break-all;font-size:12px;line-height:18px}._31G1ZW_control{flex:none;align-items:center;gap:8px;display:flex}._31G1ZW_switch{cursor:pointer;display:inline-flex;position:relative}._31G1ZW_switchInput{opacity:0;cursor:pointer;width:100%;height:100%;margin:0;position:absolute}._31G1ZW_switchTrack{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);box-sizing:border-box;border-radius:10px;align-items:center;width:34px;height:20px;padding:2px;transition:background .15s;display:inline-flex}._31G1ZW_switchThumb{background:var(--dsw-alias-bg-layer-3);border-radius:50%;width:14px;height:14px;transition:transform .15s}._31G1ZW_switchInput:checked+._31G1ZW_switchTrack{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}._31G1ZW_switchInput:checked+._31G1ZW_switchTrack ._31G1ZW_switchThumb{transform:translate(14px)}._31G1ZW_switchInput:disabled+._31G1ZW_switchTrack{opacity:.5;cursor:not-allowed}._31G1ZW_switchInput:focus-visible+._31G1ZW_switchTrack{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}._31G1ZW_statusDot{border-radius:50%;flex:none;width:8px;height:8px}._31G1ZW_dotConnected{background:#22c55e}._31G1ZW_dotEnabled{background:var(--dsw-alias-brand-primary)}._31G1ZW_dotDisabled{background:var(--dsw-alias-label-tertiary)}._31G1ZW_pill{color:var(--dsw-alias-label-secondary);align-items:center;gap:4px;font-size:12px;line-height:18px;display:inline-flex}._31G1ZW_badge{color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:999px;padding:1px 8px;font-size:11px;line-height:16px;display:inline-block}._31G1ZW_mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}._31G1ZW_error{color:#f2a1a1;background:#2a1a1a;border:1px solid #f2a1a1;border-radius:8px;padding:8px 12px;font-size:12px;line-height:18px}._31G1ZW_empty{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 8px;font-size:13px}._31G1ZW_toolbar{flex-wrap:wrap;flex:none;align-items:center;gap:8px;display:flex}._31G1ZW_input{flex:1;min-width:160px}._31G1ZW_skillList{flex-direction:column;gap:8px;display:flex}._31G1ZW_skillRow{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);cursor:pointer;text-align:left;font:inherit;color:inherit;border-radius:12px;align-items:center;gap:10px;padding:10px 12px;display:flex}._31G1ZW_skillRow:hover{border-color:var(--dsw-alias-brand-primary)}._31G1ZW_skillRowReadonly{cursor:default;opacity:.75}._31G1ZW_skillMain{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}._31G1ZW_skillName{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:20px}._31G1ZW_skillDesc{color:var(--dsw-alias-label-tertiary);-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:12px;line-height:18px;display:-webkit-box;overflow:hidden}._31G1ZW_editor{flex-direction:column;gap:12px;display:flex}._31G1ZW_editorActions{justify-content:flex-end;gap:8px;display:flex}._31G1ZW_field{flex-direction:column;gap:4px;display:flex}._31G1ZW_fieldLabel{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:600;line-height:18px}._31G1ZW_textarea{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);width:100%;color:var(--dsw-alias-label-primary);font:inherit;resize:vertical;border-radius:10px;padding:10px 12px;font-size:13px}._31G1ZW_textareaMono{min-height:180px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}._31G1ZW_select{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);width:100%;color:var(--dsw-alias-label-primary);font:inherit;border-radius:10px;padding:8px 12px;font-size:13px}._31G1ZW_radioRow{cursor:pointer;align-items:flex-start;gap:9px;padding:6px 2px;display:flex}._31G1ZW_radioRow input{accent-color:var(--dsw-alias-brand-primary);margin:3px 0 0}._31G1ZW_radioText{flex-direction:column;gap:1px;min-width:0;display:flex}._31G1ZW_radioTitle{color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px}._31G1ZW_radioDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:17px}._31G1ZW_targetPreview{border:1px dashed var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);word-break:break-all;border-radius:10px;padding:8px 12px;font-size:12px;line-height:18px}._31G1ZW_button{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;border-radius:8px;padding:7px 16px;font-size:13px}._31G1ZW_buttonPrimary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}._31G1ZW_button:disabled{opacity:.5;cursor:not-allowed}";
		const tagId = "dsh-external/dsh-basics-panel/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-external/dsh-basics-panel";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"switchThumb": "_31G1ZW_switchThumb",
			"textarea": "_31G1ZW_textarea",
			"fieldLabel": "_31G1ZW_fieldLabel",
			"textareaMono": "_31G1ZW_textareaMono",
			"tab": "_31G1ZW_tab",
			"switch": "_31G1ZW_switch",
			"tabs": "_31G1ZW_tabs",
			"dotConnected": "_31G1ZW_dotConnected",
			"dotDisabled": "_31G1ZW_dotDisabled",
			"badge": "_31G1ZW_badge",
			"editor": "_31G1ZW_editor",
			"skillName": "_31G1ZW_skillName",
			"radioDesc": "_31G1ZW_radioDesc",
			"section": "_31G1ZW_section",
			"title": "_31G1ZW_title",
			"group": "_31G1ZW_group",
			"count": "_31G1ZW_count",
			"desc": "_31G1ZW_desc",
			"error": "_31G1ZW_error",
			"skillDesc": "_31G1ZW_skillDesc",
			"targetPreview": "_31G1ZW_targetPreview",
			"switchInput": "_31G1ZW_switchInput",
			"radioTitle": "_31G1ZW_radioTitle",
			"switchTrack": "_31G1ZW_switchTrack",
			"statusDot": "_31G1ZW_statusDot",
			"button": "_31G1ZW_button",
			"skillRowReadonly": "_31G1ZW_skillRowReadonly",
			"buttonPrimary": "_31G1ZW_buttonPrimary",
			"rowText": "_31G1ZW_rowText",
			"radioRow": "_31G1ZW_radioRow",
			"skillRow": "_31G1ZW_skillRow",
			"field": "_31G1ZW_field",
			"row": "_31G1ZW_row",
			"mono": "_31G1ZW_mono",
			"editorActions": "_31G1ZW_editorActions",
			"tabActive": "_31G1ZW_tabActive",
			"groupHeading": "_31G1ZW_groupHeading",
			"select": "_31G1ZW_select",
			"skillList": "_31G1ZW_skillList",
			"pill": "_31G1ZW_pill",
			"radioText": "_31G1ZW_radioText",
			"empty": "_31G1ZW_empty",
			"input": "_31G1ZW_input",
			"skillMain": "_31G1ZW_skillMain",
			"intro": "_31G1ZW_intro",
			"dotEnabled": "_31G1ZW_dotEnabled",
			"toolbar": "_31G1ZW_toolbar",
			"groupSub": "_31G1ZW_groupSub",
			"control": "_31G1ZW_control"
		};
		//#endregion
		//#region src/client/shared.tsx
		/**
		* Shared presentational primitives: a custom toggle switch (a real checkbox
		* driving a styled track/thumb) and a status dot. Feature components reuse
		* these so the panel stays visually consistent as features are added.
		*/
		/** The custom switch. */
		function Toggle(props) {
			const { checked, onChange, label, disabled } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: panel_module_css_default.switch,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					type: "checkbox",
					className: panel_module_css_default.switchInput,
					checked,
					disabled: disabled === true,
					"aria-label": label,
					onChange: (event) => {
						onChange(event.currentTarget.checked);
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.switchTrack,
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.switchThumb })
				})]
			});
		}
		/** A colored status dot. */
		function StatusDot(props) {
			const className = props.kind === "connected" ? panel_module_css_default.dotConnected : props.kind === "enabled" ? panel_module_css_default.dotEnabled : panel_module_css_default.dotDisabled;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: `${panel_module_css_default.statusDot} ${className}`,
				"aria-hidden": "true"
			});
		}
		//#endregion
		//#region src/client/features/mcp/McpSection.tsx
		/**
		* MCP feature UI: one group card per source scope, one row per server, each
		* with a status dot, transport badge, enable switch, and an expandable
		* (secret-masked) config detail. Toggling is optimistic and reverts on
		* failure; preset-scope writes show the "new session" hint.
		*/
		function scopeLabel$1(group) {
			return `${group.scope === "profile" ? t("mcpScopeProfile") : t("mcpScopePreset")} · ${group.scopeLabel}`;
		}
		function statusOf(server) {
			if (server.disabled) return {
				kind: "disabled",
				text: t("mcpDisabled")
			};
			if (server.runtime.mounted && server.runtime.toolCount > 0) return {
				kind: "connected",
				text: `${t("mcpConnected")} · ${t("mcpTools", { count: server.runtime.toolCount })}`
			};
			if (server.runtime.mounted) return {
				kind: "enabled",
				text: t("mcpEnabled")
			};
			return {
				kind: "disabled",
				text: t("mcpNotMounted")
			};
		}
		function joinArgs(args) {
			if (args === void 0 || args.length === 0) return "";
			return args.map((value) => /\s/.test(value) ? JSON.stringify(value) : value).join(" ");
		}
		function ServerConfig(props) {
			const { server } = props;
			const detail = [];
			detail.push([t("mcpFieldTransport"), server.transport]);
			if (server.command !== void 0) detail.push([t("mcpFieldCommand"), server.command]);
			if (server.args !== void 0 && server.args.length > 0) detail.push([t("mcpFieldArgs"), joinArgs(server.args)]);
			if (server.cwd !== void 0) detail.push([t("mcpFieldCwd"), server.cwd]);
			if (server.url !== void 0) detail.push([t("mcpFieldUrl"), server.url]);
			if (server.toolCallTimeoutMs !== void 0) detail.push([t("mcpFieldTimeout"), t("mcpSeconds", { count: Math.round(server.toolCallTimeoutMs / 1e3) })]);
			const envKeys = server.env === void 0 ? [] : Object.keys(server.env);
			const headerKeys = server.headers === void 0 ? [] : Object.keys(server.headers);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				detail.map(([label, value]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.row,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.title,
						children: label
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: `${panel_module_css_default.desc} ${panel_module_css_default.mono}`,
						children: value
					})]
				}, label)),
				envKeys.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.row,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.title,
						children: t("mcpFieldEnv")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: `${panel_module_css_default.desc} ${panel_module_css_default.mono}`,
						children: envKeys.map((key) => `${key}=${t("mcpMasked")}`).join("  ")
					})]
				}),
				headerKeys.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.row,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.title,
						children: t("mcpFieldHeaders")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: `${panel_module_css_default.desc} ${panel_module_css_default.mono}`,
						children: headerKeys.join("  ")
					})]
				})
			] });
		}
		const MASK = "••••";
		function McpEditor(props) {
			const { group, server, onDone } = props;
			const [serverName, setServerName] = (0, react.useState)(server.serverName);
			const [transport, setTransport] = (0, react.useState)(server.transport);
			const [command, setCommand] = (0, react.useState)(server.command ?? "");
			const [argsText, setArgsText] = (0, react.useState)(server.args !== void 0 ? JSON.stringify(server.args) : "");
			const [envText, setEnvText] = (0, react.useState)(server.env !== void 0 ? JSON.stringify(server.env, null, 2) : "");
			const [url, setUrl] = (0, react.useState)(server.url ?? "");
			const [error, setError] = (0, react.useState)(null);
			const [saving, setSaving] = (0, react.useState)(false);
			const save = () => {
				setError(null);
				let args = null;
				if (argsText.trim() !== "") try {
					const value = JSON.parse(argsText);
					if (!Array.isArray(value)) throw new Error("not-array");
					args = value;
				} catch {
					setError("args 必须是 JSON 数组，例如 [\"-y\",\"@x/mcp\"]");
					return;
				}
				let env = null;
				if (envText.trim() !== "") try {
					const value = JSON.parse(envText);
					if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("not-object");
					env = value;
				} catch {
					setError("env 必须是 JSON 对象，例如 {\"KEY\":\"value\"}");
					return;
				}
				if (env !== null) {
					for (const key of Object.keys(env)) if (env[key] === MASK) delete env[key];
				}
				setSaving(true);
				api.mcpSave(group.path, server.rowId, server.serverName, {
					serverName,
					transport,
					command: command.trim() === "" ? null : command,
					args,
					env,
					url: url.trim() === "" ? null : url
				}).then(() => {
					onDone(true);
				}).catch((caught) => {
					setError(caught instanceof Error ? caught.message : String(caught));
					setSaving(false);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.editor,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "serverName"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: panel_module_css_default.input,
							value: serverName,
							onChange: (event) => {
								setServerName(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "transport"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							className: panel_module_css_default.input,
							value: transport,
							onChange: (event) => {
								setTransport(event.currentTarget.value);
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "stdio",
									children: "stdio"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "streamable-http",
									children: "streamable-http"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "unknown",
									children: "unknown"
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "command"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: `${panel_module_css_default.input} ${panel_module_css_default.textareaMono}`,
							value: command,
							onChange: (event) => {
								setCommand(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "args（JSON 数组）"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: `${panel_module_css_default.textarea} ${panel_module_css_default.textareaMono}`,
							value: argsText,
							onChange: (event) => {
								setArgsText(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "env（JSON 对象，•••• 保留原值）"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: `${panel_module_css_default.textarea} ${panel_module_css_default.textareaMono}`,
							style: { minHeight: 80 },
							value: envText,
							onChange: (event) => {
								setEnvText(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "url"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: `${panel_module_css_default.input} ${panel_module_css_default.textareaMono}`,
							value: url,
							onChange: (event) => {
								setUrl(event.currentTarget.value);
							}
						})]
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.error,
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.editorActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: () => {
								onDone(false);
							},
							children: "取消"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
							disabled: saving,
							onClick: save,
							children: "保存"
						})]
					})
				]
			});
		}
		function McpCreateForm(props) {
			const { onDone } = props;
			const [serverName, setServerName] = (0, react.useState)("");
			const [transport, setTransport] = (0, react.useState)("stdio");
			const [command, setCommand] = (0, react.useState)("");
			const [argsText, setArgsText] = (0, react.useState)("");
			const [envText, setEnvText] = (0, react.useState)("");
			const [url, setUrl] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)(null);
			const [saving, setSaving] = (0, react.useState)(false);
			const save = () => {
				setError(null);
				if (serverName.trim() === "") {
					setError("serverName 不能为空");
					return;
				}
				let args = null;
				if (argsText.trim() !== "") try {
					const value = JSON.parse(argsText);
					if (!Array.isArray(value)) throw new Error("not-array");
					args = value;
				} catch {
					setError("args 必须是 JSON 数组，例如 [\"-y\",\"@x/mcp\"]");
					return;
				}
				let env = null;
				if (envText.trim() !== "") try {
					const value = JSON.parse(envText);
					if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("not-object");
					env = value;
				} catch {
					setError("env 必须是 JSON 对象，例如 {\"KEY\":\"value\"}");
					return;
				}
				setSaving(true);
				api.mcpCreate(null, {
					serverName: serverName.trim(),
					transport,
					command: command.trim() === "" ? null : command,
					args,
					env,
					url: url.trim() === "" ? null : url
				}).then(() => {
					onDone(true);
				}).catch((caught) => {
					setError(caught instanceof Error ? caught.message : String(caught));
					setSaving(false);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.editor,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.groupHeading,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("mcpCreate") })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "serverName"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: panel_module_css_default.input,
							value: serverName,
							onChange: (event) => {
								setServerName(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "transport"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							className: panel_module_css_default.input,
							value: transport,
							onChange: (event) => {
								setTransport(event.currentTarget.value);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "stdio",
								children: "stdio"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "streamable-http",
								children: "streamable-http"
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "command"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: `${panel_module_css_default.input} ${panel_module_css_default.textareaMono}`,
							value: command,
							onChange: (event) => {
								setCommand(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "args（JSON 数组）"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: `${panel_module_css_default.textarea} ${panel_module_css_default.textareaMono}`,
							value: argsText,
							onChange: (event) => {
								setArgsText(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "env（JSON 对象）"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: `${panel_module_css_default.textarea} ${panel_module_css_default.textareaMono}`,
							style: { minHeight: 80 },
							value: envText,
							onChange: (event) => {
								setEnvText(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "url"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: `${panel_module_css_default.input} ${panel_module_css_default.textareaMono}`,
							value: url,
							onChange: (event) => {
								setUrl(event.currentTarget.value);
							}
						})]
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.error,
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.editorActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: () => {
								onDone(false);
							},
							children: "取消"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
							disabled: saving,
							onClick: save,
							children: "保存"
						})]
					})
				]
			});
		}
		function McpSection(_props) {
			const [groups, setGroups] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [expanded, setExpanded] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [busy, setBusy] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [notice, setNotice] = (0, react.useState)(null);
			const [editing, setEditing] = (0, react.useState)(null);
			const [creating, setCreating] = (0, react.useState)(false);
			const load = () => {
				setError(null);
				api.mcpList().then((result) => {
					setGroups(result.groups);
				}).catch((caught) => {
					setError(`${t("mcpLoadFailed")}: ${caught instanceof Error ? caught.message : String(caught)}`);
				});
			};
			(0, react.useEffect)(load, []);
			const keyOf = (group, server) => `${group.path}::${server.serverName}`;
			const toggle = (group, server, next) => {
				const key = keyOf(group, server);
				if (busy.has(key)) return;
				setNotice(null);
				setGroups((prev) => prev === null ? prev : prev.map((g) => g.path === group.path ? {
					...g,
					servers: g.servers.map((s) => s.serverName === server.serverName ? {
						...s,
						disabled: !next
					} : s)
				} : g));
				setBusy((prev) => new Set(prev).add(key));
				api.mcpSetEnabled(group.path, server.rowId, server.serverName, next).then((result) => {
					setNotice(result.takesEffect === "new-session" ? t("mcpTakesEffectNewSession") : t("mcpTakesEffectLive"));
					load();
				}).catch((caught) => {
					setNotice(`${t("mcpToggleFailed")}: ${caught instanceof BasicsApiError ? caught.message : caught instanceof Error ? caught.message : String(caught)}`);
					setGroups((prev) => prev === null ? prev : prev.map((g) => g.path === group.path ? {
						...g,
						servers: g.servers.map((s) => s.serverName === server.serverName ? {
							...s,
							disabled: server.disabled
						} : s)
					} : g));
				}).finally(() => {
					setBusy((prev) => {
						const next = new Set(prev);
						next.delete(key);
						return next;
					});
				});
			};
			const flipExpanded = (key) => {
				setExpanded((prev) => {
					const next = new Set(prev);
					if (next.has(key)) next.delete(key);
					else next.add(key);
					return next;
				});
			};
			if (groups === null && error === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.empty,
				children: t("loading")
			});
			if (error !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.error,
				role: "alert",
				children: [error, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: { marginTop: 8 },
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.button,
						onClick: load,
						children: t("retry")
					})
				})]
			});
			if (creating) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: panel_module_css_default.intro,
				children: t("mcpIntro")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(McpCreateForm, { onDone: (created) => {
				setCreating(false);
				if (created) load();
			} })] });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.intro,
					children: t("mcpIntro")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.intro,
					children: t("mcpNoProject")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.toolbar,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
						onClick: () => {
							setCreating(true);
						},
						children: t("mcpCreate")
					})
				}),
				notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.pill,
					children: notice
				}),
				groups !== null && groups.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.empty,
					children: [t("mcpEmpty"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { marginTop: 8 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
							onClick: () => {
								setCreating(true);
							},
							children: t("mcpCreate")
						})
					})]
				}),
				groups?.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.group,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.groupHeading,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: scopeLabel$1(group) }),
								group.readOnly && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge,
									children: t("mcpReadOnly")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.count,
									children: group.servers.length
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: `${panel_module_css_default.groupSub} ${panel_module_css_default.mono}`,
							children: group.path
						}),
						group.servers.map((server) => {
							const key = keyOf(group, server);
							const status = statusOf(server);
							const isOpen = expanded.has(key);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.row,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusDot, { kind: status.kind }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.rowText,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.title,
											children: server.serverName
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.desc,
											children: status.text
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badge,
										children: server.transport
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.button,
										"aria-expanded": isOpen,
										onClick: () => {
											flipExpanded(key);
										},
										children: isOpen ? "−" : "+"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
										label: t("mcpToggle"),
										checked: !server.disabled,
										disabled: !server.editable || busy.has(key),
										onChange: (next) => {
											toggle(group, server, next);
										}
									})
								]
							}), isOpen && (editing === key ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(McpEditor, {
								group,
								server,
								onDone: (saved) => {
									setEditing(null);
									if (saved) load();
								}
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ServerConfig, { server }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.button,
								disabled: !server.editable,
								onClick: () => {
									setEditing(key);
								},
								children: "编辑配置"
							})] }))] }, key);
						})
					]
				}, group.path))
			] });
		}
		//#endregion
		//#region src/client/features/skills/SkillsSection.tsx
		/**
		* Skills feature UI: a searchable, scope-filtered list grouped by scope, with
		* an inline editor for the editable skills. The editor stages frontmatter
		* fields plus the Markdown body and commits through `skills.save` (the host
		* re-resolves the file path from the registry and rejects a stale mtime).
		*/
		const SCOPE_FILTERS = [
			"all",
			"project",
			"custom",
			"user",
			"bundled",
			"runtime",
			"other"
		];
		function scopeLabel(scope) {
			switch (scope) {
				case "project": return t("skillsScopeProject");
				case "custom": return t("skillsScopeCustom");
				case "user": return t("skillsScopeUser");
				case "bundled": return t("skillsScopeBundled");
				case "runtime": return t("skillsScopeRuntime");
				default: return t("skillsScopeOther");
			}
		}
		function filterLabel(scope) {
			return scope === "all" ? t("skillsFilterAll") : scopeLabel(scope);
		}
		function SkillsSection(props) {
			const { ctx } = props;
			const [groups, setGroups] = (0, react.useState)(null);
			const [complete, setComplete] = (0, react.useState)(true);
			const [error, setError] = (0, react.useState)(null);
			const [search, setSearch] = (0, react.useState)("");
			const [filter, setFilter] = (0, react.useState)("all");
			const [editing, setEditing] = (0, react.useState)(null);
			const load = () => {
				setError(null);
				api.skillsList(currentSession(ctx)).then((result) => {
					setGroups(result.groups);
					setComplete(result.complete);
				}).catch((caught) => {
					setError(caught instanceof Error ? caught.message : String(caught));
				});
			};
			(0, react.useEffect)(load, [ctx]);
			if (editing !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillsEditor, {
				ctx,
				name: editing,
				onBack: () => {
					setEditing(null);
					load();
				}
			});
			if (groups === null && error === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.empty,
				children: t("loading")
			});
			if (error !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.error,
				role: "alert",
				children: [
					t("error"),
					": ",
					error,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { marginTop: 8 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: load,
							children: t("retry")
						})
					})
				]
			});
			const needle = search.trim().toLowerCase();
			const visible = (groups ?? []).map((group) => ({
				...group,
				skills: group.skills.filter((skill) => (filter === "all" || group.scope === filter) && (needle === "" || skill.name.toLowerCase().includes(needle) || skill.description.toLowerCase().includes(needle)))
			})).filter((group) => group.skills.length > 0);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.intro,
					children: t("skillsIntro")
				}),
				!complete && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.pill,
					children: t("skillsIncomplete")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.toolbar,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "search",
						className: `${panel_module_css_default.input} ${panel_module_css_default.textarea}`,
						style: { padding: "8px 12px" },
						placeholder: t("skillsSearch"),
						value: search,
						onChange: (event) => {
							setSearch(event.currentTarget.value);
						}
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.button,
						onClick: load,
						children: t("refresh")
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.toolbar,
					children: SCOPE_FILTERS.map((scope) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: scope === filter ? `${panel_module_css_default.badge}` : panel_module_css_default.button,
						style: scope === filter ? {
							background: "var(--dsw-alias-brand-primary)",
							color: "#fff"
						} : { padding: "2px 10px" },
						"aria-pressed": scope === filter,
						onClick: () => {
							setFilter(scope);
						},
						children: filterLabel(scope)
					}, scope))
				}),
				visible.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: t("skillsNoSkills")
				}),
				visible.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.group,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.groupHeading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: scopeLabel(group.scope) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.count,
							children: group.skills.length
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.skillList,
						children: group.skills.map((skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: skill.editable ? panel_module_css_default.skillRow : `${panel_module_css_default.skillRow} ${panel_module_css_default.skillRowReadonly}`,
							onClick: () => {
								if (skill.editable) setEditing(skill.name);
							},
							title: skill.editable ? t("skillsOpen") : t("skillsReadonly"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.skillMain,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.skillName,
											children: skill.name
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.skillDesc,
											children: skill.description
										}),
										skill.location !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: `${panel_module_css_default.desc} ${panel_module_css_default.mono}`,
											children: [
												t("skillsLocation"),
												": ",
												skill.location
											]
										})
									]
								}),
								!skill.editable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge,
									children: t("skillsReadonly")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusDot, { kind: skill.editable ? "enabled" : "disabled" })
							]
						}, skill.name))
					})]
				}, group.scope))
			] });
		}
		function SkillsEditor(props) {
			const { ctx, name, onBack } = props;
			const [detail, setDetail] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [saving, setSaving] = (0, react.useState)(false);
			const [description, setDescription] = (0, react.useState)("");
			const [whenToUse, setWhenToUse] = (0, react.useState)("");
			const [metadata, setMetadata] = (0, react.useState)("");
			const [modelInvocable, setModelInvocable] = (0, react.useState)(true);
			const [userInvocable, setUserInvocable] = (0, react.useState)(true);
			const [body, setBody] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				let cancelled = false;
				api.skillsGet(currentSession(ctx), name).then((result) => {
					if (cancelled) return;
					setDetail(result);
					setDescription(result.description);
					setWhenToUse(result.whenToUse ?? "");
					setMetadata(result.metadata !== void 0 ? JSON.stringify(result.metadata, null, 2) : "");
					setModelInvocable(result.modelInvocable);
					setUserInvocable(result.userInvocable);
					setBody(result.body);
				}).catch((caught) => {
					if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
				});
				return () => {
					cancelled = true;
				};
			}, [ctx, name]);
			const save = () => {
				if (detail === null) return;
				setError(null);
				setNotice(null);
				let parsedMetadata = null;
				if (metadata.trim() !== "") try {
					const value = JSON.parse(metadata);
					if (value !== null && (typeof value !== "object" || Array.isArray(value))) {
						setError(t("skillsMetadata") + " 必须是 JSON 对象");
						return;
					}
					parsedMetadata = value;
				} catch {
					setError(t("skillsMetadata") + " 不是合法 JSON");
					return;
				}
				setSaving(true);
				api.skillsSave(currentSession(ctx), name, detail.mtime, {
					description,
					whenToUse: whenToUse.trim() === "" ? null : whenToUse,
					metadata: parsedMetadata,
					modelInvocable,
					userInvocable,
					body
				}).then(() => {
					setNotice(t("skillsSaved"));
					setSaving(false);
				}).catch((caught) => {
					const message = caught instanceof Error ? caught.message : String(caught);
					setError(`${t("skillsSaveFailed")}: ${message}`);
					setSaving(false);
				});
			};
			if (error !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.error,
				role: "alert",
				children: [
					t("error"),
					": ",
					error,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { marginTop: 8 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onBack,
							children: t("skillsBack")
						})
					})
				]
			});
			if (detail === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.empty,
				children: t("loading")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.editor,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.groupHeading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							t("skillsName"),
							": ",
							detail.name
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.badge,
							children: detail.source
						})]
					}),
					detail.path !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: `${panel_module_css_default.groupSub} ${panel_module_css_default.mono}`,
						children: detail.path
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: t("skillsDescription")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: panel_module_css_default.textarea,
							value: description,
							onChange: (event) => {
								setDescription(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: t("skillsWhenToUse")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: panel_module_css_default.textarea,
							value: whenToUse,
							onChange: (event) => {
								setWhenToUse(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: t("skillsMetadata")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: `${panel_module_css_default.textarea} ${panel_module_css_default.textareaMono}`,
							style: { minHeight: 80 },
							value: metadata,
							placeholder: "{ \"key\": \"value\" }",
							onChange: (event) => {
								setMetadata(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.row,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: panel_module_css_default.rowText,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.title,
								children: t("skillsModelInvocable")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.desc,
								children: t("skillsDisableModel")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
							checked: modelInvocable,
							onChange: setModelInvocable,
							label: t("skillsModelInvocable")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.row,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.rowText,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.title,
								children: t("skillsUserInvocable")
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
							checked: userInvocable,
							onChange: setUserInvocable,
							label: t("skillsUserInvocable")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: t("skillsBody")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: `${panel_module_css_default.textarea} ${panel_module_css_default.textareaMono}`,
							value: body,
							onChange: (event) => {
								setBody(event.currentTarget.value);
							}
						})]
					}),
					notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.pill,
						children: notice
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.editorActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onBack,
							children: t("skillsCancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
							disabled: saving,
							onClick: save,
							children: t("skillsSave")
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/features/rules/RulesSection.tsx
		/**
		* Rules feature UI: list every DSH rule file (user-global AGENTS.md plus the
		* project-root-to-cwd instruction chain), create a new rule file in one of
		* the allowed scopes, and edit an existing one. The editor stages the whole
		* file content and commits through `rules.save` (the host re-resolves the
		* path from discovery and rejects a stale mtime). Rule baselines load at
		* session start, so saves take effect for new sessions.
		*/
		const RULE_FILE_OPTIONS = [
			"AGENTS.md",
			"CLAUDE.md",
			"AGENTS.local.md",
			"CLAUDE.local.md"
		];
		const SCOPE_OPTIONS = [
			{
				scope: "global",
				title: "rulesScopeGlobal",
				desc: "rulesScopeHintGlobal"
			},
			{
				scope: "project",
				title: "rulesScopeProject",
				desc: "rulesScopeHintProject"
			},
			{
				scope: "cwd",
				title: "rulesScopeCwd",
				desc: "rulesScopeHintCwd"
			}
		];
		function formatSize(bytes) {
			return t("rulesBytes", { count: bytes });
		}
		function formatMtime(mtime) {
			try {
				return new Date(mtime).toLocaleString();
			} catch {
				return String(mtime);
			}
		}
		function RulesSection(props) {
			const { ctx } = props;
			const [groups, setGroups] = (0, react.useState)(null);
			const [cwd, setCwd] = (0, react.useState)("");
			const [projectRoot, setProjectRoot] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)(null);
			const [creating, setCreating] = (0, react.useState)(false);
			const [editingKey, setEditingKey] = (0, react.useState)(null);
			const load = () => {
				setError(null);
				api.rulesList(currentSession(ctx)).then((result) => {
					setGroups(result.groups);
					setCwd(result.cwd);
					setProjectRoot(result.projectRoot);
				}).catch((caught) => {
					setError(caught instanceof Error ? caught.message : String(caught));
				});
			};
			(0, react.useEffect)(load, [ctx]);
			if (editingKey !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RulesEditor, {
				ctx,
				ruleKey: editingKey,
				onBack: () => {
					setEditingKey(null);
					load();
				}
			});
			if (creating) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RulesCreateForm, {
				ctx,
				cwd,
				projectRoot,
				onBack: () => {
					setCreating(false);
				},
				onCreate: (key) => {
					setCreating(false);
					setEditingKey(key);
				}
			});
			if (groups === null && error === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.empty,
				children: t("loading")
			});
			if (error !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.error,
				role: "alert",
				children: [
					t("rulesLoadFailed"),
					": ",
					error,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { marginTop: 8 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: load,
							children: t("retry")
						})
					})
				]
			});
			const allRules = (groups ?? []).flatMap((group) => group.rules);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.intro,
					children: t("rulesIntro")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.toolbar,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: `${panel_module_css_default.desc} ${panel_module_css_default.mono}`,
							style: { padding: "0 2px" },
							children: [
								t("rulesSessionCwd"),
								": ",
								cwd
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
							onClick: () => {
								setCreating(true);
							},
							children: t("rulesCreate")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: load,
							children: t("refresh")
						})
					]
				}),
				allRules.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: t("rulesNoRules")
				}),
				(groups ?? []).map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.group,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.groupHeading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: group.scope === "global" ? t("rulesGlobal") : t("rulesProject") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.count,
							children: group.rules.length
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.skillList,
						children: group.rules.map((rule) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: rule.editable ? panel_module_css_default.skillRow : `${panel_module_css_default.skillRow} ${panel_module_css_default.skillRowReadonly}`,
							onClick: () => {
								if (rule.editable) setEditingKey(rule.key);
							},
							title: rule.editable ? t("rulesEdit") : t("skillsReadonly"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.skillMain,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.skillName,
											children: rule.fileName
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: `${panel_module_css_default.desc} ${panel_module_css_default.mono}`,
											children: [
												t("rulesPath"),
												": ",
												rule.displayPath
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: panel_module_css_default.skillDesc,
											children: [
												rule.size !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatSize(rule.size) }),
												rule.size !== void 0 && rule.mtime !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: " · " }),
												rule.mtime !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatMtime(rule.mtime) })
											]
										})
									]
								}),
								!rule.editable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge,
									children: t("skillsReadonly")
								}),
								rule.editable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge,
									children: t("rulesEdit")
								})
							]
						}, rule.key))
					})]
				}, group.scope))
			] });
		}
		/** The create form: pick a scope + candidate file name, then create. */
		function RulesCreateForm(props) {
			const { ctx, cwd, projectRoot, onBack, onCreate } = props;
			const [scope, setScope] = (0, react.useState)("global");
			const [fileName, setFileName] = (0, react.useState)("AGENTS.md");
			const [error, setError] = (0, react.useState)(null);
			const [creating, setCreating] = (0, react.useState)(false);
			const availableFiles = scope === "global" ? ["AGENTS.md"] : RULE_FILE_OPTIONS;
			const effectiveFile = availableFiles.includes(fileName) ? fileName : availableFiles[0] ?? "AGENTS.md";
			const targetPath = scope === "global" ? `~/.dsh/${effectiveFile}` : scope === "project" ? `${projectRoot}/${effectiveFile}` : `${cwd}/${effectiveFile}`;
			const create = () => {
				setError(null);
				setCreating(true);
				api.rulesCreate(currentSession(ctx), scope, effectiveFile).then((result) => {
					onCreate(result.key);
				}).catch((caught) => {
					setError(caught instanceof Error ? caught.message : String(caught));
					setCreating(false);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.editor,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.groupHeading,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("rulesCreate") })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: t("rulesCreateScope")
						}), SCOPE_OPTIONS.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: panel_module_css_default.radioRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "radio",
								name: "rule-scope",
								checked: scope === option.scope,
								onChange: () => {
									setScope(option.scope);
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.radioText,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.radioTitle,
									children: t(option.title)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.radioDesc,
									children: t(option.desc)
								})]
							})]
						}, option.scope))]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: t("rulesCreateName")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
							className: panel_module_css_default.select,
							value: effectiveFile,
							onChange: (event) => {
								setFileName(event.currentTarget.value);
							},
							children: availableFiles.map((file) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: file,
								children: file
							}, file))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.targetPreview,
						children: targetPath
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.error,
						role: "alert",
						children: [
							t("rulesCreateFailed"),
							": ",
							error
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.editorActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onBack,
							children: t("rulesCancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
							disabled: creating,
							onClick: create,
							children: t("rulesCreate")
						})]
					})
				]
			});
		}
		/** The editor: whole-file Markdown content with a stale-mtime guard. */
		function RulesEditor(props) {
			const { ctx, ruleKey, onBack } = props;
			const [detail, setDetail] = (0, react.useState)(null);
			const [content, setContent] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [saving, setSaving] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				let cancelled = false;
				api.rulesGet(currentSession(ctx), ruleKey).then((result) => {
					if (cancelled) return;
					setDetail(result);
					setContent(result.content);
				}).catch((caught) => {
					if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
				});
				return () => {
					cancelled = true;
				};
			}, [ctx, ruleKey]);
			const save = () => {
				if (detail === null) return;
				setError(null);
				setNotice(null);
				setSaving(true);
				api.rulesSave(currentSession(ctx), detail.key, detail.mtime, content).then((result) => {
					setDetail({
						...detail,
						mtime: result.mtime ?? detail.mtime
					});
					setNotice(t("rulesSaved"));
					setSaving(false);
				}).catch((caught) => {
					const message = caught instanceof Error ? caught.message : String(caught);
					setError(`${t("rulesSaveFailed")}: ${message}`);
					setSaving(false);
				});
			};
			if (error !== null && detail === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.error,
				role: "alert",
				children: [
					t("error"),
					": ",
					error,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { marginTop: 8 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onBack,
							children: t("rulesBack")
						})
					})
				]
			});
			if (detail === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.empty,
				children: t("loading")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.editor,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.groupHeading,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: detail.fileName }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.badge,
								children: detail.scope === "global" ? t("rulesGlobal") : t("rulesProject")
							}),
							detail.mtime !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.count,
								children: formatMtime(detail.mtime)
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: `${panel_module_css_default.groupSub} ${panel_module_css_default.mono}`,
						children: [
							t("rulesPath"),
							": ",
							detail.displayPath
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: t("rulesContent")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: `${panel_module_css_default.textarea} ${panel_module_css_default.textareaMono}`,
							style: { minHeight: 320 },
							value: content,
							onChange: (event) => {
								setContent(event.currentTarget.value);
							}
						})]
					}),
					notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.pill,
						children: notice
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.error,
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.editorActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onBack,
							children: t("rulesCancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
							disabled: saving,
							onClick: save,
							children: t("rulesSave")
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/feature-registry.tsx
		/** The ordered feature list. */
		const FEATURES = [
			{
				id: "mcp",
				label: () => t("tabMcp"),
				Component: McpSection
			},
			{
				id: "skills",
				label: () => t("tabSkills"),
				Component: SkillsSection
			},
			{
				id: "rules",
				label: () => t("tabRules"),
				Component: RulesSection
			}
		];
		//#endregion
		//#region src/client/panel.tsx
		/**
		* The "基础能力" settings section: a tab bar over the feature registry. Each
		* tab mounts its feature component inside the panel content column; the shell
		* supplies the section's `close` affordance (unused by the panel, which keeps
		* the settings shell open while the user works).
		*/
		function PanelSection(props) {
			const { ctx } = props;
			const [active, setActive] = (0, react.useState)(FEATURES[0]?.id ?? "");
			const Active = (FEATURES.find((item) => item.id === active) ?? FEATURES[0])?.Component;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.intro,
						children: t("intro")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.tabs,
						role: "tablist",
						children: FEATURES.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							"aria-selected": item.id === active,
							className: item.id === active ? `${panel_module_css_default.tab} ${panel_module_css_default.tabActive}` : panel_module_css_default.tab,
							onClick: () => {
								setActive(item.id);
							},
							children: item.label()
						}, item.id))
					}),
					Active !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Active, { ctx })
				]
			});
		}
		//#endregion
		//#region src/client/index.tsx
		/** Services required before mounting (provided by the client runtime). */
		const inject = [
			"slots",
			"sessions",
			"locale"
		];
		/**
		* Client plugin body.
		* @param ctx - the client cordis context (slots, sessions, locale).
		*/
		function apply(ctx) {
			attachLocale(ctx.locale);
			ctx.effect(() => {
				const offZh = ctx.locale.register(LOCALE_NS, "zh", zh);
				const offEn = ctx.locale.register(LOCALE_NS, "en", en);
				return () => {
					offZh();
					offEn();
				};
			}, "dsh-basics-panel: dictionaries");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "basics-panel",
				order: 200,
				label: () => t("nav"),
				inject: () => ({ ctx })
			}, PanelSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client-registry.js.map