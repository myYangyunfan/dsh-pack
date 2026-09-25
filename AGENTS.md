# AGENTS.md — DSH Pack 工作区指引

> 本文件给 agent 用。这里只写**约定与边界**；逐字段的宿主行为以
> `docs/spike-official-client.md`（本机真机实测记录）与 `tools/audit/kernel-*.json`
> （官方内核快照）为准。凡与本文件冲突，以实测记录为准。

## 仓库是什么

**DSH Pack** —— 装进官方 DeepSeek Harness 桌面客户端的**插件整合包**。

历史：本仓库原本是一个自制桌面客户端（`dsh-tauri/` Rust 壳 + `dsh-desktop/` 内核侧机器），
用来包裹上游内核 `@deepseek-ai/dsh`。上游已经发布自己的官方客户端，**自制壳已退役**，
我们把攒下的能力重组为一个纯插件包，通过官方客户端的插件机制分发。

**这里不再产出任何可执行程序、安装器、托盘、自动更新链。** 交付物只有 npm 包。

| 目录 | 说明 |
| --- | --- |
| `packages/` | 全部插件包（每个是一个可独立发布的 npm 包）+ 唯一的聚合元包 `meta-all` |
| `packages/host-capabilities/` | 宿主能力探针。**不是 bundle**，给别的包构建期内联 |
| `tools/tiers.json` | 成员清单 + 用途分组，**唯一事实源**（取代已删除的 `COMPANION_PLUGINS`）。**只有一层 `all`**，见契约 4 |
| `tools/build-meta-patches.mjs` | 由成员补丁层生成 `meta-all` 的 `cordis.patch.yml` |
| `tools/audit/` | 6 项离线静态门禁，取代已删除的内核补丁校验机器 |
| `tools/itest/` | 真装真组合的集成校验（J1 组合 / J2 tarball 启动 / J3 构建脚本放行） |
| `docs/` | 面向用户与上游的文档；`docs/upstream/` 是提给上游的 bug 正文 |
| `.github/workflows/` | `ci.yml`（审计+单测+集成）、`release.yml`（changesets→npm）、`kernel-drift.yml`（夜间内核漂移） |

常用命令：

```bash
pnpm install                      # 装 workspace
node tools/audit/index.js         # 全部静态门禁（发布前必须绿）
node tools/build-meta-patches.mjs # 重新生成分层元包的补丁层
node --test "packages/*/test/*.test.js"
node tools/itest/boot-desktop-profile.mjs --job=j1   # 需一份 npm 装好的内核，见 --help
```

**没有 lint / typecheck / 格式化工具链**（无 eslint、无 tsconfig、无 prettier）。
语法门禁只有 `tools/audit/syntax.js`（从旧 `check-syntax.js` 迁来，它管的是
`node --check` 抓不到的模式扫描）加测试。**不要凭空发明工具链。**

## 官方客户端的装载契约（改任何东西前必须遵守）

这些是真机实测结论，不是推测：

1. **profile 是 `desktop`，且被 CLI 独占保护。** 对 `dsh --profile desktop …` /
   `dsh plugin --profile desktop …` 会被 `rejectElectronProfile` 硬拦
   （报 `managed exclusively by the Electron application`）。
   **面向用户的安装通道只有两条**：官方客户端内「设置 → 插件」，或让 agent 用
   `install_bundle` 工具。CI 才用自定义 profile。
   ⇒ 任何文档/README 里写 `dsh plugin --profile desktop add` 都是**错的**。
2. **`patchFiles: []`。** 官方宿主启动内核时不传任何 `--patch` 覆盖层，
   所以**不存在**「我们用一条命令行参数注入补丁」这条路。旧壳的整套
   `companion-profile.js` 写行机器因此失去插入点。
3. **每个包必须自装载。** 靠 `package.json` 的 `dsh.bundle.patch` 指向自己那份
   `cordis.patch.yml`，由它插入自己的 loader row。
   实测 profile 自己的 `cordis.patch.yml` 会被原样保留成 `[]`——
   **我们不该往用户 profile 里写行**。
