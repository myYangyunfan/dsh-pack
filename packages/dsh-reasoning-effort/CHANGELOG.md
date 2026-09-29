# @dsh-pack/dsh-reasoning-effort

## 0.7.1

### Patch Changes

- 修「模型的 reasoning-effort 诊断一直不出结果，控制台只有一行 405」。

  真机复现：打开自定义 provider 模型的诊断面板，控制台出现
  `Failed to load resource: 405 (Method Not Allowed) http://127.0.0.1:3080/dsh-reasoning-effort/diagnose`，
  面板不出内容。那个 405 不是「方法用错」，而是**路由根本没挂上** —— POST 落到了静态处理器
  （`dsh-client-modules` 对非 GET/HEAD 一律回 405）。

  根因在内核：宿主半边走 `ctx.connection.rpc.handle(channel, handler)`，而
  `@deepseek-ai/dsh-client-connection` 的插件 `inject` 只有 `["credentials"]`，它自己的
  `HostConnectionService.register()` 里却要 `owner.webServer.register(route)`（owner 就是
  服务自己的 ctx）⇒ cordis 隔离层抛 `cannot get property without inject`，注册从未生效。
  失败形态是最难查的那类**静默**：apply 不报错、J4 只看日志也看不见；页内
  `rpc.call` 又把 HTTP 405 吞成 `null`，UI 表现成「点了没反应」。
  内核自己的 `/api` 路由也是挂在 `ctx.inject(["webServer"], …)` 里的（同一个 `apply()`）。

  - 通道改为挂到本插件自己 inject 的 `webServer` 上（`lib/web-rpc.js`），逐分支复刻内核
    `/api` 的传输语义（404 / 415 / 400 / 信封失败回 200 + `server-response` / 500），
    页内半边不动 —— 它用的就是内核原生 `connection.rpc.call`。
  - 栅栏沿用内核语义：`connection.requestRejection` 可用就用它（**方法形式**调用，
    丢 this 会把所有请求误判 forbidden，见 dsh-pocket issue #117），
    否则退到 loopback + `sec-fetch-site`/Origin 校验。
  - `failResult` 补上 `error.details`：页内 `parseConnectionResponse` 校验
    `isRecord(error.details)`，缺了它连失败信封都被抛掉、错误再次静默成 null。
    反证用例把这条钉住（去掉 details 必被内核判据拒）。

  验证（不靠推断，真启动 + 真 POST）：
  - `packages/dsh-reasoning-effort/test/web-rpc.test.mjs` 19 条，含反证
    （段校验拆掉必放行 `..`；415 闸拆掉 handler 就会被执行；details 缺了必被判非法；
    requestRejection 裸函数调用必丢 this）。
  - 隔离实例（临时 DSH_HOME + workspace 源码覆盖）真启动后 POST：
    `diagnose` → **200** 且返回真实诊断载荷（`entryHead`/`expected`/`settingsPath` 齐全）；
    未知 endpoint → 200 `not-found` 信封；通道根 → 404；`text/plain` → 415；
    **不带会话 cookie → 401**（栅栏真的在拦，不是敞开）。

- 修「apply 里抛 TypeError 导致整条 not activate」。

  内核 0.1.7-rc.1 的 settings 服务（`SettingsForms`）只有
  `describe / update / configure / schema / prepareDocument`，**没有 `register`**
  （全内核 0 处命中）。官方包的形状是：插件自己 `export const Config = z.object({...})`，
  cordis 的 `resolveConfig()` 拿它校验 profile 行里的 `config:`，校验结果就是
  `apply(ctx, config)` 的第二个参数；要写回则走 `settings.update(条目id, patch, revision)`，
  而 `describe()` 只收录「至少有一个 volatile 字段」的条目。

  - `dsh-reasoning-effort`：`settings.register(STORE_NS, StoreSchema)` → `export const Config`
    + 读 `apply` 的 config；另把 `settings.get(LLM_NS)`（同样不存在）改成走 `describe()`，
    与相邻的 `userDeclaredModel` 同一口径。故意不加 volatile：本插件从不写配置，
    而 `z.array(z.any())` 进 volatileForm 投影不出形状。
  - `dsh-community-market`：`settings.register(ns, schema, {applies:'live'})` →
    `Config` 导出 + `marketScope(ctx, config)` 适配器（volatile 引用做 `get()`，
    `settings.update(entry.options.id, patch, revision)` 做写回）。三个字段都标了
    `.volatile()`，否则 `describe()` 不收录本条目、写回也就无从取 revision。

  验证方式：`tools/itest/boot-activation.mjs`（J4）——真启动挂载，不再只看 `--dump-config`。

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

