window.__ModuleLoader__.load({
	id: "@dsh-pack/dsh-prompt-optimizer",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  BUTTON_CLASS: () => BUTTON_CLASS,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// src/client/OptimizeButton.tsx
var import_react2 = require("react");

// src/client/SparkleIcon.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function SparkleIcon(props) {
  const size = props.size ?? 14;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      style: { display: "block", flexShrink: 0 },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "path",
          {
            d: "M10 2 L11.6 8.4 L18 10 L11.6 11.6 L10 18 L8.4 11.6 L2 10 L8.4 8.4 Z",
            fill: "currentColor"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "path",
          {
            d: "M17.5 14 L18.3 16.7 L21 17.5 L18.3 18.3 L17.5 21 L16.7 18.3 L14 17.5 L16.7 16.7 Z",
            fill: "currentColor"
          }
        ),
        props.spinning && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("animate", { attributeName: "opacity", values: "1;0.35;1", dur: "1.1s", repeatCount: "indefinite" })
      ]
    }
  );
}

// src/client/i18n.ts
var import_react = require("react");
var face = null;
function installLocaleFace(next) {
  face = next;
}
var dict = {
  zh: {
    "button.optimize": "\u4F18\u5316",
    "button.optimizing": "\u4F18\u5316\u4E2D\u2026",
    "button.title": "\u5206\u6790\u5E76\u4F18\u5316\u5F53\u524D\u8F93\u5165\u7684\u63D0\u793A\u8BCD",
    "button.titleEmpty": "\u5148\u5728\u8F93\u5165\u6846\u8F93\u5165\u63D0\u793A\u8BCD",
    "panel.aria": "\u63D0\u793A\u8BCD\u4F18\u5316",
    "panel.title": "\u63D0\u793A\u8BCD\u4F18\u5316",
    "panel.closeTitle": "\u5173\u95ED (Esc)",
    "panel.close": "\u5173\u95ED",
    "panel.stage.waiting": "\u7B49\u5F85\u6A21\u578B\u54CD\u5E94",
    "panel.stage.analyzing": "\u6B63\u5728\u5206\u6790\u8BCA\u65AD",
    "panel.stage.writing": "\u6B63\u5728\u8F93\u51FA\u4F18\u5316\u7A3F",
    "panel.escCancel": "Esc \u53D6\u6D88",
    "panel.analysis": "\u5206\u6790\u8BCA\u65AD",
    "panel.optimized": "\u4F18\u5316\u7ED3\u679C",
    "panel.error": "\u51FA\u9519\u4E86",
    "panel.cancelled": "\u5DF2\u53D6\u6D88\u4F18\u5316,\u4EE5\u4E0B\u4E3A\u5DF2\u751F\u6210\u7684\u90E8\u5206\u5185\u5BB9\u3002",
    "panel.retry": "\u91CD\u8BD5",
    "panel.replace": "\u66FF\u6362\u8F93\u5165\u6846",
    "panel.copy": "\u590D\u5236",
    "panel.copied": "\u5DF2\u590D\u5236 \u2713",
    "panel.reoptimize": "\u91CD\u65B0\u4F18\u5316",
    "panel.reoptimizeTitle": "\u91CD\u65B0\u8FD0\u884C\u4F18\u5316:\u82E5\u8349\u7A3F\u76F8\u5BF9\u4E0A\u4E00\u8F6E\u7ED3\u679C\u6709\u6539\u52A8,\u4F1A\u643A\u5E26\u4E0A\u8F6E\u7ED3\u679C\u7EED\u6539;\u5426\u5219\u5168\u65B0\u751F\u6210",
    "panel.undo": "\u64A4\u56DE",
    "panel.appliedShort": "\u5DF2\u66FF\u6362 \u2713",
    "panel.undoneShort": "\u5DF2\u64A4\u56DE \u2713",
    "panel.fallback": "\u5DF2\u56DE\u9000",
    "panel.duration": "\u7528\u65F6",
    "panel.truncated": "\u8F93\u51FA\u8FBE\u5230 Token \u4E0A\u9650\u88AB\u622A\u65AD\u3002\u53EF\u5728\u8BBE\u7F6E\u7684\u63D2\u4EF6\u9875\u300C\u63D0\u793A\u8BCD\u4F18\u5316\u300D\u4E2D\u8C03\u9AD8\u300C\u6700\u5927\u8F93\u51FA Token\u300D\u3002",
    "panel.notWellFormed": "\u6A21\u578B\u672A\u5B8C\u5168\u9075\u5B88\u8F93\u51FA\u683C\u5F0F,\u4EE5\u4E0A\u5185\u5BB9\u53EF\u80FD\u6DF7\u5165\u591A\u4F59\u6587\u5B57,\u66FF\u6362\u524D\u8BF7\u626B\u4E00\u773C\u3002",
    "settings.loading": "\u8BBE\u7F6E\u52A0\u8F7D\u4E2D\u2026",
    // 0.2.1-rc.2 删除了 ConfigFormSnapshot.mode('host' | 'memory'):设置只可能是
    // 宿主持久化,不再有浏览器进程内内存模式。文案随之去掉「内存模式」措辞,
    // 只保留「这份部署不对外提供该命名空间 / 当前只读」两种真实状态。
    "settings.unavailable": "\u5F53\u524D\u5BBF\u4E3B\u672A\u5411\u6B64\u9875\u9762\u5F00\u653E\u672C\u63D2\u4EF6\u7684\u8BBE\u7F6E\u547D\u540D\u7A7A\u95F4;\u53EF\u7528\u7EC4\u5408\u5C42\u914D\u7F6E,\u6216\u5728 dsh \u8BBE\u7F6E\u4E2D\u68C0\u67E5\u63D2\u4EF6\u662F\u5426\u542F\u7528\u3002",
    "settings.readOnly": "\u5F53\u524D\u8BBE\u7F6E\u53EA\u8BFB:\u5BBF\u4E3B\u62D2\u7EDD\u5199\u5165,\u6539\u52A8\u4E0D\u4F1A\u4FDD\u5B58\u3002",
    "settings.undo": "\u64A4\u9500\u4E0A\u4E00\u6B21\u4FEE\u6539",
    "settings.undoTitle": "\u6062\u590D\u8FD9\u6B21\u4FEE\u6539\u524D\u7684\u5168\u90E8\u8BBE\u7F6E(\u4EC5\u672C\u6B21\u9875\u9762\u4F1A\u8BDD\u5185\u53EF\u64A4\u9500)",
    "settings.group.model": "\u6A21\u578B",
    "settings.group.params": "\u8C03\u7528\u53C2\u6570",
    "settings.group.context": "\u4E0A\u4E0B\u6587",
    "settings.model": "\u4F18\u5316\u7528\u6A21\u578B",
    "settings.model.follow": "\u8DDF\u968F\u5F53\u524D\u4F1A\u8BDD(\u9ED8\u8BA4)",
    "settings.model.desc": "\u7559\u7A7A\u8DDF\u968F\u4F1A\u8BDD;\u56FA\u5B9A\u540E\u6240\u6709\u4F18\u5316\u90FD\u7528\u8FD9\u4E2A\u6A21\u578B",
    "settings.refresh": "\u21BB \u5237\u65B0",
    "settings.refreshTitle": "\u91CD\u65B0\u62C9\u53D6\u6A21\u578B\u76EE\u5F55(\u65B0\u589E\u63D0\u4F9B\u65B9/\u6A21\u578B\u540E\u4F7F\u7528)",
    "settings.fallbackModel": "\u56DE\u9000\u6A21\u578B",
    "settings.fallbackModel.none": "\u65E0(\u9ED8\u8BA4)",
    "settings.fallbackModel.desc": "\u4E3B\u8DEF\u7531\u672A\u4EA7\u51FA\u5185\u5BB9\u5373\u5931\u8D25\u65F6\u81EA\u52A8\u6362\u7528",
    "settings.test": "\u6A21\u578B\u8FDE\u901A\u6027",
    "settings.test.desc": "\u6309\u540C\u4E00\u8DEF\u7531\u53D1\u4E00\u4E2A\u5C0F\u63A2\u6D3B\u8C03\u7528",
    "settings.test.run": "\u6D4B\u8BD5\u8FDE\u63A5",
    "settings.test.running": "\u6D4B\u8BD5\u4E2D\u2026",
    "settings.test.ok": "\u8FDE\u63A5\u6B63\u5E38:{provider} / {model}({latencyMs}ms)",
    "settings.language": "\u8F93\u51FA\u8BED\u8A00",
    "settings.language.desc": "\u4F18\u5316\u7ED3\u679C\u4F7F\u7528\u7684\u8BED\u8A00",
    "settings.mode": "\u4F18\u5316\u6A21\u5F0F",
    "settings.mode.desc": "\u5FEB\u901F\u6A21\u5F0F\u8F93\u51FA\u4E0E\u7B49\u5F85\u7EA6\u51CF\u534A;\u5B8C\u6574\u6A21\u5F0F\u591A\u4E00\u6BB5\u5206\u6790\u8BCA\u65AD",
    "settings.mode.full": "\u5B8C\u6574(\u5206\u6790\u8BCA\u65AD + \u4F18\u5316)",
    "settings.mode.fast": "\u5FEB\u901F(\u4EC5\u4F18\u5316,\u7B49\u5F85\u7EA6\u51CF\u534A)",
    "settings.mode.full.short": "\u5B8C\u6574",
    "settings.mode.fast.short": "\u5FEB\u901F",
    "settings.effort": "\u63A8\u7406\u5F3A\u5EA6",
    "settings.effort.desc": "\u63A8\u7406\u6A21\u578B\u4E0A,\u6700\u4F4E\u6863\u663E\u8457\u7F29\u77ED\u7B49\u5F85",
    "settings.effort.lowest": "\u964D\u5230\u6700\u4F4E\u6863(\u9ED8\u8BA4,\u63A8\u7406\u6A21\u578B\u66F4\u5FEB)",
    "settings.effort.session": "\u8DDF\u968F\u5F53\u524D\u4F1A\u8BDD",
    "settings.effort.lowest.short": "\u6700\u4F4E\u6863",
    "settings.effort.session.short": "\u8DDF\u968F\u4F1A\u8BDD",
    "settings.maxTokens": "\u6700\u5927\u8F93\u51FA Token",
    "settings.maxTokens.desc": "\u5355\u6B21\u4F18\u5316\u8C03\u7528\u7684\u8F93\u51FA\u4E0A\u9650",
    "settings.timeout": "\u8D85\u65F6\u65F6\u95F4(\u79D2)",
    "settings.timeout.desc": "\u8D85\u65F6\u540E\u4E2D\u6B62\u8C03\u7528\u5E76\u7ED9\u51FA\u63D0\u793A",
    "settings.temperature": "\u91C7\u6837\u6E29\u5EA6",
    "settings.temperatureTitle": "\u4F18\u5316\u662F\u683C\u5F0F\u5316\u4EFB\u52A1,\u4F4E\u6E29\u8F93\u51FA\u66F4\u7A33\u5B9A;\u9ED8\u8BA4 0.2,\u4E00\u822C\u65E0\u9700\u8C03\u6574",
    "settings.temperature.desc": "\u4F4E\u6E29\u8F93\u51FA\u66F4\u7A33\u5B9A(\u9ED8\u8BA4 0.2)",
    "settings.autoMaxTokens": "\u8F93\u51FA\u4E0A\u9650\u81EA\u9002\u5E94",
    "settings.autoMaxTokens.desc": "\u957F\u8349\u7A3F\u81EA\u52A8\u63D0\u9AD8\u4E0A\u9650,\u907F\u514D\u622A\u65AD",
    "settings.includeContext": "\u643A\u5E26\u4E0A\u4E0B\u6587",
    "settings.includeContext.desc": "\u53C2\u8003\u6700\u8FD1\u5BF9\u8BDD,\u4F18\u5316\u65B9\u5411\u66F4\u8D34\u5408",
    "settings.validate.maxTokens": "\u8BF7\u8F93\u5165 1024\u201332768 \u4E4B\u95F4\u7684\u6570\u5B57",
    "settings.validate.timeout": "\u8BF7\u8F93\u5165 10\u2013600 \u4E4B\u95F4\u7684\u6570\u5B57",
    "settings.validate.temperature": "\u8BF7\u8F93\u5165 0\u20132 \u4E4B\u95F4\u7684\u6570\u5B57",
    "settings.repoTitle": "\u5728 GitHub \u4E0A\u67E5\u770B\u6E90\u7801 / \u53CD\u9988\u95EE\u9898"
  },
  en: {
    "button.optimize": "Optimize",
    "button.optimizing": "Optimizing\u2026",
    "button.title": "Analyze and optimize the prompt in the input box",
    "button.titleEmpty": "Type a prompt in the input box first",
    "panel.aria": "Prompt optimizer",
    "panel.title": "Prompt Optimizer",
    "panel.closeTitle": "Close (Esc)",
    "panel.close": "Close",
    "panel.stage.waiting": "Waiting for the model",
    "panel.stage.analyzing": "Analyzing",
    "panel.stage.writing": "Writing the optimized prompt",
    "panel.escCancel": "Esc to cancel",
    "panel.analysis": "Analysis",
    "panel.optimized": "Optimized Prompt",
    "panel.error": "Something went wrong",
    "panel.cancelled": "Optimization cancelled; below is the partial output generated so far.",
    "panel.retry": "Retry",
    "panel.replace": "Replace Input",
    "panel.copy": "Copy",
    "panel.copied": "Copied \u2713",
    "panel.reoptimize": "Re-optimize",
    "panel.reoptimizeTitle": "Re-runs optimization: carries the previous result only if the draft changed since then; otherwise regenerates fresh",
    "panel.undo": "Undo",
    "panel.appliedShort": "Applied \u2713",
    "panel.undoneShort": "Undone \u2713",
    "panel.fallback": "fallback",
    "panel.duration": "took",
    "panel.truncated": 'Output hit the token cap and was truncated. Raise "Max output tokens" in the "Prompt Optimizer" tab of the plugins settings page.',
    "panel.notWellFormed": "The model did not fully follow the output format; the content above may contain extra text \u2014 review before replacing.",
    "settings.loading": "Loading settings\u2026",
    // 0.2.1-rc.2 removed ConfigFormSnapshot.mode ('host' | 'memory'): settings are
    // always Host-persisted now, there is no process-local memory mode.
    "settings.unavailable": "This Host does not expose the plugin settings namespace to this page; use composition config, or check that the plugin is enabled.",
    "settings.readOnly": "Settings are read-only: the Host refuses writes, so changes will not be saved.",
    "settings.undo": "Undo last change",
    "settings.undoTitle": "Restore all settings to before this change (undo is session-only)",
    "settings.group.model": "Model",
    "settings.group.params": "Generation parameters",
    "settings.group.context": "Context",
    "settings.model": "Optimizer model",
    "settings.model.follow": "Follow current session (default)",
    "settings.model.desc": "Leave empty to follow the session; pin one to always optimize with it",
    "settings.refresh": "\u21BB Refresh",
    "settings.refreshTitle": "Reload the model catalog (after adding providers/models)",
    "settings.fallbackModel": "Fallback model",
    "settings.fallbackModel.none": "None (default)",
    "settings.fallbackModel.desc": "Switched to automatically when the main route fails before producing output",
    "settings.test": "Connectivity",
    "settings.test.desc": "Sends a tiny probe call through the same routing",
    "settings.test.run": "Test connection",
    "settings.test.running": "Testing\u2026",
    "settings.test.ok": "Connected: {provider} / {model} ({latencyMs}ms)",
    "settings.language": "Output language",
    "settings.language.desc": "Language of the optimized result",
    "settings.mode": "Mode",
    "settings.mode.desc": "Fast halves the output tokens and the wait; full adds an analysis pass",
    "settings.mode.full": "Full (analysis + rewrite)",
    "settings.mode.fast": "Fast (rewrite only, ~half the wait)",
    "settings.mode.full.short": "Full",
    "settings.mode.fast.short": "Fast",
    "settings.effort": "Reasoning effort",
    "settings.effort.desc": "On reasoning models the lowest tier shortens the wait significantly",
    "settings.effort.lowest": "Clamp to lowest tier (default, faster on reasoning models)",
    "settings.effort.session": "Follow current session",
    "settings.effort.lowest.short": "Lowest",
    "settings.effort.session.short": "Follow session",
    "settings.maxTokens": "Max output tokens",
    "settings.maxTokens.desc": "Output cap per optimization call",
    "settings.timeout": "Timeout (seconds)",
    "settings.timeout.desc": "The call is aborted and reported after this many seconds",
    "settings.temperature": "Temperature",
    "settings.temperatureTitle": "Optimization is a formatting task \u2014 low temperature gives stabler output; default 0.2, usually no need to change",
    "settings.temperature.desc": "Low temperature gives stabler output (default 0.2)",
    "settings.autoMaxTokens": "Adaptive output cap",
    "settings.autoMaxTokens.desc": "Raise the cap for long drafts instead of truncating them",
    "settings.includeContext": "Include context",
    "settings.includeContext.desc": "Read recent conversation so the rewrite matches your intent",
    "settings.validate.maxTokens": "Enter a number between 1024 and 32768",
    "settings.validate.timeout": "Enter a number between 10 and 600",
    "settings.validate.temperature": "Enter a number between 0 and 2",
    "settings.repoTitle": "View source / report issues on GitHub"
  }
};
function translate(key, params) {
  const active = face?.getSnapshot().active === "en" ? "en" : "zh";
  return interpolate(dict[active][key] ?? dict.zh[key], params);
}
function interpolate(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name2) => params[name2] !== void 0 ? String(params[name2]) : m);
}
function useT() {
  const active = (0, import_react.useSyncExternalStore)(
    (callback) => face?.subscribe(callback) ?? (() => {
    }),
    () => face?.getSnapshot().active === "en" ? "en" : "zh"
  );
  return (key, params) => interpolate(dict[active][key] ?? dict.zh[key], params);
}