4. **元包的传递依赖不会成为 bundle**（实测：装了 meta，其依赖既没进 `bundles`、
   行也没组合，而且**不报错**）。⇒ 聚合元包必须自带一份**生成出来的**
   `cordis.patch.yml`，把成员的行全部拼进去。由 `tools/build-meta-patches.mjs` 生成，
   禁止手改；审计会断言「签入的元包补丁层 == 重新生成的结果」逐字节一致。
   **也不要做嵌套元包。**
4b. **只允许一个元包，因为 `insert` 不去重。** 内核 `applyEntryPatches`
   （`@deepseek-ai/dsh-app-boot`）处理 `insert` 是 `data.push(...insert)`：不看内容、
   不按 id 去重 —— 「按 id 整行替换」只作用于**覆盖型补丁**（`- id: X / 字段: 值`），
   **不作用于 insert**。所以任意两个已安装层 insert 同一个 id，该插件就被装配两次，
   它的 host 半边第二次 `register` 同一条由时抛
   `webserver: duplicate exact route "…"` → 条目 did not activate。
   真机实测：阶梯（`core ⊂ plus ⊂ all`）同装时 core+all 组合出 **18 个重复 id**
   （取证脚本 `tools/itest/tier-overlap-proof.mjs`，直接调内核的 `composeEntries`）。
   ⇒ 阶梯元包已全部退役，只留 `@dsh-pack/all`；`tools/audit/self-mount.js` 断言
   **分层成员集两两不相交**（error），别再把阶梯加回来。
   ⚠ 残留风险面（现在只以 warn 报出）：成员按契约 3 必须能单装，因此
   「装了 `all` 再从插件页单独装其中一个成员」同样会双装配 —— 安装指引必须写明。
5. **`@deepseek-ai/*` 只能出现在 `peerDependencies`，绝不能进 `dependencies`。**
   机制：内核由 `collectInstallationScopePackages` 以「安装作用域链接表」供给每个 profile，
   实测 profile 自己的 `node_modules` 里**零个** `@deepseek-ai` 包，却有 92 处内核包引用
   正常组合。放进 `dependencies` 会装出第二份物理拷贝 →
   `resolves from multiple active Loader sources` → `ClientPackageCompositionError`
   → `StartupError` → **官方客户端整个拒绝启动**。
6. **一个包写错就能砖掉整个应用。** 声明了 `dsh.client` 却没有可解析的
   `exports["./client"]` 即属此类（`modules` 在 app-boot 的全局必需条目清单里）。
   因此 `tools/audit/publish-readiness.js` 是 **P0 门禁**，不是建议。
7. **一次致命启动会把插件包整个抹掉。** 恢复流程底层是 `sanitizeProfile`：
   把 profile 的 `cordis.patch.yml` 改名成 `.bak-<时间戳>` 兄弟文件，并把 bundle 列表
   恢复成出厂那几项。只有**家层** `$DSH_HOME/cordis.patch.yml` 不受影响，
   且它优先级压过 profile 层。⇒ 出问题照 `docs/recovery.md` 走。
8. **启用/停用插件要重启应用，不是刷新页面。** 页内注入清单只在宿主 ready 时抓一次
   （`ctx.webServer.collectIndexInjections()`），之后是快照。README 和各分层文档都要写这句。
9. **`dsh-app://app` 把非静态路径同源转发给内核**（带 host cookie）。
   所以插件自己注册的 `ctx.webServer` 路由和 `lib/client.js` 都在同一 origin 下，
   **不需要任何 CORS 设计**。
10. **`dsh.client.platform` 保持字符串 `"web"`。** 别「顺手」改成 `"desktop"`——
    `parseDshClient` 只检查它是字符串、从不校验取值，而 desktop profile 服务的正是同一份
    web client bundle。改了会静默坏掉。

## 命名规则

- **R1** 每个发布包 = `@dsh-pack/<目录名>`，目录名保持小写连字符、与包一一对应。
  不从旧 `name` 字段推导，这样「目录 ↔ 包 ↔ 分层成员」可机械校验。
- **R2** **cordis loader id 一律不改。** id 是补丁层寻址键，而补丁**按 id 整行替换、
  不做字段合并**；改 id 会让用户写在家层里的 `- id: X / disabled: true` 覆盖变成孤儿。
  历史疤：`dsh-super-injector` 的 id 声明错位曾导致双登记启动崩溃（issue #104）。
  **也不要「顺手统一」id 前缀**（7 个带 `dsh-` 前缀、33 个不带）——丑，但改它零收益且
  正好踩 #104。已知唯一例外是随插件一起删掉的 `plugin-manager`。
  所有 id 必须对 `tools/audit/kernel-entry-ids.json` 做撞名校验。
