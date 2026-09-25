# Stage 0 实测记录：官方客户端的插件装载契约

> 本文是「退役自制壳、改为纯插件包」的前置打桩结论。全部条目都是在本机对
> **真实安装**的官方客户端与 **npm 装的真实内核 `@deepseek-ai/dsh@0.1.7-rc.1`** 实测得出，
> 不是读代码推断。凡与既有文档/计划冲突处，以本文为准并已回写计划。
>
> 复现环境：`DSH_HOME` 指向临时目录（绝不碰真实 `~/.dsh`），
> 内核装在 `%LOCALAPPDATA%/Temp/dsh-pack-spike/dsh-prefix`，
> pnpm 11.19.0 / node 24.15.0。官方客户端本体在
> `%LOCALAPPDATA%/Programs/DeepSeek Harness`（Electron 壳 `44.0.0`）。

## 结论速览

| # | 问题 | 结论 | 对计划的影响 |
|---|---|---|---|
| 0.1 | CLI 能否往 `desktop` profile 装插件 | **不能**，被硬拦 | ⚠️ **计划里所有 `dsh plugin --profile desktop add …` 命令作废**，见下 |
| 0.2 | pnpm 11 是否拦原生构建脚本 | **拦**，但预编译已在包内 → 二进制仍可用 | knowledge 层风险从「装不上」降为「一次忽略提示」 |
| 0.3 | 元包的传递依赖会不会也成 bundle | **不会**，连 row 都不组合 | 「自洽生成式元包」从「更稳妥」升级为**强制要求** |
| 0.4 | `@dsh-pack` scope 是否可用 | 注册表上该 scope 下无任何包（404） | 仍需人工在 npmjs 建 org 后确认 |
| 0.5 | 树外插件能否解析到内核包 | **能**，且 profile 里没有内核 | R3（`@deepseek-ai/*` 只进 peer）成立且是硬规则 |

## 0.1 ⚠️ 最重要：`desktop` profile 被 CLI 独占保护

对 `desktop` 执行任何 CLI 操作都会被拒：

```
$ dsh --profile desktop --dump-config
error: profile "desktop" is managed exclusively by the Electron application
```

拦截点是**硬编码**的、大小写不敏感的按名判断，不是运行时探测：

```js
// @deepseek-ai/dsh/lib/bin.js:35
function rejectElectronProfile(program, profile) {
  if (profile.toLowerCase() === "desktop")
    program.error('error: profile "desktop" is managed exclusively by the Electron application');
}
```

**因此发布给用户安装说明必须改写为**（官方客户端内既有通道，两条都走同一个
`pluginManager` 服务、同一个 pnpm `packageManager` shim）：

1. 官方客户端内 **设置 → 插件**，按 npm 包名安装（`installBundle` 接受 registry spec：
   *「a registry spec is resolved through pnpm's registry lookup for the version its range
   selects and the peers that version declares」*）；
2. 会话里让 agent 用 `install_bundle` 工具装（它还能代用户填 `approvedBuilds`）。

**给 CI/开发用的等价通道**（实测可用）：CLI 对**自定义** profile 完全开放，且能从
`desktop` 模板初始化，从而复现同一套 bundle 组合：

```
$ dsh plugin --profile packtest add <绝对路径>
dsh: initialized profile packtest at …\profiles\packtest
dependencies:
+ @spike/p1 link:…\fix\p1
Done in 487ms using pnpm v11.19.0
```

> 注意：`--from-default-profile desktop` 模板给出的 bundles 只有 `@deepseek-ai/dsh-base`
> 一项；官方真实 `profiles/desktop` 里另有 `dsh-web-app` 与 `dsh-experimental-voice-input-bundle`，
> 是 Electron 宿主自己补的。CI 断言组合时按模板口径即可，别去对齐那三项。

### 顺带测清的 bundle 机制

一次 `add` 之后 profile 的状态（这是整个分发模型的地基）：

```jsonc
// profiles/packtest/package.json —— 名称同时进了 dependencies 与 dsh.profile.bundles
{ "dependencies": { "@spike/p1": "link:…\\fix\\p1" },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@spike/p1"] } } }
```