// src/client/OptimizeButton.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var buttonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 12px",
  fontSize: 12,
  lineHeight: "18px",
  borderRadius: 999,
  border: "none",
  color: "var(--dsw-alias-label-primary, inherit)",
  cursor: "pointer",
  whiteSpace: "nowrap"
  // 宽度贴住内容,不预留「优化中…」的空位(用户反馈空闲态「优化」右侧空白);
  // 加载态文案不变、仅图标旋转,宽度恒定,工具行不抖动(U4 原目标改由
  // 恒定文案达成,minWidth 随之移除)。
  // 底色与 hover 态走注入样式表的 .dsh-po-opt 规则(inline 会盖过 :hover)。
};
function createOptimizeButton(controller) {
  return function OptimizeButton(props) {
    const state = (0, import_react2.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
    const t = useT();
    const p = props;
    const input = p.useInput ? p.useInput((s) => s) : p.input;
    const draft = input?.draft ?? "";
    const empty = !draft.trim();
    const loading = state.status === "loading";
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { display: "inline-flex" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "button",
      {
        className: "dsh-po-btn dsh-po-opt",
        type: "button",
        style: { ...buttonStyle, ...empty || loading ? { opacity: 0.45, cursor: "not-allowed" } : {} },
        disabled: empty || loading,
        title: loading ? t("button.optimizing") : empty ? t("button.titleEmpty") : t("button.title"),
        onClick: () => void controller.optimize(draft, p.sessionId),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SparkleIcon, { spinning: loading }),
          t("button.optimize")
        ]
      }
    ) });
  };
}

