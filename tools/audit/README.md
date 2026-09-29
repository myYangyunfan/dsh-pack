# tools/audit —— 插件包静态门（迁移 Stage 1.3）

我们不再改内核，所以 `dsh-desktop/scripts/compat/validate-pin.js` 与
`patch-surface.js` 那套「补丁干预面」校验机器被删掉了。这里接替它：验的不再是
「我们改过的内核还一致」，而是**「我们的 40 个插件包塞进官方客户端的 `desktop`
profile 之后到底能不能活」**。全部规则都来自真机实测的失败模式，fail-closed。

```bash
node tools/audit/index.js                                # 全量 + 人读报告（每项检查打命中计数）
node tools/audit/index.js --json                         # CI 消费
node tools/audit/index.js --only=compat-gate,publish-readiness
```

退出码：有 `error` 即 1。`warn` / `info` 不拦门，但一定打印。

**包根自动探测**：`packages/` 里有含 `package.json` 的子目录就用它（迁移后的落点），
否则退回 `dsh-desktop/assets/plugins/`，报告头部会打印实际用了哪个。迁移是逐包搬家，
两个根会同时有货——所以审计会**把两个根都扫一遍**（只看一个根会让另一半包从门里溜走），
多根时 finding 的包名带根前缀，并额外提示「包根分裂」。

零依赖：只用 `node:` 内建 + `dsh-desktop/node_modules` 里已有的 `semver` 与 `yaml`
（按仓库既有姿势显式解析路径）。`tools/` 下没有 package.json、不装依赖、不产 lockfile。
`kernel-packages.json` / `kernel-entry-ids.json` 由 `extract-kernel-snapshots.mjs` 生成，
是「官方客户端已经占了哪些名字」的唯一事实源，勿手改。

---

## compat-gate —— 内核兼容性门

