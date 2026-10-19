# @deepseek-ai/dsh-balance

## 0.2.0

### Minor Changes

- 余额开关第一次真的能用：宿主半导出 `Config`（三条 volatile），客户端半自己往
  「设置 → 通用」注册两行开关，dock 显隐直读条目设置。

  - **根因①（读不到）**：未导出 `Config` 的条目永不进 `SettingsForms.describe()`
    名单，`readSettings()` 的 describe() 读法恒空 —— dock 开关历史上从未生效过。
    现导出 `showBalanceDock` / `showOpenCodeGoUsage` / `balancePrices` 三条
    volatile（DSH fork 的 `@deepseek-ai/schemastery`，只有 fork 会把 volatile
    字段包成 cosmokit 引用、live-commit 才提交得动）。
  - **根因②（没界面）**：「声明 Config 后内核自动生成设置页」是**错的** ——
    `autoGenerate` 只存在于 dsh-settings 与 wire schema，客户端包 0 消费方，
    设置导航每一项都得自己注册。故客户端半新增两行到 `settings.general.item`
    槽（口径对齐 `dsh-conversation-tweaks`），写回走
    `ctx.remote.settings.mutate("balance", [{op:"set",...}], revision)`。
  - **`balancePrices` 覆盖复活**：`projectForm` 只投影 volatile 声明过的字段，
    未声明的手写 config 键会从 `row.value` 直接丢弃 —— 实测种子 99/9.9/88
    进不了价目表，README 承诺的覆盖自 rc.2 起是死的。现一并声明为 volatile 字典
    （内层三档默认可选，手写半份覆盖由 `applyPriceOverrides` 回落内置有效价）。
    退役死读 `section.prices`（从未声明过的别名）。
  - **显隐时机**：dock 改由客户端直读同一条目设置决定，不再等载荷的 `disabled`
    位——宿主后台 180s 才真发一次、客户端 60s 才读一次，只认载荷的话关掉后最长
    挂约 3 分钟；冷启首轮刷新又抢在 settings 服务就绪之前，会闪一下。
  - 壳层 ⋯ 菜单「显示余额/本轮费用」（`toggle-balance`）同批退役：它写壳侧
    settings.json，与本插件读的设置面是两条互不相通的线。
  - ⚠ 坑（实测付过学费）：本 fork 的 `z.number()` **没有** `.optional()`，
    写了就是模块导入期 `TypeError` —— 整个条目被 loader-isolation 摘掉、dock
    全灭（内核照常启动）。对象字段在本 fork 里默认可选，`.required()` 才是标必须。

## 0.1.3

### Patch Changes

- 价目对齐官网 + 补上内核真实模型 id，修正「本轮费用 / 命中缓存算错」。

  - 新增 `deepseek-flash` 键（`dsh-llm-deepseek` 的 DEFAULT_MODELS 真实下发的模型名）：
    此前它不在价目表内，精确查表未命中即静默落回 pro 档——缓存命中价 0.3 是官方
    flash 档 0.04 的 7.5 倍（主因）。
  - flash 档（`deepseek-v4-flash` / `deepseek-chat`）高峰价按官方价目表改为
    未命中 2 / 命中 0.04 / 输出 8（元/百万 token）；原值 3/0.1/9 是按 pro÷3 推导的，
    命中价高估 2.5 倍。空闲 = 高峰一半，不变。
  - `LEGACY_PRICES` 同步补 `deepseek-flash` 镜像旧价 {1, 0.02, 2}（旧版期不得落回
    pro 旧价）；未知模型仍回退 pro 最高档（不改）。
  - 回归锁同步：`unit-balance-pricing-key`（真实 id / 后缀变体 / 旧版期镜像）、
    `unit-balance`、`unit-balance-weekend` 与插件自带 `test/balance-core.test.js`。

## 0.1.2

### Patch Changes

- 设置子系统全部改到内核真实 API（详见 AGENTS.md 契约 11）。

  - 宿主半边：不存在的 `settings.register` / `settings.get` → 声明式 `Config` + `describe()` 读、`update()` 写。
  - 页内半边：不存在的 `ctx.settingsScope.bind` → `ctx.remote.settings`，inject 相应换成 `remote`。
  - ns 一律改成 **profile 条目 id**（多处原先写的是包名，find 永不命中 ⇒ 设置静默失效）。
  - dsh-better-sidebar：界面偏好从 PrefsSchema 并进导出的 Config（不并就永远不进设置页），
    schemastery 换成 @deepseek-ai/schemastery（`.volatile()` 是这个 fork 的扩展）。
  - dsh-offpeak：定时执行改走真实存在的 `ctx.sessionController.prompt`（旧代码等的 apiProxy 不存在）。
  - dsh-easyrewrite：删掉恒假的 typeof 守卫死代码。