// src/client/ResultDock.tsx
var import_react3 = require("react");

// src/client/host-faces.ts
async function sessionCatalog(connection, signal) {
  const call = connection?.rpc?.call;
  if (!call) return { ok: false, error: "\u8FDE\u63A5\u5C42 RPC \u901A\u9053\u5728\u5F53\u524D dsh \u7248\u672C\u7F3A\u5E2D" };
  const result = await call("/api", "session/modelCatalog", { args: {} }, signal);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, value: { groups: result.value.groups ?? [], failures: result.value.failures } };
}
function legacyQueryFace(connection) {
  return connection?.api;
}
function sessionEventEntries(sessions, sessionId) {
  const binding = sessions?.binding?.(sessionId);
  const window = binding?.eventSource?.getSnapshot();
  return window?.entries;
}

// src/prompt.ts
var MARKERS = {
  analysis: "<<<ANALYSIS>>>",
  optimized: "<<<OPTIMIZED>>>",
  end: "<<<END>>>"
};
var FORMAT_FULL_ZH = `# \u8F93\u51FA\u683C\u5F0F(\u4E25\u683C\u9075\u5B88,\u6807\u8BB0\u884C\u5355\u72EC\u6210\u884C)
${MARKERS.optimized}
\u8F93\u51FA\u4F18\u5316\u540E\u7684\u5B8C\u6574\u63D0\u793A\u8BCD\u5168\u6587
${MARKERS.analysis}
\u6309\u7EF4\u5EA6\u9010\u6761\u8F93\u51FA\u8BCA\u65AD,\u6BCF\u6761\u4E00\u884C,\u683C\u5F0F:\u300C\u7EF4\u5EA6 | \u95EE\u9898 | \u5EFA\u8BAE\u300D\u3002\u67D0\u7EF4\u5EA6\u65E0\u660E\u663E\u95EE\u9898\u65F6\u5199:\u300C\u7EF4\u5EA6 | \u65E0\u660E\u663E\u95EE\u9898 | -\u300D\u3002
${MARKERS.end}

\u9664\u4E0A\u8FF0\u6807\u8BB0\u5305\u88F9\u7684\u5185\u5BB9\u5916,\u4E0D\u8981\u8F93\u51FA\u4EFB\u4F55\u5176\u4ED6\u6587\u5B57\u3002`;
var FORMAT_FULL_EN = `# Output format (strictly follow; markers on their own lines)
${MARKERS.optimized}
The full optimized prompt text
${MARKERS.analysis}
One finding per line: "dimension | issue | suggestion". If a dimension is fine: "dimension | no issue | -".
${MARKERS.end}

Do not output anything outside these markers.`;
var FORMAT_FAST_ZH = `# \u8F93\u51FA\u683C\u5F0F(\u4E25\u683C\u9075\u5B88,\u6807\u8BB0\u884C\u5355\u72EC\u6210\u884C)
${MARKERS.optimized}
\u8F93\u51FA\u4F18\u5316\u540E\u7684\u5B8C\u6574\u63D0\u793A\u8BCD\u5168\u6587
${MARKERS.end}

\u9664\u4E0A\u8FF0\u6807\u8BB0\u5305\u88F9\u7684\u5185\u5BB9\u5916,\u4E0D\u8981\u8F93\u51FA\u4EFB\u4F55\u5176\u4ED6\u6587\u5B57\u3002`;
var FORMAT_FAST_EN = `# Output format (strictly follow; markers on their own lines)
${MARKERS.optimized}
The full optimized prompt text
${MARKERS.end}

Do not output anything outside these markers.`;
var CONTEXT_MAX_TURNS = 8;
var CONTEXT_MAX_CHARS = 1600;
var CONTEXT_TURN_MAX_CHARS = 600;
var CONTEXT_MIN_USER_TURNS = 1;
var CONTEXT_USER_BUDGET = 800;
function capConversationContext(turns) {
  const recent = turns.filter((t) => t.text.trim()).slice(-CONTEXT_MAX_TURNS).map((t) => ({
    role: t.role,
    text: t.text.trim().length > CONTEXT_TURN_MAX_CHARS ? `${t.text.trim().slice(0, CONTEXT_TURN_MAX_CHARS)}\u2026` : t.text.trim()
  }));
  if (recent.length === 0) return [];
  const indexed = recent.map((turn, index) => ({ turn, index }));
  const kept = /* @__PURE__ */ new Map();
  let budget = CONTEXT_MAX_CHARS;
  const users = indexed.filter((x) => x.turn.role === "user");
  let userBudget = Math.min(CONTEXT_USER_BUDGET, budget);
  for (let i = users.length - 1; i >= 0; i--) {
    const { turn, index } = users[i];
    const keptUsers = users.length - i;
    const mustKeep = keptUsers <= CONTEXT_MIN_USER_TURNS && ![...kept.values()].some((t) => t.role === "user");
    if (turn.text.length <= userBudget) {
      kept.set(index, turn);
      userBudget -= turn.text.length;
      budget -= turn.text.length;
    } else if (mustKeep) {
      const slice = userBudget > 16 ? userBudget : Math.min(16, budget);
      if (slice > 0) {
        kept.set(index, { role: turn.role, text: `${turn.text.slice(0, slice)}\u2026` });
        userBudget -= slice;
        budget -= slice;
      }
    }
  }
  const assistants = indexed.filter((x) => x.turn.role === "assistant");
  for (let i = assistants.length - 1; i >= 0; i--) {
    const { turn, index } = assistants[i];
    if (turn.text.length > budget) continue;
    kept.set(index, turn);
    budget -= turn.text.length;
  }
  return [...kept.entries()].sort(([a], [b]) => a - b).map(([, turn]) => turn);
}
function findMarker(text, word, fromIndex = 0) {
  const re = new RegExp(`<<<\\s*${word}\\s*>>>`, "g");
  re.lastIndex = fromIndex;
  const match = re.exec(text);
  return match ? { index: match.index, length: match[0].length } : null;
}
function findLastMarker(text, word, beforeIndex = text.length) {
  const re = new RegExp(`<<<\\s*${word}\\s*>>>`, "g");
  let last = null;
  for (const match of text.matchAll(re)) {
    if (match.index >= beforeIndex) break;
    last = { index: match.index, length: match[0].length };
  }
  return last;
}
function findNextMarker(text, fromIndex) {
  const re = /<<<\s*(?:ANALYSIS|OPTIMIZED|END)\s*>>>/g;
  re.lastIndex = fromIndex;
  const match = re.exec(text);
  return match ? { index: match.index, length: match[0].length } : null;
}
function segmentAfter(text, marker) {
  const firstEnd = findMarker(text, "END");
  if (firstEnd && marker.index > firstEnd.index) return "";
  const start = marker.index + marker.length;
  const next = findNextMarker(text, start);
  let end = next ? next.index : text.length;
  if (firstEnd && firstEnd.index > start && firstEnd.index < end) end = firstEnd.index;
  return text.slice(start, end).trim();
}
var THINK_OPEN = "<think>";
var THINK_CLOSE = "</think>";
function stripThinkBlocks(text) {
  let out = "";
  let rest = text;
  for (; ; ) {
    const open = rest.indexOf(THINK_OPEN);
    if (open === -1) return out + rest;
    out += rest.slice(0, open);
    const close = rest.indexOf(THINK_CLOSE, open + THINK_OPEN.length);
    if (close === -1) return out;
    rest = rest.slice(close + THINK_CLOSE.length);
  }
}
function parsePartialOptimizerOutput(raw) {
  const text = stripThinkBlocks(raw);
  const o = findLastMarker(text, "OPTIMIZED");
  const a = findLastMarker(text, "ANALYSIS");
  return {
    analysis: a ? segmentAfter(text, a) : "",
    optimized: o ? segmentAfter(text, o) : ""
  };
}
function compactPartialBuffer(raw) {
  const o = findLastMarker(raw, "OPTIMIZED");
  const a = findLastMarker(raw, "ANALYSIS");
  if (o && a && o.index < a.index) {
    return {
      compacted: `${MARKERS.analysis}
${raw.slice(a.index + a.length)}`,
      analysis: "",
      optimized: raw.slice(o.index + o.length, a.index).trim()
    };
  }
  if (o) {
    const analysis = a && a.index < o.index ? raw.slice(a.index + a.length, o.index).trim() : "";
    return { compacted: `${MARKERS.optimized}
${raw.slice(o.index + o.length)}`, analysis, optimized: "" };
  }
  return { compacted: null, analysis: "", optimized: "" };
}

