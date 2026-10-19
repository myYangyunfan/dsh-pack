/**
 * dsh-auto-compact — browser half: 默认开启的自动压缩.
 *
 * 机制：在 conversation.composer.dock 挂一个不可见的 occupant（与
 * dsh-message-rewind 同一手法），标准 props 里持续拿到
 *   · useProjection —— 订阅会话的 contextPressure 投影（token-meter 提供：
 *     pressureTokens / projectedTokens / contextWindow）
 *   · inputActions —— setDraft / submit，用于以用户身份提交 /compact
 * 占用率 = projectedTokens ÷ contextWindow（与官方 ContextMeter 环同口径）。
 * 达到阈值且**闸门放行**时自动提交 /compact。闸门（composerGate，纯函数）读的是
 * 内核给 dock occupant 的真形状 `useInput(s => s)` / `useSession(s => s)`：
 *   · 输入框里有内容（draft 非空，或有 attachmentIds）→ 不触发；
 *   · 输入形态不是 plain（adjudicating / claimed / submitting）、或会话 running /
 *     pendingSubmissions 非空 → 不触发；
 *   · 两个快照读不到 → 判 unknown，同样不触发（setDraft 是**整篇替换**并立刻覆盖
 *     已持久化的草稿，未知状态下替用户提交就是丢内容）。
 * 不触发时不记冷却、不打扰，等下一次投影更新（草稿清空 / 轮次结束）自然重来。
 * 这一条是 0.1.2 的根治：此前只有 enabled / 阈值 / 冷却三道判据，用户打了一半的
 * 引导词会被 setDraft("/compact") 直接覆盖（2026-10-18 用户报障）。
 * 压缩事务由内核 dsh-compaction-basic 执行，失败（busy 等）只是记录，绝不打扰。
 *
 * 设置页分区可调：开关（默认开）、阈值（60–95%，默认 80%）、手动「立即压缩」。
 * 配置持久化到 localStorage（settings namespace 之外的轻量本地方案，
 * 避免占用一个宿主命名空间 —— 那正是「设置命名空间不可用」的雷区）。
 *
 * Hand-written ModuleLoader bundle — no build step required.
 */