逐字复刻 `@deepseek-ai/dsh-app-boot/lib/index.js` 的 `evaluatePluginCompatibility`：
只看 `peerDependencies` 里 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` 那几项，用
`dsh-runtime.json` 里唯一的 `runtimeVersion`（`0.1.7-rc.1`）配 `includePrerelease` 判定，
不满足就把该 bundle 标 incompatible 并**静默跳过挂载**——不报错、不弹窗，用户只看到
「插件装上了但没出现」。门与内核必须逐字一致，所以我们不复述、只复刻：`@deepseek-ai/cordis`
`@deepseek-ai/schemastery` `@deepseek-ai/cosmokit` 内核根本不检查（不匹配名字过滤），这里也
一律不报，报了就是噪声。附带一条：`workspace:` 协议不得留在任何发布字段里——内核装配时把
`workspace:^/~/ *` 当「无条件兼容」放行，可离开 pnpm workspace 后它解析不出任何东西，
写进清单就是给门撒谎。

## namespace —— 与官方客户端抢地盘

四条各自对应一次实测事故。① 包名撞内核包名（或沿用 `@deepseek-ai/` `@dsh-external/` scope）
→ `resolves from multiple active Loader sources`，启动直接废。② cordis **loader id** 撞内核 id
→ 补丁层按 id 寻址且整行替换、不做字段合并：实测内核 `dsh-base/cordis.patch.yml` 自带
`- id: plugin-manager`，而我们的 `assets/plugins/dsh-plugin-manager` 用了同一个 id，装上去会
**静默顶掉内核的插件管理器**，连 `dsh plugin add` 都坏掉——`kernel-entry-ids.json`（199 个 id）
就是防下一次。③ `@deepseek-ai/*` 只准出现在 `peerDependencies`：实测 desktop profile 自己的
`node_modules` 里 `@deepseek-ai` 包数量为 0，而 92 个内核包引用全靠安装域链接表
（`collectInstallationScopePackages`）供给；把它写进 `dependencies` 就会往 profile 里再装一份
物理副本 → 又回到 multiple Loader sources。④ `dsh.client.inject` / `external` 的名字必须落在
内核包快照里（或是一小撮显式白名单的裸 cordis 服务名——见 `CORDIS_SERVICE_IDS` 的注释，
`slots` / `sessions` / `workspaces` 是服务名不是包名，在两份快照里都查不到）。这类悬挂引用
**失败得很安静**：只产出一个永不挂载的 client 半边，症状是 Web 启动审计里一行 import 失败
（实测 `@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-web-react` 就是这种引用）。
另外还管全局名：官方 preload 已经 `exposeInMainWorld("dshDesktop", ...)`，而我们退役的壳在同一个
全局上挂了 55 个方法——迁移后只有 `packages/host-capabilities/src/**`（以及各包的 `test/**`）
可以再提这个名字，其余一律走那个探针模块；`__DSH_DESKTOP_FILE_PATH__`、`__dshDesktopOpenDir`、
`__dshSessionManager`、`dsh-balance-changed` 这些壳私有符号留着就是永不执行的死路径，
`window.dshDesktop ? …` 这种只判真值的探测更要命——迁移后分支恒假，功能静默消失。
最后 `dsh.client.platform` 必须是字符串 `"web"`：官方桌面客户端跑的就是同一份 web client
bundle，而 `parseDshClient` 不校验取值，一个「顺手改成 desktop」的提交会安静地让半边不挂载。

## self-mount —— bundle 必须自己挂载

实测：`dsh plugin add <pkg>` 只把包名写进 `dsh.profile.bundles` 与 `dependencies`，
真正插入 loader 行的是**包自己的 `cordis.patch.yml`**（由 `package.json → dsh.bundle.patch` 指过去），
profile 那份补丁层全程保持 `[]`。没有 `dsh.bundle.patch` 的包，管理器直接判 `not-bundle` 并
**回滚整次安装**（迁移期只有 18 个包声明，所以那时这一项恒红；现在 33 个自装载包全部声明，
唯一例外是纯能力库 `host-capabilities`）。
检查内容：声明存在、形态是字符串或有序字符串数组、每个路径都落在包内、文件能解析成
**YAML 数组**（顶层不是数组 = cordis 的 entry-list 方言读不出来）、数组里有一个 `insert` 块
且行内 `name` 等于本包包名（或其文档化子路径，如 `graph-memory/dsh`）、每行都有 `id`；
再跨全部包做 **loader id 唯一性**（同 id 双登记就是上面那个 multiple sources 崩溃）；
迁移期还会读 `dsh-desktop/scripts/lib/companion-plugins.js` 这份 tier 映射，核对登记 id 与
bundle patch 声明的 id 一致——issue #104 就是两处 id 漂移让自愈的 `dropBlocksByIds` 永不命中、
残留 insert 块双登记导致启动崩溃。`META_PACKAGES`（现在是 `host-capabilities`）是唯一的
豁免口：纯能力库没有 host 半边，不该挂载。

元包（目录 `meta-*`）另有两组判据：它按设计不插自己的行，插的是成员行，所以
① 一条 `insert` 都没有 = 空壳分层，报 error；② `dependencies` 必须恰好等于
「全部自装载成员 × `^<成员当前版本>`」（`findMetaDepDrift`）。第 ② 条是元包契约里唯一
能离线验的那一半：元包的传递依赖不会成为 bundle，所以少列一个成员 = 那个插件装完元包
根本不进 `node_modules`、它那份补丁层的行 `did not activate`；范围写旧 = 用户装到旧代码
（本地预览 registry 那次的形状）；写精确版本 = 之后的补丁修复永远送不出去。真机实测：
元包依赖指向未发布版本时 pnpm 报
`The latest release of @dsh-pack/dsh-auto-compact is "0.1.0"`（元包要 `^0.1.1`）整单失败。

## dep-closure —— 发布物的裸依赖闭包

包在开发机上能跑常常只是因为本机 `node_modules` 里恰好躺着东西。这里只认「`files` 允许清单
真的会发布出去的那些文件」，从里面的 `import` / `require` / `createRequire().resolve` 抽出裸
标识符，逐个要求它满足四条之一：Node 内建、`dependencies`/`optionalDependencies` 声明过、
`peerDependencies` 声明过**且**在 `kernel-packages.json` 里（也就是内核真会供给它）、或是相对
路径。其余报 error——装进 profile 后就是运行期 `ERR_MODULE_NOT_FOUND`，而且往往只在某条用户
路径上才炸。反向的「声明了却没用到」只降级 warn（bundle 内联会把 import 语句吃掉，判定不确定）。
注意 `dsh-better-sidebar` 的 `node-pty` 属于计划删除项，这里照实报出来，不为绿而藏。
抽标识符前会先等长剔除注释：`dsh-super-injector` 的 JSDoc 里写着
`import type { UserConfig } from 'tsdown'`，不剔注释就会报出一个根本不存在的依赖。

## publish-readiness —— 发布就绪（P0）

最关键的一条是 `dsh.client` ⇄ `exports['./client']` 的**成对性**。`dsh-client-modules` 的
registry 构造函数遇到「声明了 dsh.client 但没有 `./client` 出口」会抛
`ClientPackageCompositionError`，而 `modules` 在 app-boot 的全局 REQUIRED 清单上 →
`StartupError` → 整个应用起不来。更糟的是致命启动失败之后 `sanitizeProfile` 会把 profile 的
补丁层改名成 `.bak-<时间戳>` 并回滚到原始 bundle 清单——**整个插件包被抹掉**，用户甚至不知道
自己装了东西。所以这条是 P0，且反方向（有 `./client` 出口却没声明 `dsh.client`，白发布一份
产物）同样报 error。其余几条：`private: true`（npm publish 直接拒绝）、
缺 `license`、缺 `files` 或 `files` 里写 `node_modules`（没有允许清单时 npm 会把 `src/`、`test/`、
`node_modules` 残留，以及 `sourcesContent` 里内嵌了完整上游 TypeScript 的 `.map` 一起打出去）、
`main` / `exports['.']` 缺失或落不到真实文件、`dsh.bundle.patch` 缺失
（结构细节归 self-mount）、`repository.url` 指向 `deepseek-ai/deepseek-harness`（本包是插件包，
不是内核分叉，指错会让 issue 流向官方上游）。

## syntax —— 构建前语法门

`dsh-desktop/scripts/check-syntax.js` 搬到包根上的同款门（AGENTS.md 点名它拦的是
`node --check` 抓不到的那一类）。语义原样保留：先对包根下全部 `.js/.cjs/.mjs` 跑
`node --check`，再跑「`async`/`await` 关键字与 `function` 声明被空行/注释行拆开」的模式扫描
——v0.3.8 曾因此打出「启动即抛 `ReferenceError: async is not defined`」的安装包，孤立 async 是
合法表达式语句，`node --check` 放行、运行时才炸。剥离式扫描器优先直接 `require` 仓库里那份
`scripts/lib/js-syntax-scan.js`（单一事实源），`dsh-desktop` 被删掉后退到本文件内的逐字副本。
两处纯性能适配、不改判定：一个必要条件的行首筛（`NAKED_KEYWORD_LINE`，剥离器只把字符换成空格、
不产生新字母也不移动换行，所以原文没有行首 `async`/`await` 就不可能命中），以及 256 KiB 体积
上限——原实现在单行几万字符的生成 bundle 上是超线性的（实测 7 MiB 的 `client-mermaid.js` 光
剥离开销 183.6 秒，而同一个文件正则匹配只用 0.016 秒）。超限文件照样过 `node --check`，
并在本项 info 里逐个点名，不静默跳过。