// src/client/controller.ts
var ROUTE = "/dsh-prompt-optimizer/optimize";
var INITIAL = { open: false, status: "idle", error: null, result: null, live: null, last: null, applied: null };
function splitCommandPrefix(text) {
  const trimmed = text.trim();
  const match = /^(\/[A-Za-z][\w-]*)(?:\s+([\s\S]+))?$/.exec(trimmed);
  if (!match) return { body: trimmed };
  if (!match[2] || !match[2].trim()) return { body: trimmed, commandOnly: true };
  return { prefix: match[1], body: match[2].trim() };
}
function joinLast(last) {
  return last.prefix ? `${last.prefix} ${last.text}` : last.text;
}
function shouldAutoClose(input) {
  if (!input.open || input.status === "loading") return false;
  return !input.draft.trim() || !input.prevRunning && input.running || input.queued > input.prevQueued;
}
function flattenText(content) {
  if (!Array.isArray(content)) return "";
  return content.map(
    (block) => block && typeof block === "object" && block.type === "text" ? String(block.text ?? "") : ""
  ).filter(Boolean).join("\n").trim();
}
function sampleContextTurns(turns) {
  const users = turns.map((t, i) => ({ t, i })).filter((x) => x.t.role === "user").slice(-4);
  const assistants = turns.map((t, i) => ({ t, i })).filter((x) => x.t.role === "assistant").slice(-4);
  const merged = [...users, ...assistants].sort((a, b) => a.i - b.i).map((x) => x.t);
  return capConversationContext(merged);
}
function extractContextTurns(entries) {
  const turns = [];
  for (const entry of entries) {
    const event = entry?.event;
    if (!event || typeof event !== "object") continue;
    if (event.type === "user/message") {
      const data = event.data;
      if (data?.source?.kind !== "user") continue;
      const text = flattenText(data.content);
      if (text) turns.push({ role: "user", text });
    } else if (event.type === "assistant/message") {
      const data = event.data;
      const text = flattenText(data?.message?.content);
      if (text) turns.push({ role: "assistant", text });
    }
  }
  return sampleContextTurns(turns);
}
function createOptimizerController(ctx, opts = {}) {
  let state = INITIAL;
  const listeners = /* @__PURE__ */ new Set();
  let abort = null;
  let liveRaw = "";
  let frozenAnalysis = "";
  let frozenOptimized = "";
  let liveTimer = null;
  const clearLiveTimer = () => {
    if (liveTimer) {
      clearTimeout(liveTimer);
      liveTimer = null;
    }
  };
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  async function optimize(text, sessionId) {
    const split = splitCommandPrefix(text);
    const { prefix, body: draft } = split;
    if (!draft || state.status === "loading") return;
    if (split.commandOnly) {
      set({
        open: true,
        status: "error",
        error: "\u68C0\u6D4B\u5230\u659C\u6760\u547D\u4EE4\u4F46\u6CA1\u6709\u6B63\u6587:\u8BF7\u5148\u8F93\u5165\u8981\u4F18\u5316\u7684\u5185\u5BB9\u3002",
        live: null,
        last: { text: draft, sessionId }
      });
      return;
    }
    const previous = state.result && state.result.wellFormed && state.last?.sessionId === sessionId && state.last.text !== draft && (opts.isContextEnabled?.() ?? true) ? state.result.optimized : void 0;
    abort?.abort();
    clearLiveTimer();
    liveRaw = "";
    frozenAnalysis = "";
    frozenOptimized = "";
    const controller = new AbortController();
    abort = controller;
    const watchdogMs = Math.max(1e3, opts.getWatchdogMs?.() ?? 125e3);
    let clientTimedOut = false;
    const watchdog = setTimeout(() => {
      clientTimedOut = true;
      controller.abort();
    }, watchdogMs);
    const failTimeout = () => {
      clearLiveTimer();
      const seconds = Math.round(watchdogMs / 1e3);
      set({
        status: "error",
        live: null,
        error: `\u8BF7\u6C42\u8D85\u65F6(\u5BA2\u6237\u7AEF ${seconds} \u79D2\u65E0\u54CD\u5E94,Host \u53EF\u80FD\u672A\u8FD0\u884C)\u3002\u53EF\u5728 \u8BBE\u7F6E\u7684\u63D2\u4EF6\u9875\u300C\u63D0\u793A\u8BCD\u4F18\u5316\u300D \u4E2D\u8C03\u9AD8\u300C\u8D85\u65F6\u65F6\u95F4\u300D\u3002`
      });
    };
    const startedAt = Date.now();
    set({ open: true, status: "loading", error: null, live: { analysis: "", optimized: "" }, last: { text: draft, sessionId, prefix }, applied: null });
    try {
      const [selection, context] = await Promise.all([
        (async () => {
          if (opts.isModelPinned?.()) return void 0;
          try {
            const directories = opts.getSessionModelDirectories?.();
            if (!directories) {
              console.warn("[dsh-prompt-optimizer] \u4F1A\u8BDD\u6A21\u578B\u76EE\u5F55\u670D\u52A1\u5728\u5F53\u524D dsh \u7248\u672C\u7F3A\u5E2D,\u6539\u7528 Host \u56DE\u9000");
              return void 0;
            }
            const state2 = await directories.directoryFor(sessionId).load();
            const current = state2.current;
            if (current?.provider && current.model) {
              return { provider: current.provider, model: current.model, reasoningEffort: current.reasoningEffort };
            }
            console.warn("[dsh-prompt-optimizer] \u4F1A\u8BDD\u6CA1\u6709\u53EF\u7528\u7684\u6A21\u578B\u9009\u62E9,\u6539\u7528 Host \u56DE\u9000:", state2.error ?? current);
          } catch (cause) {
            console.warn("[dsh-prompt-optimizer] \u4F1A\u8BDD\u6A21\u578B\u67E5\u8BE2\u5931\u8D25,\u6539\u7528 Host \u56DE\u9000:", cause);
          }
          return void 0;
        })(),
        (async () => {
          if (!(opts.isContextEnabled?.() ?? true)) return void 0;
          try {
            const entries = sessionEventEntries(opts.getSessions?.(), sessionId);
            if (entries?.length) {
              const turns = extractContextTurns(entries);
              if (turns.length) return turns;
              console.warn("[dsh-prompt-optimizer] \u4F1A\u8BDD\u4E8B\u4EF6\u7A97\u53E3\u91CC\u6CA1\u6709\u53EF\u7528\u7684\u5BF9\u8BDD,\u5C1D\u8BD5\u65E7\u67E5\u8BE2\u9762");
            } else {
              console.warn("[dsh-prompt-optimizer] \u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u53EF\u8BFB\u7684\u4E8B\u4EF6\u7A97\u53E3,\u5C1D\u8BD5\u65E7\u67E5\u8BE2\u9762");
            }
          } catch (cause) {
            console.warn("[dsh-prompt-optimizer] \u8BFB\u53D6\u4F1A\u8BDD\u4E8B\u4EF6\u7A97\u53E3\u5931\u8D25,\u5C1D\u8BD5\u65E7\u67E5\u8BE2\u9762:", cause);
          }
          try {
            const history = legacyQueryFace(ctx.connection)?.sessions?.history;
            if (!history) {
              console.warn("[dsh-prompt-optimizer] \u4F1A\u8BDD\u5386\u53F2\u67E5\u8BE2\u9762\u5728\u5F53\u524D dsh \u7248\u672C\u7F3A\u5E2D,\u6309\u65E0\u4E0A\u4E0B\u6587\u4F18\u5316");
              return void 0;
            }
            const result = await history({ sessionId, maxMessages: 24 }, controller.signal);
            if (result.ok) {
              const turns = extractContextTurns(result.value.events ?? []);
              return turns.length ? turns : void 0;
            }
            console.warn("[dsh-prompt-optimizer] \u4F1A\u8BDD\u5386\u53F2\u67E5\u8BE2\u88AB\u62D2\u7EDD,\u6309\u65E0\u4E0A\u4E0B\u6587\u4F18\u5316:", result.error);
          } catch (cause) {
            console.warn("[dsh-prompt-optimizer] \u4F1A\u8BDD\u5386\u53F2\u67E5\u8BE2\u5931\u8D25,\u6309\u65E0\u4E0A\u4E0B\u6587\u4F18\u5316:", cause);
          }
          return void 0;
        })()
      ]);
      const resp = await fetch(ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // sessionId 随请求带给 Host:Host 把它标注到 llm 调用上,要求会话头
        // 的提供方(如 opencode 的 x-opencode-session)才能路由成功,同时
        // 会话级计量会把这次调用归属到当前会话。
        body: JSON.stringify({ text: draft, sessionId, provider: selection?.provider, model: selection?.model, reasoningEffort: selection?.reasoningEffort, context, previous }),
        signal: controller.signal
      });
      if (!resp.ok || !(resp.headers.get("content-type") ?? "").includes("text/event-stream")) {
        const data = await resp.json().catch(() => null);
        if (!controller.signal.aborted) {
          set({ status: "error", live: null, error: String(data?.error ?? `\u8BF7\u6C42\u5931\u8D25(HTTP ${resp.status})`) });
        }
        return;
      }
      const reader = resp.body?.getReader();
      if (!reader) throw new Error("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u6D41\u5F0F\u54CD\u5E94");
      const decoder = new TextDecoder();
      let buffer = "";
      let terminal = false;
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let event;
          try {
            event = JSON.parse(line.slice(5).trim());
          } catch {
            console.warn("[dsh-prompt-optimizer] \u8DF3\u8FC7\u65E0\u6CD5\u89E3\u6790\u7684 SSE \u5E27:", line.slice(0, 120));
            continue;
          }
          if (event.type === "delta") {
            liveRaw += String(event.text ?? "");
            if (!liveTimer) {
              liveTimer = setTimeout(() => {
                liveTimer = null;
                if (state.status === "loading" && abort === controller) {
                  const comp = compactPartialBuffer(liveRaw);
                  if (comp.compacted !== null) {
                    if (comp.analysis) frozenAnalysis = comp.analysis;
                    if (comp.optimized) frozenOptimized = comp.optimized;
                    liveRaw = comp.compacted;
                  }
                  const partial = parsePartialOptimizerOutput(liveRaw);
                  const live = { analysis: partial.analysis || frozenAnalysis, optimized: partial.optimized || frozenOptimized };
                  if (opts.isFastMode?.() && !live.analysis && !live.optimized && liveRaw.trim() && !liveRaw.includes("<<<")) {
                    live.optimized = liveRaw.trim();
                  }
                  set({ live });
                }
              }, 50);
            }
          } else if (event.type === "done") {
            terminal = true;
            clearLiveTimer();
            set({
              status: "done",
              live: null,
              result: {
                analysis: String(event.analysis ?? ""),
                optimized: String(event.optimized ?? ""),
                wellFormed: event.wellFormed !== false,
                truncated: event.truncated === true,
                provider: String(event.provider ?? ""),
                model: String(event.model ?? ""),
                fallbackUsed: event.fallbackUsed === true,
                fallbackReason: typeof event.fallbackReason === "string" && event.fallbackReason ? event.fallbackReason : void 0,
                durationMs: Date.now() - startedAt
              }
            });
          } else if (event.type === "error") {
            terminal = true;
            clearLiveTimer();
            set({ status: "error", live: null, error: String(event.error ?? "\u672A\u77E5\u9519\u8BEF") });
          }
        }
      }
      if (!terminal) {
        if (!controller.signal.aborted) {
          clearLiveTimer();
          set({ status: "error", live: null, error: "\u8FDE\u63A5\u4E2D\u65AD:\u54CD\u5E94\u6D41\u63D0\u524D\u7ED3\u675F" });
        } else if (clientTimedOut && abort === controller) {
          failTimeout();
        }
      }
    } catch (cause) {
      if (controller.signal.aborted) {
        if (clientTimedOut && abort === controller) failTimeout();
        return;
      }
      set({ status: "error", live: null, error: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      clearTimeout(watchdog);
    }
  }
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
    optimize,
    retry() {
      if (state.last) void optimize(joinLast(state.last), state.last.sessionId);
    },
    markApplied(applied) {
      set({ applied });
    },
    clearApplied() {
      if (state.applied) set({ applied: null });
    },
    close() {
      abort?.abort();
      abort = null;
      clearLiveTimer();
      set({ ...INITIAL });
    },
    /**
     * O2:loading 中取消(Esc)。与 close 不同:中止请求但不清空状态,
     * 面板定格展示已生成的部分——用户等了几十秒的内容不应一键蒸发。
     * 后续可「重新优化」续跑或「关闭」彻底收起。
     */
    cancel() {
      if (state.status !== "loading") return;
      abort?.abort();
      abort = null;
      clearLiveTimer();
      set({ status: "cancelled" });
    }
  };
}

