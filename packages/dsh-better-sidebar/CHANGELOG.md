# @dsh-pack/dsh-better-sidebar

## 0.24.3

### Patch Changes

- 修复插件在官方 DeepSeek Harness 桌面客户端 0.2.0-rc.2 下**整体不加载**的问题，并补齐官方右栏（`@deepseek-ai/dsh-client-ui-sidebar-right` 0.2.0-rc.2）的接口对接。
  
  **症状**：右侧边栏展开后的「开始」页里没有「侧边工作台」卡片，标签栏里也没有对应标签；设置页里也没有本插件的那一节——而**启动日志干干净净，一条报错都没有**。
  
  **根因（真机取证，非推测）**：宿主半边在 import 期抛错 → 条目 `fiber=NO-FIBER`；`dsh-client-modules` 的 `processOne()` 见到 `entry.fiber === void 0` 会直接跳过，于是整个包**不进客户端启动图**，页内半边从未执行。
  
  具体三点：
  
  - 包自己的 `node_modules/@deepseek-ai/` 里带着 16 份内核包老拷贝（其中 `@deepseek-ai/schemastery@3.18.1`）。插件是按绝对路径加载的，Node 先看包自己的 `node_modules`，老拷贝因此遮蔽内核的 `3.18.4`；而 `.volatile()` 是本仓 fork 才有的扩展，`lib/index.js` 的 Config schema 用了 25 处，import 期直接抛 `z.boolean(...).volatile is not a function`。
  - `intercept.tsx` 在 `ctx.workspaces` 缺席时不再抛错（可选链 + 兜底空 disposer）。
  - 内核右栏接驳层按 0.2.0-rc.2 的真实形状重写：`mounted` 现在是 `sessions.onScreen`，新增 `openTabIn` / `tabsIn`，视图挂载与标签变更都走响应式订阅，不再依赖容易在 React 提交时序上落空的 MutationObserver 单点判断；会话 id 解析增加「`retainedBy.mainView > 0` → `ids[0]`」兜底，避免首帧取不到会话导致整块面板不渲染。
  
  **同时**：标签标题统一为「侧边工作台」；`Config` 的 `z` 改为从 `@deepseek-ai/schemastery` 取（本仓 fork）；`tsdown` 的页内 bundle 注册名从 package.json 的 `name` 推导，避免与内核 boot graph 的包名键错位。
  
  **新增门禁**：`tools/audit/kernel-shadow.js`（已接入 `tools/audit/index.js`）专门拦「本地 `@deepseek-ai/*` 拷贝遮蔽内核」这一类静默砖化；`tools/itest/pack-audit.mjs` 修掉两处 Windows 可移植性缺陷（GNU tar 专有的 `--force-local` 与 CRLF 未裁剪），此前该发布门禁在 Windows 上对所有包一律误报、等于从未真正校验过。

## 0.15.4

### Patch Changes

- 修「插件槽位整条崩掉、控制台 Minified React error #130」。

  `#130` 的判词是「元素类型是 undefined」——即我们渲染了一个 `undefined` 组件。
  真机现象是两条 slot 消失（`sidebar.footer.action` 与 `shell.overlay`），
  因为一个 undefined 组件会带走整条 slot 的渲染。

  根因：**图标成员名取自旧内核的命名**。旧版 `@deepseek-ai/dsh-client-ui-primitives`
  导出的是带尺寸后缀的名字（`IconApiOutline14`、`IconFolderOpenOutline16`），
  现内核（0.1.7-rc.1）的导出里**没有任何数字后缀**，同一图标按变体拆成
  `IconApiOutlineRegular` / `…Medium` / `…Artwork`。成员取到 `undefined` 后当组件渲染，
  就报 #130。`node_modules` 里残留的 0.1.1-rc.1 内核拷贝正是旧命名的来源，
  所以本地看 grep 有、真机加载就炸。

  - 8 个页内 bundle、169 处引用改成 `…Regular`（`tools/codemod/fix-icon-size-suffix.mjs`，
    逐名对快照核验，目标名不存在则拒绝写盘）。
  - `tools/audit/extract-kernel-snapshots.mjs` 改为解析 primitives **真实的
    `export { … }` 块**（新产出 `kernel-primitives-icons.json`，186 个名字），
    取代原先「扫任意大写标识符」的瞎猜 —— 那个版本把不存在的裸名
    `IconSearchOutline` 也判成合法，属假绿。
  - `tools/audit/namespace.js` 加第 ⑤b 条判据：页内 bundle 里对 primitives 的
    `Icon*` 成员访问必须命中快照，快照缺失时 fail-closed。

  验证（不靠推断，逐名对着 app.asar 核对）：从官方客户端
  `resources/app.asar` 解出 primitives 的真实导出 **186 个 Icon**，与仓库快照
  **双向相等（缺 0 / 多 0）**；扫我们全部包，引用 **32 种 / 169 处 Icon 成员，
  不存在者 0 处**。隔离实例真启动、全量启用，控制台 **#130 归零**。