```yaml
# profiles/packtest/cordis.patch.yml —— 仍是出厂的 []，被原样保留
[]
```

- 真正的挂载来自**包自己**那份被 `dsh.bundle.patch` 指到的 `cordis.patch.yml`：
  `--dump-config` 里出现了独立的层 `# == @spike/p1` / `- id: spike-p1`。
- profile 自己的 patch 层不被触碰 ⇒ **我们不该往用户 profile 里写行**（这正是旧壳
  `companion-profile.js` 33KB 机器做的事，插件包形态下它既不必要也不礼貌）。
- 额外落了一个 `.plugin-manager/` 目录（安装日志与状态），以及 `pnpm-lock.yaml`。

## 0.2 pnpm 11 拦构建脚本 —— 但预编译随包发布，所以不致命

```
$ pnpm add @photostructure/sqlite@1.2.1
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @photostructure/sqlite@1.2.1
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

它的 `install` 脚本确实是 `"node-gyp-build"`，pnpm 不让跑。**但**包内 `prebuilds/`
六个目标全在，含我们主平台：

```
darwin-arm64  darwin-x64  linux-arm64  linux-x64  win32-arm64  win32-x64
  win32-x64/@photostructure+sqlite.glibc.node  = 2 165 248 字节
```

`node-gyp-build` 运行期就是按 `prebuilds/<platform>-<arch>/` 取二进制，
**install 脚本跑不跑不影响加载**。所以：

- 风险等级：从「knowledge 层装不上 / 要 MSVC」下调为「安装期出现一次 ignored-builds 提示」。
- 仍要把两步操作写进 `@dsh-pack/knowledge` 的 README（设置 → 插件 →「Allow these scripts and retry」），
  并让 CI 断言 `pendingBuilds` 里点名的就是这个包，防止说明腐烂。
  *（后续修订：`knowledge` 作为元包已随阶梯退役，见 §0.3 末；这句放行说明现在挂在
  `@dsh-pack/all` 与 `docs/recovery.md`，被点名的原生依赖来自其中的 `graph-memory`。）*
- `graph-memory` 声明的是 `^1.0.0` 而实测可用的是 `1.2.1` ⇒ **锁精确版本**，
  否则浮到某个可能不带 win32 预编译的 1.x。

## 0.3 元包的传递依赖**不会**成为 bundle（架构性结论）

构造 `@spike/meta`（自身有 `dsh.bundle.patch`，且 `dependencies` 指向 `@spike/p1`）后安装：

```
bundles: ["@deepseek-ai/dsh-base", "@spike/meta"]     ← 只有被点名的 meta
node_modules/@spike: meta@                            ← p1 未被登记
--dump-config | grep -c spike-p1  →  0                ← p1 的 row 完全没组合
```

⇒ **纯靠 dependencies 的分层元包是惰性的**：装得上、跑得起，但一个插件都不会挂载，
而用户不会收到任何报错。这与 `dsh-plugin-manager/README.md` 的另一条相互印证：
*「A run that fails, is cancelled, or **adds a package without a bundle patch** restores
`package.json` and `pnpm-lock.yaml` as they were」*，且 `listBundles` 会把它报成 `not-bundle`。

**因此计划 §5 的「自洽生成式元包」是强制方案，不是可选加固**：
每个 `@dsh-pack/<tier>` 必须自带一份由成员 `cordis.patch.yml` 拼接、按 id 去重、
按 `tools/tiers.json` 定序的 `cordis.patch.yml`。传过来的 18 个成员包会作为元包的
依赖被 pnpm 装进 profile（`nodeLinker: hoisted` 保证可解析），而 row 由元包那一层插入。

嵌套元包（`@dsh-pack/desktop` → `@dsh-pack/core`）同理会是惰性的 ⇒ **不做嵌套**。

> **后续修订（真机复测：阶梯分层已退役）**。本节「元包必须自带生成补丁层」与「不做嵌套」
> 两条结论成立且已落地，但当时计划的**阶梯形状（`core` ⊂ `plus` ⊂ `knowledge`/`pocket`/
> `bridge`/`compaction` ⊂ `all`）不成立**，原因在 `insert` 的语义上：内核
> `@deepseek-ai/dsh-app-boot` 的 `applyEntryPatches` 处理 `insert` 是 `data.push(...insert)`，
> 不看内容、**不按 id 去重**——「按 id 整行替换」只作用于**覆盖型补丁**
> （`- id: X / 字段: 值`），不作用于 insert。于是任意两个已安装的层 insert 同一个 id，
> 该插件就被装配两次，它的 host 半边第二次 `register` 同一条路由时抛
> `webserver: duplicate exact route "…"`，真机表现为「N entries did not activate」。
> 直接调内核的 `composeEntries` 实测：`meta-core` + `meta-all` 组合出 50 行、
> **18 个重复 id**（取证脚本 `tools/itest/tier-overlap-proof.mjs`）。
> ⇒ 六个阶梯元包已删除，现在只剩唯一的聚合元包 `@dsh-pack/all`（32 个成员）；
> `tools/tiers.json` 里的 `tierOf` 退化成「按用途分组」的文档标签，不再生成元包、
> 也不代表可以叠加安装的层。
> ⚠ 残留风险面（当时没意识到）：按上面「bundle 机制」那条实测，每个成员都必须能单装
> （自带 `cordis.patch.yml` + `package.json#dsh.bundle.patch`），所以「装了 `all` 之后
> 又从『设置 → 插件』单独装其中一个成员」一样会双装配 —— 安装指引必须写明这一点。