// src/client/ResultDock.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
var styles = {
  panel: {
    marginBottom: 6,
    borderRadius: 12,
    border: "1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.3))",
    background: "var(--dsw-alias-bg-layer-2, #fff)",
    color: "var(--dsw-alias-label-primary, inherit)",
    // 阴影从 0.12 降到与官方输入卡同档的极淡弥散(0.03~0.05):
    // 之前的重投影在白底上晕出一圈灰,是面板「显灰显大」的另一来源。
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03), 0 4px 14px rgba(0, 0, 0, 0.05)",
    padding: "8px 10px",
    fontSize: 12.5,
    lineHeight: 1.5,
    fontFamily: "var(--dsw-font-family, inherit)"
  },
  header: { display: "flex", alignItems: "center", gap: 6, marginBottom: 2 },
  title: { fontWeight: 600, flex: 1 },
  modelBadge: {
    fontSize: 11,
    color: "var(--dsw-alias-label-primary-dimmed, rgba(128,128,128,0.9))",
    border: "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.25))",
    borderRadius: 999,
    padding: "0 8px"
  },
  close: {
    border: "none",
    background: "transparent",
    color: "var(--dsw-alias-label-primary-dimmed, inherit)",
    cursor: "pointer",
    fontSize: 14,
    padding: "0 4px"
  },
  // U5:分析与优化各自独立滚动区(原先单容器 maxHeight 嵌套出现双滚动条),
  // 长内容不再互相挤压;外层 body 不限高,滚动归属到各段内部。
  body: { paddingRight: 4 },
  analysisBody: { maxHeight: "14vh", overflowY: "auto", marginTop: 2 },
  optimizedBox: {
    // 层面令牌在浅色主题下是纯白,填充不可见,用细描边给出容器感(不引入灰底)。
    background: "var(--dsw-alias-bg-layer-3, transparent)",
    border: "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,0.2))",
    borderRadius: 8,
    padding: "5px 8px",
    maxHeight: "22vh",
    overflowY: "auto",
    marginTop: 2
  },
  sectionTitle: {
    // U5:段落标题可点击折叠;去掉默认按钮外观。
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    color: "var(--dsw-alias-label-primary-dimmed, rgba(128,128,128,0.9))",
    margin: "5px 0 2px",
    padding: 0,
    border: "none",
    background: "none",
    font: "inherit",
    cursor: "pointer",
    textAlign: "left"
  },
  chevron: { fontSize: 9, transition: "transform 0.15s ease" },
  pre: { margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit" },
  actions: { display: "flex", gap: 8, marginTop: 6 },
  actionBtn: {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 10px",
    fontSize: 12,
    borderRadius: 6,
    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.4))",
    // 幽灵按钮:button-tool-bar-fill 在当前主题是 50% 灰(#54555780),整排灰块
    // 是面板显灰的主因,改为透明底 + 细描边,与输入卡的工具按钮同语言。
    background: "transparent",
    color: "var(--dsw-alias-label-primary, inherit)",
    cursor: "pointer"
  },
  primaryBtn: {
    background: "var(--dsw-alias-button-primary-fill, #3b6ef6)",
    borderColor: "transparent",
    color: "var(--dsw-alias-label-primary-inverted, #fff)"
  },
  errorText: { color: "var(--dsw-alias-state-error-primary, #e5534b)", whiteSpace: "pre-wrap" },
  // U7/O6:头部状态条(绿色描边小徽章)。
  statusChip: {
    fontSize: 11,
    color: "var(--dsw-alias-state-success-primary, #2da44e)",
    border: "1px solid currentColor",
    borderRadius: 999,
    padding: "0 8px",
    whiteSpace: "nowrap"
  },
  // U10/R5:质量警示(truncated / notWellFormed)从灰色小字升级为描边警示框,
  // 让「替换前请检查」被真正看到;notWellFormed 横幅置于内容区顶部(R5)。
  warnBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 8,
    padding: "6px 8px",
    fontSize: 12,
    lineHeight: 1.5,
    borderRadius: 6,
    border: "1px solid var(--dsw-alias-state-warn-primary, #d4a72c)",
    background: "var(--dsw-alias-state-warn-bg, rgba(212, 167, 44, 0.12))",
    color: "var(--dsw-alias-state-warn-primary, #d4a72c)"
  },
  cancelledHint: {
    fontSize: 12,
    color: "var(--dsw-alias-state-warn-primary, #d4a72c)",
    padding: "4px 0 2px"
  },
  loading: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "var(--dsw-alias-label-primary-dimmed, inherit)",
    padding: "8px 0"
  }
};
function createResultDock(controller) {
  return function OptimizerResultDock(props) {
    const state = (0, import_react3.useSyncExternalStore)(controller.subscribe, controller.getSnapshot);
    const t = useT();
    const [copied, setCopied] = (0, import_react3.useState)(false);
    const [analysisOpen, setAnalysisOpen] = (0, import_react3.useState)(true);
    const [undoneFlash, setUndoneFlash] = (0, import_react3.useState)(false);
    const p = props;
    const input = (p.useInput ? p.useInput((s) => s) : p.input) ?? {};
    const session = (p.useSession ? p.useSession((s) => s) : p.session) ?? {};
    const inputActions = p.inputActions;
    const owns = state.open && state.last?.sessionId === p.sessionId;
    (0, import_react3.useEffect)(() => {
      if (!owns) return;
      const onKey = (event) => {
        if (event.key !== "Escape") return;
        if (controller.getSnapshot().status === "loading") controller.cancel();
        else controller.close();
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [owns]);
    const applied = state.applied;
    const draft = input.draft ?? "";
    const running = Boolean(session.running);
    const queued = session.queue?.length ?? 0;
    const prevRef = (0, import_react3.useRef)({ running, queued });
    (0, import_react3.useEffect)(() => {
      const prev = prevRef.current;
      prevRef.current = { running, queued };
      if (!owns) return;
      if (shouldAutoClose({ open: true, status: state.status, draft, prevRunning: prev.running, running, prevQueued: prev.queued, queued })) {
        controller.close();
        return;
      }
      if (applied && draft !== applied.text) controller.clearApplied();
    }, [draft, applied, owns, state.status, running, queued]);
    const [elapsed, setElapsed] = (0, import_react3.useState)(0);
    (0, import_react3.useEffect)(() => {
      if (state.status !== "loading") return;
      const started = Date.now();
      setElapsed(0);
      const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1e3)), 1e3);
      return () => clearInterval(timer);
    }, [state.status]);
    (0, import_react3.useEffect)(() => {
      if (!undoneFlash) return;
      const timer = setTimeout(() => setUndoneFlash(false), 2500);
      return () => clearTimeout(timer);
    }, [undoneFlash]);
    const liveBoxRef = (0, import_react3.useRef)(null);
    const stickRef = (0, import_react3.useRef)(true);
    (0, import_react3.useEffect)(() => {
      if (state.status === "loading") stickRef.current = true;
    }, [state.status]);
    (0, import_react3.useEffect)(() => {
      const el = liveBoxRef.current;
      if (!el || state.status !== "loading") return;
      if (stickRef.current) el.scrollTop = el.scrollHeight;
    }, [state.live, state.status]);
    const onLiveScroll = () => {
      const el = liveBoxRef.current;
      if (!el) return;
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 28;
    };
    if (!owns) return null;
    const { result } = state;
    const stage = state.live?.optimized ? t("panel.stage.writing") : state.live?.analysis ? t("panel.stage.analyzing") : t("panel.stage.waiting");
    const liveBody = state.live && (state.live.analysis || state.live.optimized) ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { ref: liveBoxRef, onScroll: onLiveScroll, style: { ...styles.body, maxHeight: "34vh", overflowY: "auto", marginTop: 2 }, children: [
      state.live.analysis && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: styles.sectionTitle, children: t("panel.analysis") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("pre", { style: styles.pre, children: state.live.analysis })
      ] }),
      state.live.optimized && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: styles.sectionTitle, children: t("panel.optimized") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: styles.optimizedBox, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("pre", { style: styles.pre, children: state.live.optimized }) })
      ] })
    ] }) : null;
    const onCopy = async () => {
      if (!result) return;
      setCopied(await copyText(result.optimized));
      setTimeout(() => setCopied(false), 1500);
    };
    const onReplace = () => {
      if (!result) return;
      const nextDraft = state.last?.prefix ? `${state.last.prefix} ${result.optimized}` : result.optimized;
      controller.markApplied({ backup: input.draft ?? "", text: nextDraft });
      inputActions?.setDraft(nextDraft);
    };
    const onUndo = () => {
      if (!applied) return;
      inputActions?.setDraft(applied.backup);
      controller.clearApplied();
      setUndoneFlash(true);
    };
    return (
      // 非模态 dock(不抢焦点、无焦点陷阱),用 region 而非 dialog:
      // dialog 会让读屏用户期待焦点管理,而这里并没有。
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: styles.panel, role: "region", "aria-label": t("panel.aria"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: styles.header, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(SparkleIcon, { size: 15 }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: styles.title, children: t("panel.title") }),
          result && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            "span",
            {
              style: styles.modelBadge,
              title: result.fallbackUsed && result.fallbackReason ? `${t("panel.fallback")}: ${result.fallbackReason}` : void 0,
              children: [
                result.provider,
                " / ",
                result.model,
                result.fallbackUsed ? ` \xB7 ${t("panel.fallback")}` : "",
                typeof result.durationMs === "number" ? ` \xB7 ${t("panel.duration")} ${(result.durationMs / 1e3).toFixed(1)}s` : ""
              ]
            }
          ),
          applied && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: styles.statusChip, children: t("panel.appliedShort") }),
          !applied && undoneFlash && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: styles.statusChip, children: t("panel.undoneShort") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "dsh-po-btn", type: "button", style: styles.close, title: t("panel.closeTitle"), onClick: () => controller.close(), children: "\u2715" })
        ] }),
        state.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: styles.loading, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(SparkleIcon, { spinning: true }),
            stage,
            "\u2026(",
            elapsed,
            "s,",
            t("panel.escCancel"),
            ")"
          ] }),
          liveBody
        ] }),
        state.status === "cancelled" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: styles.cancelledHint, children: t("panel.cancelled") }),
          liveBody,
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: styles.actions, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "dsh-po-btn", type: "button", style: { ...styles.actionBtn, ...styles.primaryBtn }, title: t("panel.reoptimizeTitle"), onClick: () => controller.retry(), children: t("panel.reoptimize") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "dsh-po-btn", type: "button", style: styles.actionBtn, onClick: () => controller.close(), children: t("panel.close") })
          ] })
        ] }),
        state.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: styles.sectionTitle, children: t("panel.error") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: styles.errorText, children: state.error }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: styles.actions, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "dsh-po-btn", type: "button", style: styles.actionBtn, title: t("panel.reoptimizeTitle"), onClick: () => controller.retry(), children: t("panel.retry") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "dsh-po-btn", type: "button", style: styles.actionBtn, onClick: () => controller.close(), children: t("panel.close") })
          ] })
        ] }),
        state.status === "done" && result && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          !result.wellFormed && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { ...styles.warnBanner, marginTop: 0, marginBottom: 8 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { "aria-hidden": true, children: "\u26A0" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: t("panel.notWellFormed") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: styles.body, children: [
            result.analysis && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("button", { className: "dsh-po-btn", type: "button", style: styles.sectionTitle, onClick: () => setAnalysisOpen((v) => !v), "aria-expanded": analysisOpen, children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { ...styles.chevron, transform: analysisOpen ? "rotate(90deg)" : "none" }, children: "\u25B8" }),
                t("panel.analysis")
              ] }),
              analysisOpen && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: styles.analysisBody, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("pre", { style: styles.pre, children: result.analysis }) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...styles.sectionTitle, cursor: "default" }, children: t("panel.optimized") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: styles.optimizedBox, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("pre", { style: styles.pre, children: result.optimized }) }),
            result.truncated && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: styles.warnBanner, children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { "aria-hidden": true, children: "\u26A0" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: t("panel.truncated") })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: styles.actions, children: applied ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "dsh-po-btn", type: "button", style: { ...styles.actionBtn, ...styles.primaryBtn }, onClick: onUndo, children: t("panel.undo") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "dsh-po-btn", type: "button", style: styles.actionBtn, title: t("panel.reoptimizeTitle"), onClick: () => controller.retry(), children: t("panel.reoptimize") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "dsh-po-btn", type: "button", style: styles.actionBtn, onClick: () => controller.close(), children: t("panel.close") })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "dsh-po-btn", type: "button", style: { ...styles.actionBtn, ...styles.primaryBtn }, onClick: onReplace, children: t("panel.replace") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "dsh-po-btn", type: "button", style: styles.actionBtn, onClick: onCopy, children: copied ? t("panel.copied") : t("panel.copy") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "dsh-po-btn", type: "button", style: styles.actionBtn, title: t("panel.reoptimizeTitle"), onClick: () => controller.retry(), children: t("panel.reoptimize") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { className: "dsh-po-btn", type: "button", style: styles.actionBtn, onClick: () => controller.close(), children: t("panel.close") })
          ] }) })
        ] })
      ] })
    );
  };
}