- **R3** 见上面契约第 5 条。
- **R4** 所有 `@deepseek-ai/dsh*` peer 区间统一 `>=0.1.0-rc.6 <2`。
  官方有强制更新策略，内核会在我们不参与时前进；区间收紧会让每次升级都变成
  用户面前的「may cause crashes or data loss」+ 手动 `--accept-risk`。

## 编码与流程约定

- **中文优先**：文档、commit message、代码注释一律中文（英文版只有 `README.en.md`）。
  标识符、包名、错误串、API 名保持原文。
- **commit**: `<type>: <简述>（#issue号）`，type ∈ `feat/fix/refactor/perf/docs/test/chore/build`；
  分支 `feature/` `fix/` `refactor/` `docs/`；维护者 squash merge，一次提交只做一件事。
- **功能新增 / bug 修复必须带测试**：纯函数放 `packages/<包>/test/*.test.js`，用 `node --test`。
  bug 回归用例头部注明 issue 号。**新守卫必须配反证**——只测「正常输入给正确答案」不够，
  要把判据一项项拆掉看结论是否随之改变，否则说明判据根本没起作用。
- **测试必须隔离**：一律用临时目录重定向 `DSH_HOME`，**绝不触碰真实 `~/.dsh`**，
  也不写 `%APPDATA%`。`tools/itest/` 开头就有拒绝执行的断言，别绕过。
- 可单测纯函数收敛到各包自己，宿主与网络编排留在调用方。
- **发版唯一入口是 changesets** → `pnpm -r publish`。版本号只有一处来源，
  不再有旧那套「三处同步」问题。
- 临时文件（`.tmp-*`、`_*.js`、`*.log`）已在 `.gitignore` 中，**不要提交**。

## 已知坑

- **别再用 `window.dshDesktop` 做能力判断。** 官方客户端**也**往这个全局名上挂对象，
  但形状是 `{protocolVersion, browser, updates}`。老代码 `if (window.dshDesktop)` 会拿到
  一个 truthy 却什么都调不通的对象——静默失效而不是抛错。而且 `contextBridge` 交出来的
  是不可扩展代理，**补不回去**。唯一正确姿势是用 `@dsh-pack/host-capabilities` 的
  `caps.has(...)` / `caps.xxx?.()`。`tools/audit/namespace.js` 会拦裸引用。
  已实测的真实伤害两处：一个「还原」按钮 `disabled: busy || !window.dshDesktop`
  渲染成可点但点了没反应；`style.top = dshDesktop ? "36px" : "0px"` 凭空多出 36px。
- **`host-capabilities` 必须构建期内联，不能运行时 import。** 官方浏览器模块系统只对
  种子表（`PLATFORM_MODULES`）、memo 记录、boot-graph 行、已注册工厂解析裸标识符，
  **其余一律 throw**。所以那个包保持零 import、零依赖、`sideEffects:false`。
- **pnpm 11 会拦依赖的 install 脚本。** `@photostructure/sqlite` 带
  `"install": "node-gyp-build"`，安装会报 `ERR_PNPM_IGNORED_BUILDS` / `pendingBuilds`，
  需要在「设置 → 插件」点「Allow these scripts and retry」。
  但**六个平台预编译（含 win32-x64/arm64）都在包内**，运行期 `node-gyp-build` 直接按
  `prebuilds/<platform>-<arch>/` 取二进制——那道点击是让安装器闭嘴，不是「不点就没二进制」。
  因此会被安装器列出来要放行的只有两处：`graph-memory` 的 `@photostructure/sqlite`
  （`node-gyp-build`）与 `dsh-better-sidebar` 的 `node-pty`（optionalDependencies）。
  `dsh-cardian` **没有**原生依赖（它的依赖只有 `zod` + peer），别把它算进「要放行的包」里。
- **引用不存在的内核包不会响亮失败。** `dsh.client.inject` 写一个不存在的包名，
  只会产出一个永不挂载的 client 半边，仅在 Web boot audit 里以逐行 import 失败出现。
  实测抓到过两个幽灵名（`@deepseek-ai/dsh-client-runtime`、`-client-web-react`，
  对 277 个官方包名核实为不存在）。`namespace.js` 拦这个。
