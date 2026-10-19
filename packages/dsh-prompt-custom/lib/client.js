// dsh-prompt-custom（独立移植版）— client 半边：设置页「自定义提示词」栏。
//
// 0.5.0 重做（用户裁定「卡片即提示词」）—— 交互与视觉同时回炉：
//
// 一、交互（0.4.0 的差在哪）：卡片列表 + 「使用这张」+ 独立保存按钮的三件套叠出四层状态 ——
//   卡片高亮只认「文本恰好相等」，「保存」只写正文不写卡片，于是「编辑→保存→卡片还停在旧
//   文本上」看起来像丢字；切换卡片要跨半屏去找「使用这张」；编辑框有改动时还得先处置一次。
//   最常用的两个动作（切卡 / 存正文）各走各的门，却互相不知道对方。
//   本版把卡片抬成**唯一的正文选择器**：
//   1. 卡片是可点选的芯片：点一下 = 切换为该卡正文 + 立即生效（编辑框干净时一次 POST）。
//      编辑框有未保存改动时给三个出口（保存并切换 / 另存为卡片并切换 / 丢弃改动并切换），
//      每个出口都写清后果，不再有「点了没反应」的中间态。
//   2. 「保存」写回**当前卡**（正文来自哪张卡就写回哪张），按钮上直接写目标
//      （「保存到「卡片甲」并生效」）；正文不属于任何卡片时写「保存并生效」。
//      卡片不再是一次性快照，编辑→保存→卡片同步，闭环成立。
//   3. 「新建卡片」存编辑框当前内容，并成为当前生效；分叉场景走切换面板里的「另存为卡片」。
//   4. 改名 / 删除收进「当前生效」那一行的行内操作（操作对象 = 当前卡），不再每张卡挂三颗按钮。
//   5. 预览折叠成一行，展开后在「官方全文 / 实际生效」间切换；需要对照时才占版面。
//
// 二、视觉：全套内核设计系统原语（Button / Switch / SegmentedControl / Input / Pill / Tag /
//   DisclosureRow + 官方图标），颜色与圆角走 --dsw-* 变量 —— 与「内置插件」等既有设置页同语言，
//   不再是自绘 checkbox / select。
//
// 三、宿主与协议**完全不动**（lib/index.js、API_PROTO=3、$DSH_HOME/prompt-custom.json 文件格式
//   全不变）：纯界面重做，老配置原样可用；宿主没重启（proto≠3）时卡片区照旧整体禁用并说清原因。
window.__ModuleLoader__.load({
  id: "@dsh-pack/dsh-prompt-custom",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const react = require("react");
    const { jsx, jsxs } = require("react/jsx-runtime");
    // 内核设计系统原语（与 dsh-wsl-settings 等伴随插件同款引入姿势：顶部一次性引入）。
    const {
      Button, Switch, SegmentedControl, Input, Pill, Tag, DisclosureRow,
      IconPlusOutlineRegular, IconChevronDownOutlineRegular
    } = require("@deepseek-ai/dsh-client-ui-primitives");

    const CONFIG_URL = "/api/dsh-prompt-custom/config";
    const PREVIEW_URL = "/api/dsh-prompt-custom/preview";
    // 必须与 host 半边的 API_PROTO 一致。改协议号时**只改两处**：host 的 API_PROTO、这里的 EXPECT_PROTO。
    // 3（0.4.0 起）：config 增加了 cards 字段；旧宿主（proto 2）会静默丢弃它，卡片区必须据此禁用。
    const EXPECT_PROTO = 3;

    const L = {
      nav: "自定义提示词",
      title: "自定义提示词",
      sub: "编辑注入内核的系统提示词：追加到默认人设之后，或整体替换默认人设。开关与注入方式即时生效；正文改动对下一次模型装配生效，无需新建会话。",
      enabled: "启用自定义提示词",
      enabledHint: "关闭后回落为官方默认提示词（即时生效，不需要点保存）",
      mode: "注入方式",
      modeHint: "追加 = 保留默认人设；替换 = 覆盖默认人设。切换即时生效（挂载点不同，会重新注入）。",
      modeAppend: "追加到末尾",
      modeReplace: "替换整体",
      text: "提示词内容",
      textHint: "按原样注入；可用 {{model}} {{cwd}} 等内核变量。",
      savePlain: "保存并生效",
      saveTo: (name) => "保存到「" + name + "」并生效",
      revert: "还原改动",
      saving: "应用中…",
      saved: "已保存并生效",
      savedToCard: (name) => "已保存到卡片「" + name + "」并生效。",
      loading: "加载中…",
      unavailable: "设置不可用（需要在本机浏览器中打开）",
      dirtyTag: "未保存",
      previewTitle: "预览",
      previewOfficial: "官方全文",
      previewEffective: "实际生效",
      previewHintOfficial: "官方全文，不含本插件的自定义节 —— 对照着写替换内容用。",
      previewHintEffective: "模型这一步真正看到的全文（已含自定义节）。",
      previewReload: "重新加载",
      previewing: "加载中…",
      previewNoAgent: "当前没有活动会话，暂时只能看到全局视图；新建会话后再看「实际生效」更准。",
      staleHost: "⚠ 界面与宿主插件版本不一致：页面已经刷新（新界面），但宿主进程没有重启（旧插件）。请**完全退出** DeepSeek Harness（含托盘/任务管理器里的残留进程）再启动 —— 只刷新页面不会重载宿主插件。重启之前：预览可能退化为旧接口的文本，提示词卡无法使用。",
      unknownCfgKeys: (keys) => "⚠ 配置文件里有本版本不认识的字段：" + keys + "。这通常说明该文件是**另一个版本**的插件写的 —— 当前版本可能没有读到你先前的设置。请先备份配置文件再继续操作。",
      previewError: "预览加载失败",
      varWarn: (names) => "警告：这些变量内核不认识 —— " + names + "。内核遇到未知变量会直接报错，导致每一轮运行失败，请改成正确的变量名或删掉。",
      varMalformed: (names) => "警告：这些引用写法不合法 —— " + names + "。变量名只能是 [a-z][a-z0-9_]*。",
      storage: "配置文件",
      stOff: "已停用：回落为官方默认提示词",
      stArmed: "已启用：新建会话时自动注入",
      stInjected: (n) => "已生效：当前 " + n + " 个会话已注入",
      stError: (m) => "注入失败：" + m,
      cardsTitle: "提示词卡",
      cardsHint: "点卡片即切换并生效；正文改动用下方按钮写回当前卡。",
      cardsAdd: "新建卡片",
      cardsEmpty: "还没有提示词卡。把编辑好的提示词「新建卡片」存起来，之后点一下卡片就能切换。",
      cardsVirtual: "当前正文",
      cardsCurrent: (name, len) => "当前生效：卡片「" + name + "」 · " + len + " 字符",
      cardsCurrentCustom: (len) => "当前正文：自定义（未存入卡片） · " + len + " 字符",
      cardsCurrentNone: "当前正文为空",
      cardsRename: "改名",
      cardsRemove: "删除",
      cardsRenameLabel: "新名字",
      cardsNamePlaceholder: "给卡片起个名字（留空自动命名）",
      cardsRenameSave: "保存名字",
      cardsCancel: "取消",
      cardsRemoveAsk: (name) => "删除卡片「" + name + "」？删除后无法撤回。",
      cardsRemoveConfirm: "确认删除",
      cardsAddHint: "存的是编辑框里的当前内容（含未保存改动），并存为当前生效。",
      cardsSave: "存为卡片",
      cardsNoteAdded: (name) => "已存为卡片「" + name + "」并生效。",
      cardsNoteUsed: (name) => "已切换到卡片「" + name + "」并生效。",
      cardsNoteSavedSwitched: (saved, used) => "已保存到卡片「" + saved + "」，并切换到「" + used + "」。",
      cardsNoteForkedSwitched: (forked, used) => "已另存为新卡「" + forked + "」，并切换到「" + used + "」。",
      cardsNoteRemoved: (name) => "卡片「" + name + "」已删除。",
      cardsNoteRenamed: (name) => "卡片已改名为「" + name + "」。",
      cardsUseDirty: "编辑框里有未保存的改动，切换卡片前先处置：",
      cardsSwitchSave: (name) => "保存到「" + name + "」并切换",
      cardsSwitchFork: "另存为卡片并切换",
      cardsSwitchDiscard: "丢弃改动并切换",
      cardsLimit: "卡片数量已达上限（最多 50 张）。",
      cardsStale: "宿主插件还是旧版本，提示词卡暂时无法使用 —— 请完全退出 DeepSeek Harness 再启动后使用。"
    };

    /** 把 /config 返回的 armed / injected / lastError 翻成一句人能看懂的状态。 */
    function statusLine(st) {
      if (!st) return null;
      if (st.lastError) return { text: L.stError(st.lastError), tone: "error" };
      // 旧版 host 不返回 armed/injected：这时无从判断，宁可不显示，
      // 也不要因为 !undefined 而谎报「已停用」（跨版本混装时会反向骗人）。
      if (st.armed === undefined && st.injected === undefined) return null;
      if (!st.armed) return { text: L.stOff, tone: "muted" };
      if (st.injected > 0) return { text: L.stInjected(st.injected), tone: "ok" };
      return { text: L.stArmed, tone: "muted" };
    }

    // 提示词卡上限：必须与 host 的 MAX_CARDS 一致（宿主会截断，这里先把入口封住）。
    const CARDS_MAX = 50;

    /** 卡片 id：本机自用、与后端无耦合；形状与 host 的 CARD_ID 校验正则配对。 */
    function newCardId() {
      return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    /** 名字建议：取第一行（去掉标题符号）截 24 字符；没有内容就按序号兜底。 */
    function suggestName(text, count) {
      const line = String(text || "")
        .split("\n")
        .map((s) => s.replace(/^#+\s*/, "").trim())
        .find((s) => s.length > 0) || "";
      return line ? line.slice(0, 24) : "提示词卡 " + (count + 1);
    }

    function note(text, tone) {
      return jsx("div", {
        style: {
          fontSize: 12,
          lineHeight: "18px",
          color: tone === "error" ? "var(--dsw-alias-label-error)"
            : (tone === "warn" ? "var(--dsw-alias-state-warn-primary)" : undefined),
          opacity: tone === "muted" ? 0.75 : 1,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word"
        },
        children: text
      });
    }

    // 内联样式：颜色与圆角走内核设计系统变量（--dsw-*），与「内置插件」等既有设置页同语言。
    const S = {
      root: { display: "flex", flexDirection: "column", gap: 14, padding: 16, maxWidth: 720 },
      head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
      h2: { margin: 0, fontSize: 16, fontWeight: 600, color: "var(--dsw-alias-label-primary)" },
      sub: { fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)" },
      hint: { fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)" },
      field: { display: "flex", flexDirection: "column", gap: 6 },
      fieldTitle: { fontSize: 13, fontWeight: 600, color: "var(--dsw-alias-label-primary)" },
      row: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
      panel: {
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "8px 10px",
        border: "1px solid var(--dsw-alias-border-l3)",
        borderRadius: "var(--dsw-radius-md)",
        background: "var(--dsw-alias-bg-layer-3)"
      },
      warnPanel: {
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "8px 10px",
        border: "1px solid var(--dsw-alias-state-warn-primary)",
        borderRadius: "var(--dsw-radius-md)",
        background: "var(--dsw-alias-bg-layer-3)"
      },
      textarea: {
        width: "100%", boxSizing: "border-box", padding: "8px 10px",
        fontFamily: "inherit", fontSize: 13, lineHeight: "20px",
        color: "var(--dsw-alias-label-primary)",
        background: "var(--dsw-alias-bg-layer-2)",
        border: "1px solid var(--dsw-alias-border-l2)",
        borderRadius: "var(--dsw-radius-md)",
        resize: "vertical", outline: "none"
      },
      mono: {
        width: "100%", boxSizing: "border-box", padding: "8px 10px",
        fontFamily: "monospace, inherit", fontSize: 12, lineHeight: "18px",
        color: "var(--dsw-alias-label-primary)",
        background: "var(--dsw-alias-bg-layer-2)",
        border: "1px solid var(--dsw-alias-border-l2)",
        borderRadius: "var(--dsw-radius-md)",
        resize: "vertical", outline: "none"
      }
    };

    const EMPTY = { enabled: false, mode: "append", text: "", cards: [] };

    function Card() {
      const [cfg, setCfg] = react.useState(EMPTY);           // 编辑框态（正文可能未保存）
      const [savedCfg, setSavedCfg] = react.useState(EMPTY); // 服务端已保存的配置（卡片真值）
      const [state, setState] = react.useState("loading");
      const [busy, setBusy] = react.useState(false);
      const [notice, setNotice] = react.useState("");
      const [cardNotice, setCardNotice] = react.useState("");
      const [vars, setVars] = react.useState({ unknown: [], malformed: [] });
      const [file, setFile] = react.useState("");
      const [st, setSt] = react.useState(null);
      // 宿主进程没重启、页面却刷新过时，接口会缺字段（见 L.staleHost）。
      const [stale, setStale] = react.useState(false);
      // 配置文件里有本版本不认识的键（配置 schema 演进的保护，见 L.unknownCfgKeys）。
      const [cfgKeys, setCfgKeys] = react.useState([]);
      // 预览：默认收起，展开后按需拉取（懒加载，不常驻半屏高度）。
      const [previewOpen, setPreviewOpen] = react.useState(false);
      const [previewKind, setPreviewKind] = react.useState("official");
      const [preview, setPreview] = react.useState(null);    // { kind, text, error }
      const [previewBusy, setPreviewBusy] = react.useState(false);
      // 卡片区的瞬时 UI 状态（卡片真值只在 savedCfg.cards，这里全是过程态）。
      const [adding, setAdding] = react.useState(false);    // 「新建卡片」面板展开
      const [newName, setNewName] = react.useState("");
      const [pending, setPending] = react.useState(null);   // 待确认 { kind: "use"|"remove"|"rename", id }
      const [renameText, setRenameText] = react.useState("");

      const applyStatus = (data) => {
        setSt({ armed: data.armed, injected: data.injected, lastError: data.lastError });
        setVars({ unknown: data.unknownVariables || [], malformed: data.malformedVariables || [] });
        setCfgKeys(data.unknownConfigKeys || []);
      };

      const load = react.useCallback(async () => {
        try {
          const resp = await fetch(CONFIG_URL, { headers: { accept: "application/json" } });
          const data = await resp.json();
          if (!resp.ok || !data || data.ok === false) { setState("error"); return; }
          const c = data.config || EMPTY;
          setCfg(c);
          setSavedCfg(c);
          setFile(data.path || "");
          setStale(data.proto !== EXPECT_PROTO);
          applyStatus(data);
          setState("ready");
        } catch (e) { setState("error"); }
      }, []);

      react.useEffect(() => { load(); }, [load]);

      const loadPreview = react.useCallback(async (kind) => {
        setPreviewBusy(true);
        try {
          const resp = await fetch(PREVIEW_URL, { headers: { accept: "application/json" } });
          const data = await resp.json();
          if (!resp.ok || !data || data.ok === false) throw new Error((data && data.message) || ("HTTP " + resp.status));
          // 宿主旧接口只有 text：退化为它，而不是显示一个空框让用户猜。
          const fromNew = kind === "effective" ? data.effective : data.official;
          const text = fromNew !== undefined ? fromNew : data.text;
          setPreview({ kind: kind, text: String(text || "(空)") });
          setStale(data.proto !== EXPECT_PROTO);
          applyStatus(data);
        } catch (e) {
          setPreview({ kind: kind, text: L.previewError + ": " + String((e && e.message) || e), error: true });
        } finally { setPreviewBusy(false); }
      }, []);

      // preview 在 post 的闭包里会是旧值，用 ref 取当前显示的预览类型。
      const previewRef = react.useRef(null);
      react.useEffect(() => { previewRef.current = preview; }, [preview]);

      /** 统一的写入口。成功后对齐已保存态、刷新加载过的预览；失败返回 null 并把原文摆到界面上。 */
      const post = async (body) => {
        const payload = {
          enabled: !!body.enabled,
          mode: body.mode === "replace" ? "replace" : "append",
          text: String(body.text || "")
        };
        // cards 只按数组透传（卡片类操作才带）：正文/开关操作不碰卡片集，
        // 宿主对「未提供」与「非数组」两侧都有保护（见 index.js 的 POST 路由）。
        if (Array.isArray(body.cards)) payload.cards = body.cards;
        setBusy(true); setNotice("");
        try {
          const resp = await fetch(CONFIG_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });
          const data = await resp.json();
          if (!resp.ok || !data || data.ok === false) throw new Error((data && data.message) || ("HTTP " + resp.status));
          setSavedCfg(data.config || body);
          applyStatus(data);
          const shown = previewRef.current;
          if (shown && !shown.error) loadPreview(shown.kind); // 已加载过的预览不许停在旧文本上
          return data;
        } catch (e) {
          setNotice(String((e && e.message) || e));
          return null;
        } finally { setBusy(false); }
      };

      /**
       * 开关 / 模式即时生效。正文一律用**已保存**的那份，
       * 避免把用户编辑到一半、还没点保存的内容偷偷写进去。
       */
      const applyShape = async (patch) => {
        const next = {
          enabled: patch.enabled !== undefined ? patch.enabled : savedCfg.enabled,
          mode: patch.mode !== undefined ? patch.mode : savedCfg.mode,
          text: savedCfg.text
        };
        setCfg((prev) => Object.assign({}, prev, patch));
        const ok = await post(next);
        if (!ok) {
          // 失败就把开关/模式拉回服务端真实状态，绝不让界面显示一个没生效的值。
          setCfg((prev) => Object.assign({}, prev, { enabled: savedCfg.enabled, mode: savedCfg.mode }));
        }
      };

      // ---- 派生状态 ----
      const liveText = String(savedCfg.text || "");   // 已保存正文（模型真正吃到的）
      const editorText = String(cfg.text || "");      // 编辑框里的（可能未保存）
      const dirtyText = editorText !== liveText;
      const cards = Array.isArray(savedCfg.cards) ? savedCfg.cards : [];
      // 「当前卡」= 已保存正文恰好等于某张卡的文本；空正文不认卡（避免把空卡误标高亮）。
      const activeCard = liveText !== ""
        ? (cards.find((c) => String(c.text || "") === liveText) || null)
        : null;
      const pendingCard = pending ? (cards.find((c) => c.id === pending.id) || null) : null;
      const cardsGated = busy || stale;               // stale = 旧宿主会静默丢 cards，一律禁写
      const cardUiBusy = cardsGated || !!pendingCard || adding;
      const saveLabel = (activeCard && !stale) ? L.saveTo(activeCard.name) : L.savePlain;

      /** 切换：把该卡文本设为「已保存正文」并立即生效（成功回应才动编辑框）。 */
      const applyCardText = async (card) => {
        const text = String(card.text || "");
        const ok = await post({ enabled: savedCfg.enabled, mode: savedCfg.mode, text: text });
        if (ok) {
          setCfg((prev) => Object.assign({}, prev, { text: text }));
          setCardNotice(L.cardsNoteUsed(card.name));
          setPending(null);
        }
        return ok;
      };

      /** 点芯片：切换并立即生效；编辑框有未保存改动时先停下，三个出口都摆明后果。 */
      const useCard = (card) => {
        if (cardUiBusy || !card) return;
        if (activeCard && card.id === activeCard.id) return; // 点当前卡＝无操作
        if (dirtyText) { setCardNotice(""); setPending({ kind: "use", id: card.id }); return; }
        return applyCardText(card);
      };

      /** 三选①「保存到当前卡并切换」：一次 POST 写回当前卡 + 切到目标卡。 */
      const switchSaving = async () => {
        const target = pendingCard;
        if (!target || !activeCard || cardsGated) return;
        const ok = await post({
          enabled: savedCfg.enabled, mode: savedCfg.mode, text: String(target.text || ""),
          cards: cards.map((c) => (c.id === activeCard.id ? Object.assign({}, c, { text: editorText }) : c))
        });
        if (ok) {
          setCfg((prev) => Object.assign({}, prev, { text: String(target.text || "") }));
          setCardNotice(L.cardsNoteSavedSwitched(activeCard.name, target.name));
          setPending(null);
        }
      };

      /** 三选②「另存为卡片并切换」：编辑框内容存为新卡，再切到目标卡（一次 POST）。 */
      const switchForking = async () => {
        const target = pendingCard;
        if (!target || cardsGated || cards.length >= CARDS_MAX) return;
        const name = suggestName(editorText, cards.length);
        const fork = { id: newCardId(), name: name, text: editorText };
        const ok = await post({
          enabled: savedCfg.enabled, mode: savedCfg.mode, text: String(target.text || ""),
          cards: cards.concat([fork])
        });
        if (ok) {
          setCfg((prev) => Object.assign({}, prev, { text: String(target.text || "") }));
          setCardNotice(L.cardsNoteForkedSwitched(name, target.name));
          setPending(null);
        }
      };

      /** 三选③「丢弃改动并切换」：直接切到目标卡，未保存编辑随成功回应被覆盖。 */
      const switchDiscarding = () => {
        const target = pendingCard;
        if (!target || cardsGated) return;
        return applyCardText(target);
      };

      const openAdd = () => {
        if (cardsGated || cards.length >= CARDS_MAX) return;
        setCardNotice("");
        setPending(null);
        setNewName(suggestName(editorText, cards.length));
        setAdding(true);
      };

      const cancelAdd = () => { setAdding(false); setNewName(""); };

      /** 「存为卡片」：存的是编辑框当前内容（含未保存改动），并成为当前生效。 */
      const submitAdd = async () => {
        if (cardsGated || cards.length >= CARDS_MAX) return;
        const name = newName.trim() || suggestName(editorText, cards.length);
        const card = { id: newCardId(), name: name, text: editorText };
        const ok = await post({
          enabled: savedCfg.enabled, mode: savedCfg.mode, text: editorText,
          cards: cards.concat([card])
        });
        if (ok) {
          setCardNotice(L.cardsNoteAdded(name));
          cancelAdd();
        }
      };

      const openRename = (card) => {
        if (cardUiBusy || !card) return;
        setCardNotice("");
        setRenameText(String(card.name || ""));
        setPending({ kind: "rename", id: card.id });
      };

      /** 改名：只动名字，正文与其他字段不动。 */
      const submitRename = async () => {
        const target = pendingCard;
        if (!target || cardsGated) return;
        const name = renameText.trim() || target.name;
        const ok = await post({
          enabled: savedCfg.enabled, mode: savedCfg.mode, text: liveText,
          cards: cards.map((c) => (c.id === target.id ? Object.assign({}, c, { name: name }) : c))
        });
        if (ok) {
          setCardNotice(L.cardsNoteRenamed(name));
          setPending(null);
        }
      };

      const openRemove = (card) => {
        if (cardUiBusy || !card) return;
        setCardNotice("");
        setPending({ kind: "remove", id: card.id });
      };

      /** 删除：二次确认后写盘；删的是当前卡时正文留在原地（只是不再属于任何卡）。 */
      const submitRemove = async () => {
        const target = pendingCard;
        if (!target || cardsGated) return;
        const ok = await post({
          enabled: savedCfg.enabled, mode: savedCfg.mode, text: liveText,
          cards: cards.filter((c) => c.id !== target.id)
        });
        if (ok) {
          setCardNotice(L.cardsNoteRemoved(target.name));
          setPending(null);
        }
      };

      /**
       * 保存正文：正文来自某张卡时**同时写回该卡**（编辑→保存→卡片同步的闭环）；
       * stale（旧宿主不认 cards）时只保存正文，不演「存了卡片」。
       */
      const save = async () => {
        if (busy) return;
        const target = stale ? null : activeCard;
        const next = { enabled: cfg.enabled, mode: cfg.mode, text: editorText };
        if (target) next.cards = cards.map((c) => (c.id === target.id ? Object.assign({}, c, { text: editorText }) : c));
        const ok = await post(next);
        if (ok && !ok.lastError) setNotice(target ? L.savedToCard(target.name) : L.saved);
      };

      /** 还原改动：编辑框拉回已保存正文（不动服务端）。 */
      const revert = () => setCfg((prev) => Object.assign({}, prev, { text: liveText }));

      /** 展开预览时懒加载一次；已加载过的不重复抓（改动生效时 post 会自动刷新）。 */
      const togglePreview = () => {
        const next = !previewOpen;
        setPreviewOpen(next);
        if (next && !preview) loadPreview(previewKind);
      };

      if (state === "loading") return jsx("div", { children: L.loading });
      if (state === "error") return jsx("div", { children: L.unavailable });

      const stView = statusLine(st);
      const currentLabel = activeCard
        ? L.cardsCurrent(activeCard.name, liveText.length)
        : (liveText !== "" ? L.cardsCurrentCustom(liveText.length) : L.cardsCurrentNone);

      return jsxs("div", {
        style: S.root,
        children: [
          // —— 标题行：标题 + 当前生效状态 ——
          jsxs("div", {
            style: S.head,
            children: [
              jsx("h2", { style: S.h2, children: L.title }),
              stView ? jsx(Tag, {
                tone: stView.tone === "ok" ? "success" : (stView.tone === "error" ? "danger" : "neutral"),
                children: stView.text
              }) : null
            ]
          }),
          jsx("div", { style: S.sub, children: L.sub }),
          stale ? note(L.staleHost, "error") : null,
          cfgKeys.length ? note(L.unknownCfgKeys(cfgKeys.map((k) => "`" + k + "`").join("、")), "error") : null,

          // —— 注入行为（即时生效） ——
          jsxs("div", {
            style: S.row,
            children: [
              jsx(Switch, {
                checked: !!cfg.enabled,
                disabled: busy,
                onChange: (next) => applyShape({ enabled: next }),
                label: L.enabled
              }),
              jsx("span", { style: S.hint, children: L.enabledHint })
            ]
          }),
          jsxs("div", {
            style: S.row,
            children: [
              jsx(SegmentedControl, {
                id: "dsh-prompt-custom-mode",
                value: cfg.mode === "replace" ? "replace" : "append",
                disabled: busy,
                label: L.mode,
                onChange: (next) => applyShape({ mode: next }),
                options: [
                  { value: "append", label: L.modeAppend },
                  { value: "replace", label: L.modeReplace }
                ]
              }),
              jsx("span", { style: S.hint, children: L.modeHint })
            ]
          }),

          // —— 提示词卡：点选切换 + 新建 ——
          jsxs("div", {
            style: S.field,
            children: [
              jsxs("div", {
                style: S.row,
                children: [
                  jsx("span", { style: S.fieldTitle, children: L.cardsTitle }),
                  jsx("span", { style: S.hint, children: L.cardsHint }),
                  !adding ? jsx(Button, {
                    variant: "ghost",
                    size: "sm",
                    icon: jsx(IconPlusOutlineRegular, {}),
                    disabled: cardsGated || cards.length >= CARDS_MAX,
                    style: { marginLeft: "auto" },
                    onClick: openAdd,
                    children: L.cardsAdd
                  }) : null,
                  !adding && cards.length >= CARDS_MAX ? jsx("span", { style: S.hint, children: L.cardsLimit }) : null
                ]
              }),
              stale ? note(L.cardsStale, "error") : null,
              cards.length > 0 ? jsxs("div", {
                style: S.row,
                children: [
                  ...cards.map((card) => jsx(Pill, {
                    key: card.id,
                    active: activeCard ? card.id === activeCard.id : false,
                    disabled: cardUiBusy,
                    title: String(card.text || "").length + " 字符",
                    onClick: () => useCard(card),
                    children: card.name
                  })),
                  !activeCard && liveText.trim() !== ""
                    ? jsx(Pill, { active: true, children: L.cardsVirtual })
                    : null
                ]
              }) : null,
              cards.length === 0 ? note(L.cardsEmpty, "muted") : null,
              jsxs("div", {
                style: S.row,
                children: [
                  jsx("span", { style: S.hint, children: currentLabel }),
                  activeCard && !pendingCard && !adding ? jsx(Button, {
                    variant: "ghost", size: "sm", disabled: cardsGated,
                    style: { marginLeft: "auto" },
                    onClick: () => openRename(activeCard),
                    children: L.cardsRename
                  }) : null,
                  activeCard && !pendingCard && !adding ? jsx(Button, {
                    variant: "ghost", size: "sm", disabled: cardsGated,
                    onClick: () => openRemove(activeCard),
                    children: L.cardsRemove
                  }) : null
                ]
              }),
              // 行内面板：新建 / 切换三选 / 改名 / 删除，同一时刻只会有一个。
              adding ? jsxs("div", {
                style: S.panel,
                children: [
                  jsx(Input, {
                    value: newName,
                    disabled: busy,
                    placeholder: L.cardsNamePlaceholder,
                    style: { width: 260 },
                    onChange: (e) => setNewName(e.target.value),
                    onKeyDown: (e) => { if (e.key === "Enter") submitAdd(); }
                  }),
                  jsx(Button, { variant: "primary", size: "sm", disabled: busy, onClick: submitAdd, children: L.cardsSave }),
                  jsx(Button, { variant: "ghost", size: "sm", disabled: busy, onClick: cancelAdd, children: L.cardsCancel }),
                  jsx("span", { style: S.hint, children: L.cardsAddHint })
                ]
              }) : null,
              pending && pending.kind === "use" && pendingCard ? jsxs("div", {
                style: S.warnPanel,
                children: [
                  jsx("span", { style: S.hint, children: L.cardsUseDirty }),
                  jsx(Button, {
                    variant: "primary", size: "sm", disabled: busy,
                    onClick: activeCard ? switchSaving : switchForking,
                    children: activeCard ? L.cardsSwitchSave(activeCard.name) : L.cardsSwitchFork
                  }),
                  activeCard ? jsx(Button, {
                    variant: "ghost", size: "sm", disabled: busy,
                    onClick: switchForking,
                    children: L.cardsSwitchFork
                  }) : null,
                  jsx(Button, { variant: "ghost", size: "sm", disabled: busy, onClick: switchDiscarding, children: L.cardsSwitchDiscard }),
                  jsx(Button, { variant: "ghost", size: "sm", disabled: busy, onClick: () => setPending(null), children: L.cardsCancel })
                ]
              }) : null,
              pending && pending.kind === "rename" && pendingCard ? jsxs("div", {
                style: S.panel,
                children: [
                  jsx("span", { style: S.hint, children: L.cardsRenameLabel }),
                  jsx(Input, {
                    value: renameText,
                    disabled: busy,
                    style: { width: 260 },
                    onChange: (e) => setRenameText(e.target.value),
                    onKeyDown: (e) => { if (e.key === "Enter") submitRename(); }
                  }),
                  jsx(Button, { variant: "primary", size: "sm", disabled: busy, onClick: submitRename, children: L.cardsRenameSave }),
                  jsx(Button, { variant: "ghost", size: "sm", disabled: busy, onClick: () => setPending(null), children: L.cardsCancel })
                ]
              }) : null,
              pending && pending.kind === "remove" && pendingCard ? jsxs("div", {
                style: S.panel,
                children: [
                  jsx("span", { style: S.hint, children: L.cardsRemoveAsk(pendingCard.name) }),
                  jsx(Button, { variant: "ghost", size: "sm", disabled: busy, onClick: submitRemove, children: L.cardsRemoveConfirm }),
                  jsx(Button, { variant: "ghost", size: "sm", disabled: busy, onClick: () => setPending(null), children: L.cardsCancel })
                ]
              }) : null,
              cardNotice ? jsx("span", { style: S.hint, children: cardNotice }) : null
            ]
          }),

          // —— 正文编辑 ——
          jsxs("div", {
            style: S.field,
            children: [
              jsx("span", { style: S.fieldTitle, children: L.text }),
              jsx("textarea", {
                value: editorText,
                rows: 12,
                spellCheck: false,
                placeholder: "You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.",
                style: S.textarea,
                onChange: (e) => setCfg((prev) => Object.assign({}, prev, { text: e.target.value }))
              }),
              jsxs("div", {
                style: S.row,
                children: [
                  jsx(Button, { variant: "primary", disabled: busy, onClick: save, children: busy ? L.saving : saveLabel }),
                  dirtyText ? jsx(Button, { variant: "ghost", disabled: busy, onClick: revert, children: L.revert }) : null,
                  dirtyText ? jsx(Tag, { tone: "warning", children: L.dirtyTag }) : null,
                  notice ? jsx("span", { style: S.hint, children: notice }) : null
                ]
              }),
              jsx("span", { style: S.hint, children: L.textHint })
            ]
          }),

          // —— 变量告警（内核 renderPrompt 遇到未知变量会抛错，这里必须提前说） ——
          vars.malformed.length ? note(L.varMalformed(vars.malformed.map((n) => "{{" + n + "}}").join("、")), "warn") : null,
          vars.unknown.length ? note(L.varWarn(vars.unknown.map((n) => "{{" + n + "}}").join("、")), "warn") : null,

          // —— 预览（折叠一行，展开后按需拉取） ——
          jsx(DisclosureRow, {
            icon: jsx(IconChevronDownOutlineRegular, {}),
            title: L.previewTitle,
            open: previewOpen,
            expandable: true,
            // 整行可点 + 键盘可达（默认 false 只剩行首小箭头按钮，太小、难发现）。
            expandOnRowClick: true,
            onToggle: togglePreview,
            children: previewOpen ? [
              jsxs("div", {
                style: S.row,
                children: [
                  jsx(SegmentedControl, {
                    id: "dsh-prompt-custom-preview",
                    value: previewKind,
                    disabled: previewBusy,
                    label: L.previewTitle,
                    onChange: (next) => { setPreviewKind(next); loadPreview(next); },
                    options: [
                      { value: "official", label: L.previewOfficial },
                      { value: "effective", label: L.previewEffective }
                    ]
                  }),
                  jsx(Button, {
                    variant: "ghost", size: "sm", disabled: previewBusy,
                    onClick: () => loadPreview(previewKind),
                    children: previewBusy ? L.previewing : L.previewReload
                  }),
                  jsx("span", { style: S.hint, children: previewKind === "effective" ? L.previewHintEffective : L.previewHintOfficial })
                ]
              }),
              preview && preview.error
                ? note(preview.text, "error")
                : jsx("textarea", {
                    value: preview && !preview.error ? preview.text : "",
                    readOnly: true,
                    rows: 14,
                    spellCheck: false,
                    style: S.mono
                  }),
              preview && !preview.error && preview.kind === "effective" && !(st && st.injected)
                ? note(L.previewNoAgent, "muted")
                : null
            ] : null
          }),

          file ? jsx("div", { style: S.hint, children: L.storage + ": " + file }) : null
        ]
      });
    }

    function apply(ctx) {
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "dsh-prompt-custom",
        order: 60,
        label: () => L.nav
      }, (props) => jsx(Card, props)));
    }

    const inject = ["slots"];
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