// src/client/SettingsCard.tsx
var import_react4 = require("react");

// src/client/GitHubIcon.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function GitHubIcon(props) {
  const size = props.size ?? 16;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      "aria-hidden": "true",
      fill: "currentColor",
      style: { display: "block", flexShrink: 0 },
      children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" })
    }
  );
}

// src/client/SettingsCard.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var REPO_URL = "https://github.com/Y1X1n/dsh-prompt-optimizer";
var STYLES_ID = "dsh-prompt-optimizer-settings-styles";
function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLES_ID)) return;
  const style = document.createElement("style");
  style.id = STYLES_ID;
  style.textContent = `
.dsh-po-sec{display:flex;flex-direction:column;width:100%;color:var(--dsw-alias-label-primary)}
.dsh-po-group{margin:14px 0 2px;padding:0;font-size:12px;font-weight:600;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsh-po-row{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:14px 0;border-bottom:0.5px solid var(--dsw-alias-border-l2)}
.dsh-po-row:last-child{border-bottom:none}
.dsh-po-rowText{min-width:0}
.dsh-po-rowTitle{font-size:14px;line-height:20px}
.dsh-po-rowDesc{margin-top:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsh-po-hint{padding:10px 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsh-po-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
/* \u5206\u6BB5\u63A7\u4EF6(\u5B98\u65B9 SegmentedControl \u540C\u6B3E):\u6D45\u5E95\u8F68\u9053 + \u9009\u4E2D\u767D\u80F6\u56CA\u6ED1\u52A8\u6307\u793A\u3002 */
.dsh-po-seg{position:relative;display:inline-grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:2px;padding:4px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.14));flex:none}
.dsh-po-segIndicator{position:absolute;top:4px;left:4px;width:calc((100% - 8px - 2px*(var(--dsh-segment-count) - 1))/var(--dsh-segment-count));height:calc(100% - 8px);border:0;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:var(--dsw-elevation-soft,0 1px 2px rgba(0,0,0,0.12));transform:translateX(calc(var(--dsh-segment-index)*(100% + 2px)));transition:transform 160ms ease;pointer-events:none}
.dsh-po-segTab{box-sizing:border-box;position:relative;z-index:1;height:28px;padding:0 16px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,inherit);font:inherit;font-size:13px;line-height:20px;font-weight:500;white-space:nowrap;cursor:pointer;transition:color 120ms ease}
.dsh-po-segTab:hover:not(:disabled),.dsh-po-segTab[aria-selected='true']{color:var(--dsw-alias-label-primary,inherit)}
.dsh-po-segTab:disabled{cursor:default;opacity:0.4}
/* \u5F00\u5173(\u5B98\u65B9 Switch \u540C\u6B3E):36\xD720 \u80F6\u56CA\u8F68\u9053 + 16px \u5706\u5F62\u6ED1\u5757\u3002 */
.dsh-po-switch{box-sizing:border-box;position:relative;flex:0 0 auto;width:36px;height:20px;padding:2px;border:0;border-radius:999px;background:var(--dsw-alias-border-l3,rgba(128,128,128,0.4));cursor:pointer}
.dsh-po-switch[aria-checked='true']{background:var(--dsw-alias-brand-primary,#4f7cf7)}
.dsh-po-switch:disabled{cursor:default;opacity:0.5}
.dsh-po-switchThumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground,#fff);transition:transform 120ms ease}
.dsh-po-switch[aria-checked='false'] .dsh-po-switchThumb{background:var(--dsw-alias-switch-thumb,#fff)}
.dsh-po-switch[aria-checked='true'] .dsh-po-switchThumb{transform:translateX(16px)}
/* \u884C\u5185\u63A7\u4EF6:select / input / \u6B21\u7EA7\u6309\u94AE\u3002 */
.dsh-po-select{flex:none;max-width:280px;padding:5px 28px 5px 10px;font:inherit;font-size:13px;line-height:20px;border-radius:var(--dsw-radius-md,8px);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,0.35));background:var(--dsw-alias-bg-layer-1,transparent) no-repeat right 10px center/10px;appearance:none;color:var(--dsw-alias-label-primary,inherit);cursor:pointer}
.dsh-po-input{flex:none;width:150px;padding:5px 10px;font:inherit;font-size:13px;line-height:20px;border-radius:var(--dsw-radius-md,8px);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,0.35));background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary,inherit)}
.dsh-po-input:focus-visible,.dsh-po-select:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f7cf7));outline-offset:1px}
.dsh-po-btn2{flex:none;padding:5px 14px;font:inherit;font-size:13px;line-height:20px;border-radius:var(--dsw-radius-md,8px);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,0.35));background:transparent;color:var(--dsw-alias-label-primary,inherit);cursor:pointer;white-space:nowrap;transition:background-color 120ms ease}
.dsh-po-btn2:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.14))}
.dsh-po-btn2:disabled{opacity:0.45;cursor:default}
.dsh-po-fieldError{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#e5534b)}
/* \u9009\u4E2D\u884C\u63A7\u4EF6\u7684\u8868\u5355\u9519\u8BEF\u6001(\u6587\u672C\u8F93\u5165\u6821\u9A8C\u5931\u8D25)\u3002 */
.dsh-po-input[data-invalid='true']{border-color:var(--dsw-alias-state-error-primary,#e5534b)}
`;
  document.head.appendChild(style);
}
function Row({ title, desc, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-po-row", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-po-rowText", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-po-rowTitle", children: title }),
      desc && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-po-rowDesc", children: desc })
    ] }),
    children
  ] });
}
function Segmented(props) {
  const selected = props.options.findIndex((o) => o.value === props.value);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "span",
    {
      className: "dsh-po-seg",
      role: "tablist",
      "aria-label": props.label,
      style: { "--dsh-segment-count": props.options.length, "--dsh-segment-index": selected < 0 ? 0 : selected },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-po-segIndicator", "aria-hidden": "true" }),
        props.options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            type: "button",
            role: "tab",
            className: "dsh-po-segTab dsh-po-btn",
            "aria-selected": option.value === props.value,
            title: option.title,
            onClick: () => {
              if (option.value !== props.value) props.onChange(option.value);
            },
            children: option.label
          },
          option.value
        ))
      ]
    }
  );
}
function Toggle(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    "button",
    {
      type: "button",
      role: "switch",
      className: "dsh-po-switch dsh-po-btn",
      "aria-checked": props.checked,
      "aria-label": props.label,
      disabled: props.disabled,
      onClick: () => props.onChange(!props.checked),
      children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-po-switchThumb" })
    }
  );
}
function TextField(props) {
  const [text, setText] = (0, import_react4.useState)(props.value);
  const [error, setError] = (0, import_react4.useState)(null);
  (0, import_react4.useEffect)(() => setText(props.value), [props.value]);
  const commit = () => {
    if (text === props.value) {
      setError(null);
      return;
    }
    const problem = props.validate?.(text) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    props.onCommit(text);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flex: "none" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "input",
      {
        className: "dsh-po-input dsh-po-btn",
        "data-invalid": error ? "true" : void 0,
        style: props.width ? { width: props.width } : void 0,
        value: text,
        placeholder: props.placeholder,
        "aria-label": props.label,
        title: props.labelTitle,
        onChange: (e) => {
          setText(e.target.value);
          setError(null);
        },
        onBlur: commit,
        onKeyDown: (e) => {
          if (e.key === "Enter") commit();
        }
      }
    ),
    error && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-po-fieldError", children: error })
  ] });
}
function ModelSelect(props) {
  if (props.groups === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "dsh-po-status", style: { flex: "none", maxWidth: 300, textAlign: "right" }, children: [
      props.catalogState === "error" ? "\u2014" : "\u2026",
      props.catalogHint ? `(${props.catalogHint})` : ""
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: 8, flex: "none" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
      "select",
      {
        className: "dsh-po-select dsh-po-btn",
        style: { backgroundImage: catalogChevron() },
        value: props.value,
        "aria-label": props.label,
        onChange: (e) => props.onChange(e.target.value),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", children: props.noneLabel }),
          props.groups.map((g) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("optgroup", { label: g.name, children: g.models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: `${g.id}/${m.id}`, children: m.name }, `${g.id}/${m.id}`)) }, g.id))
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { className: "dsh-po-btn2 dsh-po-btn", type: "button", title: props.refreshTitle, onClick: props.onRefresh, children: props.refreshLabel })
  ] });
}
function catalogChevron() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="%23888" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/"/g, "'")}")`;
}
function createSettingsCard(ctx, face2) {
  ensureStyles();
  return function PromptOptimizerSettingsCard() {
    const snap = (0, import_react4.useSyncExternalStore)(
      (callback) => face2.subscribe(callback),
      () => face2.getSnapshot()
    );
    const t = useT();
    const value = snap.value ?? {};
    const writable = snap.writable !== false;
    const SETTING_KEYS = [
      "language",
      "model",
      "fallbackModel",
      "maxTokens",
      "timeoutSeconds",
      "mode",
      "reasoningEffort",
      "temperature",
      "autoMaxTokens",
      "includeContext"
    ];
    const SETTING_DEFAULTS = {
      language: "zh",
      model: "",
      fallbackModel: "",
      maxTokens: 8192,
      timeoutSeconds: 120,
      // 与 Host 侧 Config 默认口径一致(0.5.0 起默认快速模式)。
      mode: "fast",
      reasoningEffort: "lowest",
      temperature: 0.2,
      autoMaxTokens: true,
      includeContext: true
    };
    const undoStack = (0, import_react4.useRef)([]);
    const [canUndo, setCanUndo] = (0, import_react4.useState)(false);
    const applyingUndo = (0, import_react4.useRef)(false);
    const setValue = (key, v) => {
      if (!applyingUndo.current) {
        undoStack.current.push({ ...value });
        if (undoStack.current.length > 20) undoStack.current.shift();
        setCanUndo(true);
      }
      void face2.set(key, v);
    };
    const undoLastChange = () => {
      const prev = undoStack.current.pop();
      setCanUndo(undoStack.current.length > 0);
      if (!prev) return;
      applyingUndo.current = true;
      try {
        for (const k of SETTING_KEYS) {
          const target = prev[k] ?? SETTING_DEFAULTS[k];
          if (value[k] !== target) {
            void face2.set(k, target);
          }
        }
      } finally {
        applyingUndo.current = false;
      }
    };
    const [groups, setGroups] = (0, import_react4.useState)(null);
    const [catalogState, setCatalogState] = (0, import_react4.useState)("loading");
    const [catalogHint, setCatalogHint] = (0, import_react4.useState)(null);
    const loadCatalog = async () => {
      setCatalogState("loading");
      setCatalogHint(null);
      try {
        const result = await sessionCatalog(ctx.connection);
        if (result.ok) {
          setGroups(result.value.groups);
          setCatalogState("ready");
          const failures = result.value.failures ?? [];
          if (failures.length) {
            setCatalogHint(failures.map((f) => `${f.name || f.id}: ${f.message}`).join("; "));
          }
        } else {
          const message = typeof result.error === "string" ? result.error : result.error?.message;
          setCatalogHint(message ?? null);
          setCatalogState("error");
        }
      } catch (cause) {
        setCatalogHint(cause instanceof Error ? cause.message : String(cause));
        setCatalogState("error");
      }
    };
    (0, import_react4.useEffect)(() => {
      void loadCatalog();
    }, []);
    const [test, setTest] = (0, import_react4.useState)({ status: "idle" });
    const runTest = async () => {
      setTest({ status: "testing" });
      try {
        const resp = await fetch("/dsh-prompt-optimizer/test-model", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}"
        });
        const data = await resp.json().catch(() => null);
        if (data?.ok) {
          setTest({ status: "ok", message: t("settings.test.ok", { provider: data.provider, model: data.model, latencyMs: data.latencyMs }) });
        } else {
          setTest({ status: "fail", message: String(data?.error ?? `HTTP ${resp.status}`) });
        }
      } catch (cause) {
        setTest({ status: "fail", message: cause instanceof Error ? cause.message : String(cause) });
      }
    };
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: "dsh-po-sec", children: [
      snap.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-po-hint", children: t("settings.loading") }),
      snap.status === "unavailable" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-po-hint", children: t("settings.unavailable") }),
      !writable && snap.status === "ready" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-po-hint", children: t("settings.readOnly") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-po-group", children: t("settings.group.model") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { title: t("settings.model"), desc: t("settings.model.desc"), children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        ModelSelect,
        {
          label: t("settings.model"),
          value: value.model ?? "",
          groups,
          catalogState,
          catalogHint,
          noneLabel: t("settings.model.follow"),
          onChange: (v) => setValue("model", v),
          onRefresh: () => void loadCatalog(),
          refreshTitle: t("settings.refreshTitle"),
          refreshLabel: t("settings.refresh")
        }
      ) }),
      groups !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { title: t("settings.fallbackModel"), desc: t("settings.fallbackModel.desc"), children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
        "select",
        {
          className: "dsh-po-select dsh-po-btn",
          style: { backgroundImage: catalogChevron() },
          value: value.fallbackModel ?? "",
          "aria-label": t("settings.fallbackModel"),
          onChange: (e) => setValue("fallbackModel", e.target.value),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", children: t("settings.fallbackModel.none") }),
            groups.map((g) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("optgroup", { label: g.name, children: g.models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: `${g.id}/${m.id}`, children: m.name }, `${g.id}/${m.id}`)) }, g.id))
          ]
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { title: t("settings.test"), desc: t("settings.test.desc"), children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: 8, flex: "none" }, children: [
        test.message && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-po-status", style: { maxWidth: 280, color: test.status === "fail" ? "var(--dsw-alias-state-error-primary,#e5534b)" : void 0 }, children: test.message }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            className: "dsh-po-btn2 dsh-po-btn",
            type: "button",
            disabled: test.status === "testing",
            onClick: () => void runTest(),
            children: test.status === "testing" ? t("settings.test.running") : t("settings.test.run")
          }
        )
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-po-group", children: t("settings.group.params") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { title: t("settings.language"), desc: t("settings.language.desc"), children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        Segmented,
        {
          label: t("settings.language"),
          value: value.language ?? "zh",
          options: [
            { value: "zh", label: "\u4E2D\u6587" },
            { value: "en", label: "English" }
          ],
          onChange: (v) => setValue("language", v)
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { title: t("settings.mode"), desc: t("settings.mode.desc"), children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        Segmented,
        {
          label: t("settings.mode"),
          value: value.mode ?? "fast",
          options: [
            { value: "full", label: t("settings.mode.full.short"), title: t("settings.mode.full") },
            { value: "fast", label: t("settings.mode.fast.short"), title: t("settings.mode.fast") }
          ],
          onChange: (v) => setValue("mode", v)
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { title: t("settings.effort"), desc: t("settings.effort.desc"), children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        Segmented,
        {
          label: t("settings.effort"),
          value: value.reasoningEffort ?? "lowest",
          options: [
            { value: "lowest", label: t("settings.effort.lowest.short"), title: t("settings.effort.lowest") },
            { value: "session", label: t("settings.effort.session.short"), title: t("settings.effort.session") }
          ],
          onChange: (v) => setValue("reasoningEffort", v)
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { title: t("settings.maxTokens"), desc: t("settings.maxTokens.desc"), children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        TextField,
        {
          label: t("settings.maxTokens"),
          value: String(value.maxTokens ?? 8192),
          placeholder: "8192",
          validate: (v) => {
            const n = Number.parseInt(v, 10);
            return Number.isFinite(n) && n >= 1024 && n <= 32768 ? null : t("settings.validate.maxTokens");
          },
          onCommit: (v) => setValue("maxTokens", Number.parseInt(v, 10))
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { title: t("settings.timeout"), desc: t("settings.timeout.desc"), children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        TextField,
        {
          label: t("settings.timeout"),
          value: String(value.timeoutSeconds ?? 120),
          placeholder: "120",
          validate: (v) => {
            const n = Number.parseInt(v, 10);
            return Number.isFinite(n) && n >= 10 && n <= 600 ? null : t("settings.validate.timeout");
          },
          onCommit: (v) => setValue("timeoutSeconds", Number.parseInt(v, 10))
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { title: t("settings.temperature"), desc: t("settings.temperature.desc"), children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        TextField,
        {
          label: t("settings.temperature"),
          labelTitle: t("settings.temperatureTitle"),
          value: String(value.temperature ?? 0.2),
          placeholder: "0.2",
          width: 100,
          validate: (v) => {
            const n = Number.parseFloat(v);
            return Number.isFinite(n) && n >= 0 && n <= 2 ? null : t("settings.validate.temperature");
          },
          onCommit: (v) => setValue("temperature", Number.parseFloat(v))
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dsh-po-group", children: t("settings.group.context") }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { title: t("settings.includeContext"), desc: t("settings.includeContext.desc"), children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        Toggle,
        {
          label: t("settings.includeContext"),
          checked: value.includeContext !== false,
          onChange: (next) => setValue("includeContext", next)
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { title: t("settings.autoMaxTokens"), desc: t("settings.autoMaxTokens.desc"), children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        Toggle,
        {
          label: t("settings.autoMaxTokens"),
          checked: value.autoMaxTokens !== false,
          onChange: (next) => setValue("autoMaxTokens", next)
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dsh-po-row", style: { paddingBottom: 4, gap: 12 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            className: "dsh-po-btn2 dsh-po-btn",
            type: "button",
            disabled: !canUndo,
            title: t("settings.undoTitle"),
            onClick: undoLastChange,
            children: t("settings.undo")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
          "a",
          {
            className: "dsh-po-repo-link dsh-po-btn",
            href: REPO_URL,
            target: "_blank",
            rel: "noreferrer noopener",
            title: t("settings.repoTitle"),
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              fontSize: 12,
              borderRadius: 6,
              color: "var(--dsw-alias-label-secondary, inherit)",
              textDecoration: "none"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(GitHubIcon, { size: 14 }),
              "GitHub"
            ]
          }
        )
      ] })
    ] });
  };
}

// src/client/settings-face.ts
function createSettingsFace() {
  let backend = null;
  let offBackend = null;
  const listeners = /* @__PURE__ */ new Set();
  let loadingSnapshot = null;
  let cachedSnapshot = null;
  const notify = () => {
    cachedSnapshot = null;
    for (const listener of listeners) listener();
  };
  function use(next) {
    if (backend === next) return;
    offBackend?.();
    backend = next;
    offBackend = next.subscribeRaw(notify);
    notify();
  }
  const face2 = {
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getSnapshot() {
      if (!backend) {
        loadingSnapshot ?? (loadingSnapshot = { status: "loading" });
        return loadingSnapshot;
      }
      cachedSnapshot ?? (cachedSnapshot = (() => {
        const snap = backend.getSnapshot();
        const status = snap.status === "ready" || snap.status === "unavailable" ? snap.status : "loading";
        return { status, value: snap.value, writable: snap.writable };
      })());
      return cachedSnapshot;
    },
    set(key, value) {
      return backend ? backend.set(key, value) : Promise.reject(new Error("\u8BBE\u7F6E\u670D\u52A1\u5C1A\u672A\u5C31\u7EEA"));
    }
  };
  return {
    face: face2,
    attachForms(forms, entryId) {
      const form = forms.get(entryId);
      use({
        subscribeRaw: (fn) => form.subscribe(fn),
        getSnapshot: () => form.getSnapshot(),
        set: (field, value) => form.set(field, value)
      });
    }
  };
}

// src/client/index.tsx
var name = "dsh-prompt-optimizer-client";
var inject = ["slots", "connection", "remote"];
var BUTTON_CLASS = "dsh-po-btn";
var SETTINGS_ENTRY_ID = "prompt-optimizer";
function ensureFocusStyles() {
  if (typeof document === "undefined") return;
  const ID = "dsh-prompt-optimizer-focus-styles";
  if (document.getElementById(ID)) return;
  const style = document.createElement("style");
  style.id = ID;
  style.textContent = ".dsh-po-btn:focus-visible{outline:2px solid var(--dsw-alias-state-focus-ring, #4f7cf7);outline-offset:2px;border-radius:4px;}.dsh-po-opt{background:color-mix(in srgb, var(--dsw-alias-label-primary, #0f1115) 5%, transparent);}.dsh-po-opt:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-label-primary, #0f1115) 9%, transparent);}.dsh-po-repo-link{transition:color 0.15s ease,background-color 0.15s ease;}.dsh-po-repo-link:hover{color:var(--dsw-alias-label-primary, inherit);background-color:var(--dsw-alias-fill-secondary, rgba(128,128,128,0.12));}";
  document.head.appendChild(style);
}
function apply(ctx) {
  ensureFocusStyles();
  ctx.inject(["locale"], (lctx) => {
    installLocaleFace(lctx.locale ?? null);
  });
  let modelDirectories;
  ctx.inject(["modelDirectories"], (mctx) => {
    modelDirectories = mctx.modelDirectories;
  });
  let sessions;
  ctx.inject(["sessions"], (sctx) => {
    sessions = sctx.sessions;
  });
  const settings = createSettingsFace();
  ctx.inject(["configForms"], (cctx) => {
    const forms = cctx.configForms;
    if (forms) settings.attachForms(forms, SETTINGS_ENTRY_ID);
  });
  const scope = { getSnapshot: () => settings.face.getSnapshot() };
  const controller = createOptimizerController(ctx, {
    // 与 Host 侧「空字符串视为未设置」的口径一致。
    isModelPinned: () => Boolean(scope.getSnapshot().value?.model?.trim()),
    // 与 Host 侧「includeContext 缺省视为开」的口径一致(R28)。
    isContextEnabled: () => scope.getSnapshot().value?.includeContext ?? true,
    // 与 Host 侧「仅 mode==='fast' 为快速」的归一化口径一致。
    isFastMode: () => scope.getSnapshot().value?.mode === "fast",
    // R21:看门狗 = 设置超时秒数 + 5s 余量(正常时 Host 的超时错误先到达,文案更友好)。
    getWatchdogMs: () => ((scope.getSnapshot().value?.timeoutSeconds ?? 120) + 5) * 1e3,
    // 「跟随会话」的模型来源(见上);点击时读取,服务缺席走 Host 回退。
    getSessionModelDirectories: () => modelDirectories,
    // 「携带上下文」的会话事件窗口来源(见上);点击时读取。
    getSessions: () => sessions
  });
  ctx.inject(["slots", "connection", "remote"], (scopeCtx) => {
    scopeCtx.slots.inject(
      "conversation.input.right",
      () => scopeCtx.slots.register(
        {
          name: "conversation.input.right",
          id: "prompt-optimizer",
          order: 30,
          inject: () => ({})
        },
        createOptimizeButton(controller)
      )
    );
    scopeCtx.slots.inject(
      "conversation.input.dock",
      () => scopeCtx.slots.register(
        {
          name: "conversation.input.dock",
          id: "prompt-optimizer",
          order: 30,
          inject: () => ({})
        },
        createResultDock(controller)
      )
    );
  });
  const slotsAny = ctx.slots;
  const registerSettingsTab = (slotCtx) => {
    const slots = slotCtx.slots;
    const card = createSettingsCard(slotCtx, settings.face);
    return slots.register(
      {
        name: "settings.plugins.tab",
        id: SETTINGS_ENTRY_ID,
        order: 30,
        label: () => translate("panel.title"),
        inject: () => ({})
      },
      card
    );
  };
  slotsAny.inject("settings.plugins.tab", () => registerSettingsTab(ctx));
}
		return module.exports;
	}
});
