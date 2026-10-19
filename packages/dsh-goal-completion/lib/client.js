// ===========================================================================
// dsh-goal-completion —— 浏览器半边
//
// 内核右栏里的一个标签页：显示「屏幕上的这个会话」的目标状态机，并提供官方
// GoalBar 没有的那一个动词 complete。
//
// 为什么值得单独做一个插件（2026-10-16 对 pin 的 rc.2 逐面核过）：
//   · 远端 `ctx.remote.goals` 有七个动词 get / edit / pause / resume / complete /
//     clear / create，官方 `dsh-client-ui-goal` 的 GoalBar 只暴露
//     save / cancel / pause / resume / edit / clear —— **complete 在界面上无处可点**，
//     目标只能等 agent 自己收尾（dsh-tool-goal）。人想手动结掉，今天做不到。
//   · 状态本身也有盲区：view 里的 `phase` 有四态（active / paused / **blocked** /
//     complete）加 `activation`（armed / disarmed），官方字典连 `phase.complete`
//     这个键都没有（它的四键是 active / active.disarmed / paused / blocked），
//     `blocked` 的 code+message 也不显眼，用户看见的常常是「目标不动了」。
//
// 四条口径（都是本仓库付过学费的）：
//   1. 会话取自右栏标签槽的 `inject(sessionId)`——内核给的「本标签所属会话」，
//      不去读 sessions 的当前会话字段（会话列表快照在任何 DSH 版本都没有它，
//      读了就是静默的 undefined，见 AGENTS「屏幕上的会话」那条）。
//   2. 事实源是会话投影 `projections.faceOf("goal")`（官方 GoalBar 读的就是它：goal 从投影拿、
//      activation 另走「活着的 agent」那一条线）；`remote.goals.get` 只补 activation/轮次这些
//      live 字段——agent 不活时它什么都不回（真内核实测），拿它当唯一数据源会把有目标的会话
//      显示成「还没有目标」，而手动收尾恰恰用在这种时刻。
//   3. 写状态带 CAS：`{ id, revision }` 用读到的那一份，冲突由内核拒绝，我们
//      只把被拒原文显示出来并重新读，绝不用陈旧 revision 重试第二次。
//   4. 界面一律用内核原品与设计系统字典，不自绘：
//      `ctx.locale.register(NS, {zh,en})` + 槽位 `locale: NS` → renderer 把 `t`
//      注进组件 props，切语言时出口整体重渲染（dsh-client-ui-renderer 的
//      localeSeat 以 revision 为缓存键）；状态胶囊走 `Tag` 的八档语义色，按钮走
//      `Button` 的四档 variant。**不覆盖它们的配色**——胶囊几何与色板由原品自己
//      定，插件只排位置。
//
// 完成是**终态**（phase 机里没有从 complete 回去的路，只能另建目标），所以按钮
// 要两次点击确认，且默认不自动弹出这个标签页。
// ===========================================================================
window.__ModuleLoader__.load({
	id: "@dsh-pack/dsh-goal-completion",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		const { Button, Tag } = require("@deepseek-ai/dsh-client-ui-primitives");

		/** 标签类型 id：同时是 `sidebar.right.pane.tab` 的槽 key 与 openTab 的判别值。 */
		const TAB_ID = "goal-completion";
		/** 本插件 own 的字典命名空间（内核 `goal` 那张表没有 complete 档，不借用）。 */
		const NS = "goal-completion";
		/** 目标投影的键名（内核 session.projections 里的槽位）。 */
		const PROJECTION_KEY = "goal";
		/** 「标记完成」第一击后留给第二击的窗口（毫秒）。超时回到普通按钮态。 */
		const CONFIRM_WINDOW_MS = 8000;

		// 中文键集是唯一事实源，英文逐键对齐（与内核 ui-goal/ui-plan 同一纪律）。
		const zh = {
			"tab": "目标收尾",
			"guide": "查看当前会话目标的状态，并把它标记为完成",
			"heading": "当前会话的目标",
			"phase.active": "进行中",
			"phase.active.disarmed": "未运行",
			"phase.paused": "已暂停",
			"phase.blocked": "受阻",
			"phase.complete": "已完成",
			"phase.unknown": "状态未知",
			"activation.armed": "自动续跑",
			"activation.disarmed": "不再续跑",
			"rounds": "轮次 {n} / {max}",
			"revision": "修订 {n}",
			"updated": "更新于 {time}",
			"objective.aria": "目标内容",
			"blockReason": "受阻原因",
			"action.complete": "标记完成",
			"action.confirm": "确认完成（终态，不可撤销）",
			"action.cancel": "取消",
			"action.submitting": "提交中…",
			"terminal": "目标已是终态，不能再改；要接着做就另设一个目标。",
			"done": "已标记完成。",
			"none": "这个会话还没有目标。",
			"noneHint": "目标由 agent 在对话里设立（/goal），设立后这里显示它的状态；暂停、续跑与改目标在输入区的 GoalBar 上。",
			"loading": "正在读取目标状态…",
			"unavailable": "这个会话已不可用（关闭了，或不属于当前连接）。",
			"readFailed": "读不到目标状态：",
			"actionFailed": "操作没有被接受：",
			"casHint": "目标在你读之后变过——已重新读取最新状态，请再看一眼。"
		};
		const en = {
			"tab": "Goal wrap-up",
			"guide": "See the current session's goal state and mark it complete",
			"heading": "Goal of this session",
			"phase.active": "Ongoing",
			"phase.active.disarmed": "Not running",
			"phase.paused": "Paused",
			"phase.blocked": "Blocked",
			"phase.complete": "Complete",
			"phase.unknown": "Unknown state",
			"activation.armed": "Auto-continues",
			"activation.disarmed": "No auto-continue",
			"rounds": "Rounds {n} / {max}",
			"revision": "Revision {n}",
			"updated": "Updated {time}",
			"objective.aria": "Goal objective",
			"blockReason": "Blocked because",
			"action.complete": "Mark complete",
			"action.confirm": "Confirm completion (final, cannot undo)",
			"action.cancel": "Cancel",
			"action.submitting": "Submitting…",
			"terminal": "This goal is final and can no longer change; set a new goal to keep going.",
			"done": "Marked complete.",
			"none": "This session has no goal yet.",
			"noneHint": "Goals are set by the agent in the conversation (/goal); this tab then shows its state. Pause, resume and edit live in the GoalBar below the input.",
			"loading": "Reading the goal state…",
			"unavailable": "This session is no longer available (closed, or not on this connection).",
			"readFailed": "Could not read the goal state: ",
			"actionFailed": "The action was not accepted: ",
			"casHint": "The goal changed after you read it — the latest state has been reloaded, take another look."
		};

		/**
		 * 四态 → Tag 的语义档（取自原品自己的定义：info=分类而非健康度、neutral=无状态
		 * 含义的事实、warning=需要留意但还不算失败、success=已达成）。
		 */
		const PHASE_TONE = { active: "info", paused: "neutral", blocked: "warning", complete: "success" };

		const CSS = [
			".dgc-root{flex-direction:column;gap:12px;padding:16px;display:flex}",
			".dgc-card{border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;flex-direction:column;gap:10px;padding:14px;display:flex}",
			".dgc-head{align-items:center;gap:8px;display:flex}",
			".dgc-title{font-size:13px;font-weight:600;line-height:20px;flex:1;min-width:0}",
			".dgc-obj{font-size:14px;line-height:22px;word-break:break-word;margin:0}",
			".dgc-meta{color:var(--dsw-alias-label-tertiary);flex-wrap:wrap;gap:4px 12px;font-size:12px;line-height:18px;display:flex}",
			".dgc-block{border-left:2px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;padding-left:8px}",
			".dgc-note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:0}",
			".dgc-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin:0}",
			".dgc-row{align-items:center;gap:8px;display:flex}"
		].join("");

		const CSS_TAG = "@dsh-pack/dsh-goal-completion/client.css";
		function ensureCss() {
			if (typeof document === "undefined") return;
			if (document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG) + "]")) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-pack/dsh-goal-completion";
			tag.dataset.pluginCss = CSS_TAG;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		function messageOf(error) {
			if (error === undefined || error === null) return "未知错误";
			if (typeof error === "string") return error;
			return String(error.message || error);
		}

		/** view → 本地化时刻；内核给的是 epoch 毫秒，缺失时留空而不写「NaN」。 */
		function clockOf(ms) {
			if (typeof ms !== "number" || !isFinite(ms)) return "";
			try {
				return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
			} catch {
				return "";
			}
		}

		/**
		 * 「这一份载荷真是一个目标吗」——只认带 string id 的对象。
		 * 真内核实测（2026-10-16，隔离安装布局）：`goals.get` 的服务端签名是
		 * 「无当前目标时回 undefined」，而 @Remote 走 JSON 线，undefined 到浏览器端
		 * 就成了 null / 缺字段。只判 `view === undefined` 会把「没有目标」当成有目标，
		 * 于是界面画出一张「状态未知」的卡并给出可点的「标记完成」（点了必被拒）。
		 */
		function isGoalView(view) {
			return !!view && typeof view === "object" && typeof view.id === "string" && view.id !== "";
		}

		/**
		 * 远端返回的信封 → 载荷。
		 *
		 * 真内核实测（2026-10-16，隔离安装布局）：`ctx.remote.goals.get(sessionId)` 回的是
		 * `{ok:true, value:{id, revision, objective, phase, activation, …}}`，**不是裸 view**。
		 * 按裸 view 解析时 `view.id` 永远是 undefined，界面就把有目标的会话显示成「还没有目标」
		 * （同一条线 GoalBar 正常显示「未运行的目标」）。两种形状都收：信封优先，裸载荷兜底。
		 */
		function envelopeError(result) {
			const error = result && result.error;
			if (!error) return "远端没有接受这次调用";
			return messageOf(error.message ? error.message : error);
		}

		function unwrap(result) {
			if (result && typeof result === "object" && "ok" in result) {
				return result.ok === true ? result.value : undefined;
			}
			return result;
		}

		/**
		 * 投影快照 + 活着的 live 载荷 → 界面那一份 view。
		 *
		 * 为什么两条线都要（同日实测）：投影那份是 `{goal:{id,revision,objective,phase,
		 * maxGoalRounds}, roundsStarted, createdAt, updatedAt}`——**没有 activation**；
		 * activation 只在远端那份 live 载荷里。官方 GoalBar 也是同一套组合（goal 从投影拿，
		 * activation 另走一条观测线）。拿 get 当唯一数据源会在读不到 live 时整块失明，
		 * 拿投影当唯一数据源则永远说不清「还在不在自动续跑」。
		 */
		function viewOfProjection(projection, live) {
			const goal = projection && typeof projection === "object" ? projection.goal : undefined;
			if (!isGoalView(goal)) return isGoalView(live) ? { ...live } : undefined;
			const view = { ...goal };
			for (const field of ["roundsStarted", "createdAt", "updatedAt"]) {
				if (typeof projection[field] === "number") view[field] = projection[field];
			}
			if (isGoalView(live) && live.id === goal.id && live.revision === goal.revision) {
				if (live.activation !== undefined) view.activation = live.activation;
				if (typeof live.roundsStarted === "number") view.roundsStarted = live.roundsStarted;
			}
			return view;
		}

		/** 载荷 → 快照（「有目标 / 还没有目标」两态的唯一口径，判据只有 isGoalView 一处）。 */
		function stateOf(view) {
			const goal = isGoalView(view) ? view : undefined;
			return { status: goal === undefined ? "none" : "ready", view: goal, error: "" };
		}

		/** phase(+activation) → 字典键：active 且 disarmed 是内核字典里单独的一档。 */
		function phaseKey(view) {
			if (!view || typeof view.phase !== "string" || !(view.phase in PHASE_TONE)) return "phase.unknown";
			if (view.phase === "active" && view.activation === "disarmed") return "phase.active.disarmed";
			return "phase." + view.phase;
		}

		// -------------------------------------------------------------------------
		// 目标状态仓：投影是事实源，`goals.get` 只补「活着的 agent」才有的 activation。
		// -------------------------------------------------------------------------
		/**
		 * @param {object} deps - { sessionId, sessions, goals, onEvent?, onReset? }
		 * @returns 快照仓（getSnapshot / subscribe / start / stop / refresh / adopt）
		 */
		function createGoalStore(deps) {
			let snapshot = { status: "loading", view: undefined, error: "" };
			let live;   // 最近一次 live 线（`goals.get`）读到的载荷——只用来补 activation
			const listeners = new Set();
			let started = false;
			let offFace, offEvent, offReset;

			const emit = () => { for (const fn of [...listeners]) fn(); };
			const adopt = (next) => {
				// 引用比较对远端读没有意义（每次都是新对象），按内容去抖，免得每次信号都重渲染。
				if (next.status === snapshot.status && next.error === snapshot.error
					&& JSON.stringify(next.view ?? null) === JSON.stringify(snapshot.view ?? null)) return;
				snapshot = next;
				emit();
			};
			const binding = () => {
				try {
					return deps.sessions.binding(deps.sessionId);
				} catch {
					return undefined;
				}
			};
			const face = () => {
				try {
					return binding()?.session?.projections?.faceOf?.(PROJECTION_KEY);
				} catch {
					return undefined;
				}
			};
			/** 同步那一条线：投影快照 → 快照态。投影面缺席时回 false（交回 live 线兜底）。 */
			const sync = () => {
				const f = face();
				if (f === undefined || typeof f.getSnapshot !== "function") return false;
				adopt(stateOf(viewOfProjection(f.getSnapshot(), live)));
				return true;
			};

			async function refresh() {
				if (binding() === undefined) {
					adopt({ status: "unavailable", view: undefined, error: "" });
					return;
				}
				const settled = sync();
				let result;
				try {
					result = await deps.goals.get(deps.sessionId);
				} catch (error) {
					// live 线读不到不是界面失败：投影已经给出目标就照常显示。
					if (!settled) adopt({ status: "error", view: snapshot.view, error: messageOf(error) });
					return;
				}
				if (result && result.ok === false) {
					live = undefined;
					if (!settled) adopt({ status: "error", view: snapshot.view, error: envelopeError(result) });
					return;
				}
				const next = unwrap(result);
				live = isGoalView(next) ? next : undefined;
				if (!sync()) adopt(stateOf(live));
			}

			function start() {
				if (started) return stop;
				started = true;
				const f = face();
				if (f !== undefined && typeof f.subscribe === "function") {
					try {
						// 投影变更 → 先同步那份（瞬时），再走一遍 live（activation 只在那里）。
						// 官方 goal 的 activation source 同样是「投影推进就重读」，不另发明一套。
						offFace = f.subscribe(() => { void refresh(); });
					} catch { /* 投影面缺席：只剩事件与手动刷新两条信号 */ }
				}
				if (typeof deps.onEvent === "function") {
					try {
						offEvent = deps.onEvent("goal/activation-changed", (event) => {
							if (event && event.sessionId === deps.sessionId) void refresh();
						});
					} catch { /* 事件面缺席：不致命，投影与首轮读仍在 */ }
				}
				if (typeof deps.onReset === "function") {
					try {
						offReset = deps.onReset(() => { void refresh(); });
					} catch { /* 同上 */ }
				}
				void refresh();
				return stop;
			}

			function stop() {
				if (!started) return;
				started = false;
				for (const off of [offFace, offEvent, offReset]) {
					try { if (typeof off === "function") off(); } catch { /* 拆除失败不拖垮宿主 */ }
				}
				offFace = offEvent = offReset = undefined;
			}

			return {
				getSnapshot: () => snapshot,
				subscribe(fn) {
					listeners.add(fn);
					return () => { listeners.delete(fn); };
				},
				start,
				stop,
				refresh,
				/**
				 * 动词的返回值：先当 live 载荷收下（新写出的 activation 就在里面），再走一遍
				 * 两条线的合成——投影通常已被同一批会话事件推进，落后的那一小步由它兜住。
				 */
				adopt(view) {
					if (isGoalView(view)) live = view;
					if (!sync()) adopt(stateOf(live));
				}
			};
		}

		// -------------------------------------------------------------------------
		// 标签主体
		// -------------------------------------------------------------------------
		function GoalPane({ sessionId, runtime, t }) {
			const store = react.useMemo(
				() => createGoalStore({ sessionId, sessions: runtime.sessions, goals: runtime.goals, onEvent: runtime.onEvent, onReset: runtime.onReset }),
				[sessionId, runtime]
			);
			react.useEffect(() => store.start(), [store]);
			const snap = react.useSyncExternalStore(store.subscribe, store.getSnapshot);
			const [confirming, setConfirming] = react.useState(false);
			const [pending, setPending] = react.useState(false);
			const [action, setAction] = react.useState({ error: "", done: false });
			const timer = react.useRef(null);

			const clearTimer = () => {
				if (timer.current !== null) {
					clearTimeout(timer.current);
					timer.current = null;
				}
			};
			react.useEffect(() => clearTimer, []);

			const view = snap.view;
			const terminal = view !== undefined && view.phase === "complete";

			async function commit() {
				clearTimer();
				setConfirming(false);
				if (view === undefined) return;
				setPending(true);
				setAction({ error: "", done: false });
				let result;
				try {
					// CAS：用读到的 id + revision，冲突交给内核判（口径 3）。
					result = await runtime.goals.complete(sessionId, { id: view.id, revision: view.revision });
				} catch (error) {
					setPending(false);
					setAction({ error: messageOf(error), done: false });
					await store.refresh();
					return;
				}
				setPending(false);
				// 远端动词回的是信封（{ ok, value } / { ok:false, error }，与 get 同形）：
				// 被拒时把原文显示出来并重读——界面继续拿着陈旧 revision 的话，下次确认还是同一场冲突。
				if (result && result.ok === false) {
					setAction({ error: envelopeError(result), done: false });
					await store.refresh();
					return;
				}
				setAction({ error: "", done: true });
				const value = unwrap(result);
				if (isGoalView(value)) store.adopt(value);
				else await store.refresh();
			}

			const body = [];
			if (snap.status === "loading") body.push(react_jsx_runtime.jsx("p", { className: "dgc-note", children: t("loading") }, "loading"));
			if (snap.status === "unavailable") body.push(react_jsx_runtime.jsx("p", { className: "dgc-note", children: t("unavailable") }, "unavailable"));
			if (snap.status === "none") {
				body.push(react_jsx_runtime.jsx("p", { className: "dgc-note", children: t("none") }, "none"));
				body.push(react_jsx_runtime.jsx("p", { className: "dgc-note", children: t("noneHint") }, "none-hint"));
			}
			if (view !== undefined) {
				const key = phaseKey(view);
				const meta = [];
				if (typeof view.maxGoalRounds === "number") {
					meta.push(t("rounds", { n: Number(view.roundsStarted ?? 0), max: view.maxGoalRounds }));
				}
				if (typeof view.revision === "number") meta.push(t("revision", { n: view.revision }));
				// activation 只有 live 那条线知道（投影里没有这个字段）：不知道就不硬说。
				if (view.activation === "armed" || view.activation === "disarmed") {
					meta.push(t(view.activation === "armed" ? "activation.armed" : "activation.disarmed"));
				}
				const updated = clockOf(view.updatedAt);
				if (updated !== "") meta.push(t("updated", { time: updated }));
				body.push(react_jsx_runtime.jsxs("div", { className: "dgc-head", children: [
					react_jsx_runtime.jsx("div", { className: "dgc-title", children: t("heading") }),
					react_jsx_runtime.jsx(Tag, {
						tone: PHASE_TONE[view.phase] ?? "outline",
						children: t(key)
					}, "phase")
				] }, "head"));
				body.push(react_jsx_runtime.jsx("p", {
					className: "dgc-obj",
					title: t("objective.aria"),
					children: String(view.objective ?? "")
				}, "objective"));
				body.push(react_jsx_runtime.jsx("div", { className: "dgc-meta", children: meta.map((piece, i) => react_jsx_runtime.jsx("span", { children: piece }, i)) }, "meta"));
				if (view.phase === "blocked" && view.blockedReason) {
					body.push(react_jsx_runtime.jsx("div", { className: "dgc-block", children: [
						t("blockReason") + "：",
						String(view.blockedReason.message ?? ""),
						view.blockedReason.code ? "（" + view.blockedReason.code + "）" : ""
					] }, "block"));
				}
				if (terminal) body.push(react_jsx_runtime.jsx("p", { className: "dgc-note", children: t("terminal") }, "terminal"));
			}
			if (snap.status === "error") {
				body.push(react_jsx_runtime.jsx("p", { className: "dgc-error", children: t("readFailed") + snap.error }, "read-error"));
			}
			if (action.error !== "") {
				body.push(react_jsx_runtime.jsxs("p", { className: "dgc-error", children: [t("actionFailed") + action.error, " ", t("casHint")] }, "action-error"));
			}
			if (action.done) body.push(react_jsx_runtime.jsx("p", { className: "dgc-note", children: t("done") }, "done"));

			const controls = [];
			if (view !== undefined && !terminal) {
				controls.push(react_jsx_runtime.jsx(Button, {
					variant: confirming ? "outline" : "primary",
					size: "sm",
					disabled: pending,
					onClick: () => {
						if (confirming) { void commit(); return; }
						setAction({ error: "", done: false });
						setConfirming(true);
						clearTimer();
						timer.current = setTimeout(() => { timer.current = null; setConfirming(false); }, CONFIRM_WINDOW_MS);
					},
					children: pending ? t("action.submitting") : confirming ? t("action.confirm") : t("action.complete")
				}, "complete"));
				if (confirming && !pending) controls.push(react_jsx_runtime.jsx(Button, {
					variant: "ghost",
					size: "sm",
					onClick: () => { clearTimer(); setConfirming(false); },
					children: t("action.cancel")
				}, "cancel"));
			}
			if (controls.length > 0) body.push(react_jsx_runtime.jsx("div", { className: "dgc-row", children: controls }, "controls"));

			return react_jsx_runtime.jsx("div", { className: "dgc-root", children: react_jsx_runtime.jsx("div", { className: "dgc-card", children: body }) });
		}

		// -------------------------------------------------------------------------
		// 插件入口
		// -------------------------------------------------------------------------
		/**
		 * 客户端半边主体。`sidebarRightTabs` 用 ctx.inject 的**可选**接法拿：
		 * 写进 exports.inject 会让缺这套件的内核（0.1.6 前无原生右栏）判定本插件
		 * 装配失败、整包不加载；这里降级成「不注册标签」，其余功能照旧。
		 */
		function apply(ctx) {
			ensureCss();
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-goal-completion: dictionaries");
			const t = ctx.locale.bind(NS);
			const runtime = { sessions: ctx.sessions, goals: ctx.remote.goals };
			if (typeof ctx.remote.$on === "function") {
				runtime.onEvent = (name, listener) => ctx.remote.$on(name, listener);
			}
			if (typeof ctx.on === "function") {
				runtime.onReset = (listener) => ctx.on("connection/reset", listener);
			}
			ctx.inject(["sidebarRightTabs"], (injected) => {
				let tabs;
				try {
					tabs = injected.get("sidebarRightTabs");
				} catch {
					tabs = undefined;
				}
				if (tabs === undefined || typeof tabs.register !== "function") return;
				const disposeType = tabs.register({
					id: TAB_ID,
					kind: TAB_ID,
					priority: "extension",
					title: () => t("tab"),
					// 空右栏的引导页会把每个注册类型的 guide 条目渲染成一枚可点胶囊，
					// 这就是本标签的唯一入口（不自动弹出：完成是终态，弹窗式引导会逼人误点）。
					guide: [{ id: TAB_ID, order: 60, title: () => t("tab"), description: () => t("guide") }]
				});
				const offSlot = ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
					name: "sidebar.right.pane.tab",
					key: TAB_ID,
					locale: NS,
					inject: (sessionId) => ({ sessionId, runtime })
				}, GoalPane), "dsh-goal-completion: right pane tab body");
				return () => {
					try { if (typeof offSlot === "function") offSlot(); } catch { /* 拆除失败不拖垮宿主 */ }
					try { if (typeof disposeType === "function") disposeType(); } catch { /* 同上 */ }
				};
			});
		}

		exports.apply = apply;
		exports.inject = ["slots", "locale", "remote", "remote.goals", "sessions"];
		// 纯函数与状态仓暴露给单测（不触发 DOM / React 副作用），口径对齐
		// dsh-balance / dsh-client-file-changes 的同名惯例。
		exports.__internals = {
			TAB_ID,
			NS,
			PROJECTION_KEY,
			CONFIRM_WINDOW_MS,
			zh,
			en,
			PHASE_TONE,
			CSS,
			CSS_TAG,
			messageOf,
			clockOf,
			isGoalView,
			viewOfProjection,
			unwrap,
			envelopeError,
			stateOf,
			phaseKey,
			createGoalStore,
			GoalPane
		};
		return module.exports;
	}
});