window.__ModuleLoader__.load({
  id: "@dsh-pack/dsh-auto-compact",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var react = require("react");
    var h = react.createElement;

    var STORE_KEY = "dsh-auto-compact-config-v1";
    var DEFAULTS = { enabled: true, threshold: 80 };
    var COOLDOWN_MS = 3 * 60 * 1000;

    function loadConfig() {
      try {
        var raw = window.localStorage.getItem(STORE_KEY);
        if (raw) {
          var c = JSON.parse(raw);
          return {
            enabled: c.enabled !== false,
            threshold: Math.min(95, Math.max(60, Math.round(Number(c.threshold) || DEFAULTS.threshold)))
          };
        }
      } catch (e) { /* fall through */ }
      return Object.assign({}, DEFAULTS);
    }
    function saveConfig(cfg) {
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch (e) {}
    }

    // ── 会话状态（dock occupant 镜像）────────────────────────────────────
    var sessions = new Map(); // sessionId -> { inputActions, useProjection, lastFireAt }
    var currentId = null;

    function occupancyOf(pressure) {
      if (!pressure) return null;
      var used = pressure.projectedTokens !== undefined ? pressure.projectedTokens : pressure.pressureTokens;
      if (used === undefined || pressure.contextWindow === undefined) return null;
      return { percent: Math.min(100, Math.round((used / pressure.contextWindow) * 100)), used: used, window: pressure.contextWindow };
    }

    function toast(msg) {
      try {
        var el = document.createElement("div");
        el.textContent = msg;
        el.style.cssText = "position:fixed;right:18px;bottom:56px;z-index:2147483000;padding:8px 14px;border-radius:10px;" +
          "background:var(--dsw-alias-bg-layer-2,rgba(16,22,40,.95));color:var(--dsw-alias-label-primary,#e6ecff);" +
          "border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));font-size:12.5px;max-width:320px;" +
          "box-shadow:0 8px 28px rgba(0,0,0,.4);opacity:0;transition:opacity .18s";
        document.body.appendChild(el);
        requestAnimationFrame(function () { el.style.opacity = "1"; });
        setTimeout(function () {
          el.style.opacity = "0";
          setTimeout(function () { el.remove(); }, 250);
        }, 4200);
      } catch (e) { /* 提示失败无碍 */ }
    }

    // 替用户提交前的闸门。判据照内核 InputBar 的同源口径
    // （dsh-client-ui-conversation/lib/client.js:18803-18806：
    //   empty = draft.trim() === "" && attachments.length === 0；
    //   machineBusy = phase === "adjudicating" || "submitting"）——
    // 附件也算内容：occupant 拿不到 resolveDraftAttachments/useFileUploads（那是 bar 专属注入），
    // 所以按 attachmentIds 计数，这一侧比内核多出来的只有「刚挂上还没解析完的附件」这种边角。
    // 返回 "unknown" 是刻意的保守：读不到形状就绝不替用户按发送。
    function composerGate(input, session) {
      if (!input || typeof input !== "object") return "unknown";
      if (typeof input.draft !== "string" || !Array.isArray(input.attachmentIds)) return "unknown";
      if (input.draft.trim() !== "" || input.attachmentIds.length > 0) return "has-content";
      if (typeof input.phase !== "string") return "unknown";
      if (input.phase !== "plain") return "busy";
      if (!session || typeof session !== "object") return "unknown";
      if (session.running) return "busy";
      if (Array.isArray(session.pendingSubmissions) && session.pendingSubmissions.length > 0) return "busy";
      return "ready";
    }

    var unknownWarned = false;
    function warnUnknown() {
      if (unknownWarned) return;
      unknownWarned = true;
      try {
        console.warn("[auto-compact] 读不到输入框/会话快照（useInput / useSession 形状变了？）——"
          + "已停手不替用户提交，避免覆盖草稿；请对照内核 dsh-client-ui-conversation 的 dock 注入面复核");
      } catch (e) { /* 无 console 环境 */ }
    }

    function fireCompact(sessionId) {
      var cap = sessions.get(sessionId);
      if (!cap || !cap.inputActions || typeof cap.inputActions.setDraft !== "function") return false;
      try {
        cap.inputActions.setDraft("/compact");
        // 提交必须在下一帧（draft 状态先落地）；submit 缺失时退化为仅填入
        // 草稿，由用户回车确认。
        var ia = cap.inputActions;
        if (typeof ia.submit === "function") {
          setTimeout(function () {
            try { ia.submit(); } catch (e) { /* busy 等拒绝静默 */ }
          }, 50);
        }
        cap.lastFireAt = Date.now();
        return true;
      } catch (e) {
        return false;
      }
    }

    // 不可见的 dock occupant：持续镜像每个会话的 inputActions、占用率与「能不能提交」闸门。
    function AutoCompactCapture(props) {
      var sessionId = props.sessionId;
      var inputActions = props.inputActions;
      var useProjection = props.useProjection;

      var pressure = null;
      try {
        if (typeof useProjection === "function") pressure = useProjection("contextPressure");
      } catch (e) { pressure = null; }

      // dock 的标准注入面：hooks.input = 输入框快照、hooks.session = 会话快照
      // （dsh-client-ui-conversation/lib/client.js:19738-19753 的 provide 决议）。
      var input = null;
      var session = null;
      try {
        if (typeof props.useInput === "function") input = props.useInput(function (s) { return s; });
      } catch (e) { input = null; }
      try {
        if (typeof props.useSession === "function") session = props.useSession(function (s) { return s; });
      } catch (e) { session = null; }
      var gate = composerGate(input, session);

      react.useEffect(function () {
        if (!sessionId) return;
        currentId = sessionId;
        var cap = sessions.get(sessionId);
        if (!cap) { cap = { inputActions: null, lastFireAt: 0, gate: "unknown" }; sessions.set(sessionId, cap); }
        if (inputActions) cap.inputActions = inputActions;
        cap.gate = gate;
        return function () {
          // 切走的会话保留捕获（回切无需重建），只撤销当前指针。
          if (currentId === sessionId) currentId = sessionId;
        };
      }, [sessionId, inputActions, gate]);

      // 判定与触发放在渲染数据就绪处（每次投影更新都会重渲染 occupant）。
      react.useEffect(function () {
        if (!sessionId || !pressure) return;
        var occ = occupancyOf(pressure);
        if (!occ) return;
        var cfg = loadConfig();
        if (!cfg.enabled) return;
        var cap = sessions.get(sessionId);
        if (!cap || !cap.inputActions) return;
        if (occ.percent < cfg.threshold) return;
        if (Date.now() - (cap.lastFireAt || 0) < COOLDOWN_MS) return;
        // 闸门排在这条链的最后一条：草稿里有内容 / 正在跑轮次 / 形状读不到时，
        // 一次 setDraft 就把用户半篇输入连已持久化的草稿一起换掉，且没有恢复通道
        // （内核 commit-draft 会砍掉 undo 栈）。跳过时**不记冷却**，等输入框空了再补做。
        if (gate !== "ready") {
          if (gate === "unknown") warnUnknown();
          return;
        }
        if (fireCompact(sessionId)) {
          toast("上下文已达到 " + occ.percent + "%（阈值 " + cfg.threshold + "%），已自动压缩（/compact）");
        }
      }, [sessionId, gate, pressure && (pressure.projectedTokens ?? pressure.pressureTokens), pressure && pressure.contextWindow]);

      return null;
    }

    // ── 设置页分区 ────────────────────────────────────────────────────────
    var NS = "autoCompact";
    var zh = {
      nav: "自动压缩",
      intro: "对话接近上下文上限时自动执行 /compact（官方压缩命令）：保留近期对话与摘要，替换较早历史。默认开启。",
      enabled: "启用自动压缩",
      threshold: "触发阈值",
      thresholdHint: "占用率达到该比例时触发（官方环指示器同口径）。建议 70–85%。",
      now: "立即压缩当前对话",
      nowDone: "已发送 /compact",
      nowFail: "当前没有可压缩的会话（打开一个对话再试）",
      nowBlocked: "输入框里还有内容，或这一轮还在跑——先发送/清空并等它空闲，再手动压缩",
      nowUnknown: "读不到输入框状态，已停手（不会覆盖你的草稿）",
      note: "只在输入框为空且会话空闲时自动触发；草稿非空时一定跳过（绝不覆盖你正在写的东西），跳过不记冷却、输入框空了会补做。压缩事务由内核执行，失败静默。"
    };
    var en = {
      nav: "Auto Compact",
      intro: "Automatically runs /compact (the official command) when a conversation approaches the context limit: recent turns are kept, older history is summarized. On by default.",
      enabled: "Enable auto compact",
      threshold: "Trigger threshold",
      thresholdHint: "Fires when occupancy reaches this ratio (same gauge as the official ring). 70–85% recommended.",
      now: "Compact current conversation now",
      nowDone: "/compact sent",
      nowFail: "No compactable conversation open (open a conversation first)",
      nowBlocked: "The composer still has content, or this turn is running — send/clear it and wait for idle before compacting manually",
      nowUnknown: "Composer state unavailable; stood down (your draft is not overwritten)",
      note: "Fires only when the composer is empty and the conversation is idle; it never overwrites a draft, and a skipped attempt does not consume the cooldown — it retries once the composer is empty. Compaction runs in the core; failures stay silent."
    };

    var CSS = ".__ac_root{max-width:640px;display:flex;flex-direction:column;gap:12px}" +
      ".__ac_hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);margin:0}" +
      ".__ac_row{display:flex;align-items:center;gap:10px}" +
      ".__ac_label{font-size:13px;font-weight:600}" +
      ".__ac_range{flex:1;accent-color:var(--dsw-alias-state-business-primary)}" +
      ".__ac_size{font-size:12px;color:var(--dsw-alias-label-secondary);min-width:40px;text-align:right}" +
      ".__ac_btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 14px;font:inherit;font-size:13px;cursor:pointer}" +
      ".__ac_btn:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary)}" +
      ".__ac_btnPrimary{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-inverted)}" +
      ".__ac_ok{font-size:12px;color:var(--dsw-alias-state-success-primary)}" +
      ".__ac_err{font-size:12px;color:var(--dsw-alias-state-error-primary)}";
    var tagId = "dsh-auto-compact/main.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-auto-compact";
      tag.dataset.pluginCss = tagId;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    function AutoCompactSection(props) {
      var t = props.t;
      var state = react.useState(null);
      var cfg = state[0];
      var setCfg = state[1];
      var msgState = react.useState(null);
      var msg = msgState[0];
      var setMsg = msgState[1];

      react.useEffect(function () { setCfg(loadConfig()); }, []);
      if (!cfg) return h("div", { className: "__ac_root" }, h("p", { className: "__ac_hint" }, "…"));

      var update = function (patch) {
        var next = Object.assign({}, cfg, patch);
        if (next.threshold !== undefined) next.threshold = Math.min(95, Math.max(60, Math.round(Number(next.threshold) || 80)));
        setCfg(next);
        saveConfig(next);
      };

      return h("div", { className: "__ac_root" },
        h("p", { className: "__ac_hint", style: { margin: 0 } }, t("intro")),
        h("label", { className: "__ac_row" },
          h("input", {
            type: "checkbox", checked: cfg.enabled,
            onChange: function (e) { update({ enabled: e.target.checked }); }
          }),
          h("span", { className: "__ac_label" }, t("enabled"))
        ),
        h("div", { className: "__ac_row" },
          h("span", { className: "__ac_label" }, t("threshold")),
          h("input", {
            className: "__ac_range", type: "range", min: 60, max: 95, step: 1,
            value: cfg.threshold,
            onChange: function (e) { update({ threshold: Number(e.target.value) }); }
          }),
          h("span", { className: "__ac_size" }, cfg.threshold + "%")
        ),
        h("p", { className: "__ac_hint" }, t("thresholdHint")),
        h("div", { className: "__ac_row" },
          h("button", {
            className: "__ac_btn __ac_btnPrimary",
            onClick: function () {
              var sid = currentId;
              var cap = sid && sessions.get(sid);
              if (!cap || !cap.inputActions) { setMsg({ ok: false, text: t("nowFail") }); return; }
              // 手动那一路走同一道闸门：用户点「立即压缩」时如果输入框里有半篇草稿，
              // 替他把草稿换成 /compact 同样是丢内容——不执行，把原因说出来。
              var g = cap.gate || "unknown";
              if (g === "has-content" || g === "busy") { setMsg({ ok: false, text: t("nowBlocked") }); return; }
              if (g === "unknown") { warnUnknown(); setMsg({ ok: false, text: t("nowUnknown") }); return; }
              if (fireCompact(sid)) setMsg({ ok: true, text: t("nowDone") });
              else setMsg({ ok: false, text: t("nowFail") });
            }
          }, t("now")),
          msg ? h("span", { className: msg.ok ? "__ac_ok" : "__ac_err" }, msg.text) : null
        ),
        h("p", { className: "__ac_hint" }, t("note"))
      );
    }

    // ── plugin ────────────────────────────────────────────────────────────
    var inject = ["slots", "locale"];

    function apply(ctx) {
      var t = ctx.locale.bind(NS);
      ctx.effect(function () { return ctx.locale.register(NS, { zh: zh, en: en }); }, "dsh-auto-compact: dictionaries");
      var slots = ctx.slots;
      // 状态镜像：occupant 渲染时刷新全局表。
      slots.inject("conversation.composer.dock", function () {
        return slots.register(
          { name: "conversation.composer.dock", id: "auto-compact-capture", order: 91 },
          AutoCompactCapture
        );
      });
      slots.inject("settings.section", function () {
        return slots.register({
          name: "settings.section",
          id: "auto-compact",
          order: 28,
          label: function () { return t("nav"); },
          locale: NS
        }, function (props) {
          return h(AutoCompactSection, props);
        });
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.__internals = { occupancyOf, composerGate, loadConfig, sanitizeConfig: function (c) { return { enabled: c.enabled !== false, threshold: Math.min(95, Math.max(60, Math.round(Number(c.threshold) || 80))) }; } };
    return module.exports;
  }
});