## 0.4 `@dsh-pack` scope

`npm view @dsh-pack/core` / `@dsh-pack/host-capabilities` 均 404（该 scope 下无任何已发布包），
没有被别人占用的迹象。**未完成项**：需要人工在 npmjs.com 创建 `dsh-pack` org 并确认写权限，
这一步不能代替用户完成，留作发布前置门。
*（后续修订：`@dsh-pack/core` 这个包名已随阶梯分层退役、不会再发布，见 §0.3 末的修订；
它在这里只是当时用来抽样探测 scope 是否可用的一个名字，「该 scope 无第三方占用」的结论不受影响。）*

命名硬约束（来自 `dsh-app-boot` 的 `PACKAGE_NAME` 正则，它要能出现在
`compatibility.json` 的 `allow-version @scope/x@ver` 键里）：只允许小写字母、数字、连字符、点、下划线，
且 scope 不得以 `.`/`_` 开头。

## 0.5 内核包由「安装作用域链接表」供给 —— R3 成立

```
profiles/packtest/node_modules/@deepseek-ai  →  不存在（零个包）
profiles/packtest/node_modules/@spike/p1     →  存在（link:）
--dump-config | grep -c "@deepseek-ai/dsh-"  →  92     ← 92 处内核包引用照样组合成功
```

p1 的 peer `@deepseek-ai/dsh-settings` **没有**被装进 profile
（profile 的 `pnpm-workspace.yaml` 写着 `autoInstallPeers: false`），
但内核侧照样可解析。机制是 `dsh-app-boot` 的 `collectInstallationScopePackages(installAnchor, …)`：
它从安装锚点的 manifest BFS 走 `dependencies` + `peerDependencies`，建一张 name→目录 的链接表
供给每个 profile。这解释了为什么内核活在 `app.asar` 里、profile 里一个内核包都没有，插件却能
`import '@deepseek-ai/dsh-settings'`。

**由此得到一条不可违反的规则（R3）**：`@deepseek-ai/*` 只能放 `peerDependencies`，
**绝不能放 `dependencies`**。放 dependencies 会往 profile 里装出第二份物理拷贝 →
`client-modules: package X resolves from multiple active Loader sources` →
`ClientPackageCompositionError` → `StartupError` → **整个官方客户端起不来**；
再叠加 `sanitizeProfile` 会把 profile patch 改名 `.bak-<ts>` 并恢复出厂 bundle 列表，
一次致命启动就连包设置一起被抹掉。

实测今天违反 R3 的正是 3 个包：`dsh-hub`（`@deepseek-ai/dsh-typert-protocol`）、
`dsh-reasoning-effort` 与 `dsh-vision`（均为 `@deepseek-ai/schemastery`）。