- **`!!js` 求值失败对必需条目会停启动。** 我们自己的行**禁止新增** `disabled: !!js`。
  唯一的历史例外是 `dsh-better-sidebar` 那行双挂载守卫：它的表达式形态
  `[...ctx.loader.entries()].some((e) => e.options.name === …)` 已核对为内核自己的用法
  （`@deepseek-ai/cordis-plugin-loader/lib/index.js:574` 逐字相同），`ctx.loader` 与
  `entries()` 都存在，所以不会抛 —— 别把它当违规删掉（它防的是第三方聚合包，
  不是我们的分层），也别照它新开更多的行。
- **`exports["./client"]` 那份 bundle 里 `__ModuleLoader__.load({ id })` 必须写包名。**
  内核 boot graph 行以包名为键（`dsh-client-modules/lib/client.js:625`），而 `register()`
  的键是 `stripClientSuffix(registration.id)`（同文件 569）。注册名写成裸名
  （`'dsh-input-fold'`）或换代前的 `@dsh-external/…` 时，那一行永远等不到，报
  `loaded without registering "@dsh-pack/x"`，**失败形态是静默不挂载**（宿主照常起来、
  插件没反应），用户只能从控制台看到。真机一次踩过 20 个包。
  门禁：`tools/audit/publish-readiness.js`；批量改：`tools/codemod/fix-client-registration-id.mjs`
  （只改 `exports["./client"]` 那一份，包内其它 load 站点如 rolldown 产物
  `lib/client-registry.js` 不在 boot graph 上，改了会造出 duplicate factory registration）。
- **`node-pty` 已删。** 它原先锁 `^1.1.0` 是为了和内核 `dsh-subprocess-local` 共享一条
  pnpm store 条目——这个理由在插件包形态下**已失效**（内核活在 asar 里，永不进 profile 的
  store），而上游本来就有 `ui-sidebar-terminal` + `dsh-terminal-bash`。
- **GPL-2.0 的 `dsh-pocket` 不 fork。** 仅依赖 = 聚合，安全；fork = 派生，
  整个包会变 GPL-2.0 并附带源码提供义务。需要改行为就从分层补丁行的 `config:` 驱动，
  或者给上游提一行 PR。
- **`.map` 不许带 `sourcesContent` 进 tarball。** `dsh-community-market` 的旧产物里
  内嵌过完整上游 TypeScript。
- **`dsh-reasoning-effort` 对「手工声明的自定义 provider」有已知上限**：effort 控件可能不出现，
  根因在内核而非插件，正文见 `docs/upstream/pi-ai-error-taxonomy.md`。
- **稳定性三原则（评审默认立场）**：① 客户端必须能打开，装配失败终态恢复页而非退出；
  ② 兼容性不报错，意外以日志收场不以崩溃收场；③ 用户数据不动。
  在插件包形态下这三条更成立——**一个坏插件能砖掉整个官方客户端**，
  而用户一旦触发恢复对话框，我们的包会被整体抹掉。
- 文档里的测试基线数字常滞后，**以实测输出为准**。

## 动敏感区域前先读

| 要改什么 | 先读 |
| --- | --- |
| 官方客户端的装载行为 | `docs/spike-official-client.md`（真机实测），再看 `tools/audit/kernel-*.json` |
| 分层 / 加插件 / 改元包 | `tools/tiers.json` + `tools/build-meta-patches.mjs` + `docs/recovery.md` |
| 发布 / 版本 / 兼容门禁 | `.github/RELEASE_RUNBOOK.md`、`tools/audit/compat-gate.js`、`tools/audit/publish-readiness.js` |
| 余额链 | `docs/balance-architecture.md` |
| 侧栏 / 内核右栏集成 | `docs/better-sidebar-kernel-integration.md` |
| 提给上游的 bug | `docs/upstream/`（会话日志容错、pi-ai 错误分类、退役先例） |
| 某个插件的行为 | `packages/<插件>/README.md`，再看 `tools/tiers.json` 里它的分层与出处注释 |
| PR 流程与测试硬性要求 | `CONTRIBUTING.md` |