- 修「装了却不挂载」，并退役阶梯分层元包。

  **22 个插件的页内 bundle 注册名改成包名。** 官方客户端真机一次报 20 条
  `client-modules: could not load "@dsh-pack/x": loaded without registering "@dsh-pack/x"
  via __ModuleLoader__.load`。内核 boot graph 行以**包名**为键
  （`dsh-client-modules/lib/client.js:625`），而 `register()` 的键是
  `stripClientSuffix(registration.id)`（同文件 569），我们的 bundle 却注册裸名
  （`'dsh-input-fold'`）或换代前的 `@dsh-external/…`，那一行永远等不到。失败形态是
  静默不挂载：宿主照常起来、插件没反应，所以补了一条 P0 门禁
  （`tools/audit/publish-readiness.js`）而不只是改一次。

  **`@dsh-pack/core` / `plus` / `knowledge` / `pocket` / `bridge` / `compaction` 退役，
  只留 `@dsh-pack/all`。** 阶梯分层在内核语义下不成立：`applyEntryPatches` 处理 `insert`
  是 `data.push(...insert)`，不按 id 去重（整行替换只作用于覆盖型补丁），所以两个元包同装
  会把共有成员装配两次，第二次注册路由即报 `webserver: duplicate exact route` ——
  真机那批「N entries did not activate」的成因。用内核自己的 `composeEntries` 实测
  core+all = 18 个重复 id。原来装过这些层的用户请改装 `@dsh-pack/all`。

  ⚠ 随之而来的使用约束：**装了 `all` 就不要再单独装其中的某个成员插件**，
  那同样会把那个成员插两次。想要小集合就别装 `all`，按用途分组单装。

- 修「内核 0.1.7-rc.1 移除 `Session.events` 后，五个包对它的读取全部失配」。

  内核 `Session` 不再有 `events` 数组（`meta` 同时消失，改由 `header` 承载）。
  本仓库对它的读法分三类，失败形态各不相同，**静态门禁和 `--dump-config` 一个都看不见**：

  - **炸掉整轮**（最严重，billion-context-dsh）：`stateFor()` 里 `session.events.some(...)`
    被 `buildNudge` 在 `agent/pre-step` 上调用 —— 每一轮、每个 provider 都在这里
    `TypeError: Cannot read properties of undefined (reading 'some')`，用户看到的是
    「发出去没有任何反应」。属于插件形态下最坏的失败：**一个包的读取错误让整个会话不可用**。
  - **静默空转**（dsh-synapse、graph-memory）：`session.events ?? []` / `Array.isArray(...)`
    这类守卫把失配吞成空数组 —— 投影永远不应用任何事件、回填永远什么都不做，
    控制台干净、界面正常，只是功能不生效。
  - **类型错**（dsh-better-sidebar）：`boundaryDelivered(agent.session.events)` 直接把
    `undefined` 传进函数，侧聊恢复路径每次抛 TypeError。
  - **旧口子**（dsh-easyrewrite）：本来就带 `session.events` 回退，改成下标读取
    `session["events"]` 并注明缘由（见下）。

  改法：每个包加一个同步读整份日志的兼容口 `sessionEvents(session)` ——
  优先 `session.snapshotEvents()`（标弃用但可用、返回冻结副本），老宿主退回旧数组；
  回退分支**刻意写成下标读取**，因为审计门禁按 `session.events` 字面量拦旧 API，
  这里正是要保留的那一个口子（注释里写明了，不是白名单）。

  配套（本仓纪律：判据要能被拆掉）：

  - 新增 `tools/audit/session-api.js` 门禁：非测试源码里出现 `session.events` /
    `session.meta` 字面量即 error，命中在 `stripComments` 后的文本上（注释里提到不算）。
    8 条用例含 4 条反证（注释不算违规、测试夹具允许造旧形状、门禁真在扫、
    同一段代码换个路径就该报），并断言**仓库现状零 error**。
  - 新增 `tools/codemod/fix-session-events-reads.mjs`：先把它对着 `git show HEAD:` 的
    原始文件重跑一遍，证明能**逐字节复现**当前四个文件的改动（除 EOL）；
    第二次运行报告「替换=0 / 兼容口=已有」，即幂等。
  - 真机复验（隔离实例 + 真内核 + 离线 mock provider，因 compaction-acp 就是这个包）：
    修前 `agent/pre-step` 抛 TypeError（内核诊断栈直指 `AcpStateStore.stateFor`），
    修后同一路径 **HTTP 200 + mock 回复**；并发两轮均 200。

- 设置子系统全部改到内核真实 API（详见 AGENTS.md 契约 11）。

  - 宿主半边：不存在的 `settings.register` / `settings.get` → 声明式 `Config` + `describe()` 读、`update()` 写。
  - 页内半边：不存在的 `ctx.settingsScope.bind` → `ctx.remote.settings`，inject 相应换成 `remote`。
  - ns 一律改成 **profile 条目 id**（多处原先写的是包名，find 永不命中 ⇒ 设置静默失效）。
  - dsh-better-sidebar：界面偏好从 PrefsSchema 并进导出的 Config（不并就永远不进设置页），
    schemastery 换成 @deepseek-ai/schemastery（`.volatile()` 是这个 fork 的扩展）。
  - dsh-offpeak：定时执行改走真实存在的 `ctx.sessionController.prompt`（旧代码等的 apiProxy 不存在）。
  - dsh-easyrewrite：删掉恒假的 typeof 守卫死代码。