## 本次打桩已经落地的修正

1. **阶段 1.1**：`tools/codemod/strip-phantom-inject.mjs` 清除了 **7 个 manifest 里 9 条**
   指向不存在包（`@deepseek-ai/dsh-client-runtime` / `-client-web-react`，对 277 个官方包名核过）
   的 `dsh.client.inject` / `external` / `peerDependencies` 引用。
   这类悬挂引用不会响亮失败，只会产出一个永不挂载的 client 半边。
2. **阶段 1.2**：删除 `assets/plugins/dsh-plugin-manager`（39 个插件剩），并移除
   `companion-plugins.js` 里的 `plugin-manager` 行。它同时撞 npm 包名（官方发布了
   `@deepseek-ai/dsh-plugin-manager@0.1.7-rc.1`）与 loader id（`dsh-base/cordis.patch.yml`
   自带 `- id: plugin-manager`），按 id 整行替换的语义下会把内核真正的插件管理器顶替成
   我们的 no-op。相应地 `rv9-hotpath-smoke.test.js` 第 11 节改为退役说明。
3. **内核快照**：`tools/audit/extract-kernel-snapshots.mjs` 已生成
   `kernel-packages.json`（494 个包名，其中 277 个 `@deepseek-ai/*`）与
   `kernel-entry-ids.json`（**199** 个内核 loader id）。计划里原先记的「212 个 id」
   是 asar 口径，npm 闭包口径是 199；防撞名检查以 199 这份为准。
   抽样验证：`plugin-manager` → COLLIDE，`balance`/`better-sidebar`/`terminal`/`graph-memory`/
   `cardian`/`dsh-pocket`/`synapse`/`offpeak`/`harness-pet`/`dsh-super-injector` → 全部 free。

---

## 附：重复功能裁决（Stage 2.6 / 2.7，按官方内核实包定）

判据不是「像不像」，而是把官方包的 `description` 与实际能力读出来对照。
官方包清单取自 `tools/audit/kernel-packages.json`（npm 装的 `0.1.7-rc.1`，277 个 `@deepseek-ai/*`）。

### 2.6 `dsh-terminal-tab` → **删除**

官方已经有四个相关包，且做的是**真 PTY**：

| 官方包 | 它的 description |
| --- | --- |
| `@deepseek-ai/dsh-client-ui-sidebar-terminal` | *Interactive shell **tabs** for the right Sidebar* |
| `@deepseek-ai/dsh-terminal-bash` | *Persistent shell **PTY** backend over the … subprocess terminal primitive* |
| `@deepseek-ai/dsh-api-terminal-controller` / `dsh-terminal` / `dsh-tmux-context` | 控制面与 tmux 上下文 |

我们的 `dsh-terminal-tab` 自述是「SSE streaming, **not PTY**」——同一个位置上的**严格劣化版**
（没有真 PTY、没有持久 shell）。留着的后果是右栏里出现两个终端入口、行为还不一致。
⇒ 删除；终端需求交给官方原生标签。

### 2.7 `dsh-file-changes` + `dsh-client-file-changes` → **两个都留**

官方 `@deepseek-ai/dsh-workspace-changes` 的 description 是
*Per-turn workspace file changes recorded from **git working-tree snapshots and whole-file
captures**, with per-file comparisons* —— 领域重叠，但两点实测差异决定去留：

1. **投影键不撞**：官方用 `workspaceChanges`（其 `lib/` 里出现 9 次），我们用 `fileChanges`
   （数据来自折叠 tool/result 的 `meta.diffs`）。两者是互补的两条来源，不是同一槽位。
2. **官方不做还原**：在 `dsh-workspace-changes/lib` 里 `revert` / `restore*` / `rollback`
   **0 命中**；官方 `dsh-api-workspace-controller` 的 11 个 RPC 里也没有任何还原方法。

⇒ 「一键还原」是本包的真实独有值（已搬进插件自己的宿主路由
`POST /api/dsh-files/revert`，见 `packages/dsh-client-file-changes/lib/index.js`），
两个包都保留。
