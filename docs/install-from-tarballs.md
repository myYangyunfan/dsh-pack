# 从本地 tarball / 本地预览 registry 安装 DSH Pack

> 面向本机已装官方 DeepSeek Harness 客户端（`desktop` profile）的场景。
> 本文只写**两条真实可走的通道**，以及升级到「修后版本」必须注意的几件事。
> 背景与契约以 `docs/spike-official-client.md`、`AGENTS.md` 为准。

## 0. 这批交付物是什么

`packs/` 里是 34 个 `@dsh-pack/*` 的 tarball（清单见 `MANIFEST.txt`）。
可装的只有 33 个：32 个成员 + 元包 `@dsh-pack/all`。剩下那个
`dsh-pack-host-capabilities-0.1.1.tgz` 是**构建期能力探针库**，不是 bundle——它的代码
在构建期内联进各插件的产物里，单独装它会被管理器判 `not-bundle` 并回滚（含它是为了让
`pack-local.mjs` 覆盖全部包，装的时候跳过它）。
由 `node tools/pack-local.mjs` 生成 —— `npm pack --ignore-scripts`，
打的就是**仓库里已提交的可加载产物**，不跑 prepare/prepack（跑了会用 `src/` 重新生成
`lib/`，产物就不是测过的那份了）。

**版本已升**：`@dsh-pack/all` 0.1.0 → **0.2.0**，32 个成员各自 patch 级递增。

## 1. 为什么必须升版本，而不是原地重发同版本

机器上现在装的是 `@dsh-pack/all@0.1.0`，内容是**修前**代码：

- `billion-context-dsh` 在 `agent/pre-step` 读 `session.events` —— 0.1.7-rc.1 内核里
  `Session` 已没有 `events` 数组（只剩 `SessionEventStream`）⇒ **每一轮对话抛 TypeError**；
- `dsh-openclaw-bridge` 读 `session.meta`、并把 `sessionPersistence.list()` 的返回当成
  header 数组 ⇒ IM 会话起不来、重启不续上下文；
- `dsh-subagent-lens` 页内把 `binding.session.events` 当数组 ⇒ 子窗口空白（静默失败）。

内核按**版本号**判断「已是最新」，同版本重发不会重取 ⇒ 修复要落地，版本号必须前进。

## 2. 两条通道（先读这段）

| | 通道 A：本地预览 registry | 通道 B：纯离线 tarball |
| --- | --- | --- |
| 前置 | 本机能起 verdaccio | 无 |
| 装法 | agent 一条 `install_bundle @dsh-pack/all@^0.2.0` | agent 逐个装 32 个成员 tarball |
| 元包 | ✅ 用得上（依赖由 pnpm 解析） | ❌ 用不上（它的依赖要去 registry 取） |
| 适用 | 想「一条命令装全」、后续还想按名升级 | 不想碰 registry、或只要子集 |

两条通用：

- **面向用户的安装入口只有两个**：客户端内「设置 → 插件」，或会话里让 agent 用
  `plugin_manager` 工具。`dsh plugin --profile desktop …` 会被 CLI 硬拦
  （`managed exclusively by the Electron application`）。
- **启用/停用插件要重启应用**，不是刷新页面（页内注入清单只在宿主 ready 时抓一次）。
- 设置→插件 UI 对**已装**条目会被内核 `inspect` 的 `already-installed` 判据拦下 —— 但这条
  判据**只作用于「包名」与「目录路径」两种形态**（`path` / `registry`）；写成**绝对 `.tgz`
  路径**时走的是 `tarball` 形态，内核不查 `already-installed`（`parseInstallSpec` 的
  tarball 分支直接 accepted）。所以离线升级**能在插件页手动点**，路径清单见 §4b。
  agent 工具的 `install_bundle` 两种形态都能用。

## 3. 通道 A：本地预览 registry

```bash
# ① 起本机 verdaccio（两个监听口共用同一份 storage；
#    ~/.npmrc 里 @dsh-pack:registry 指向 14874，装与发都以它为准）
node tools/preview-registry.mjs
# 它会写 config 到 .tmp-preview-registry/、打印 storage 与后续两条命令。
# 别自己写 `max_users: -1` —— verdaccio 5 里那是「关闭注册」，login 会吃
# 409 user registration disabled。

# ② 建发布凭证（写进独立 userconfig，不碰 ~/.npmrc，不打印 token）
node tools/codemod/preview-registry-login.mjs 14874

# ③ 全量发布（--purge：先删同版本再发 —— 别对同一版本号发不同内容，
#    pnpm 会按自己缓存的旧 tarball 解析）
node tools/codemod/publish-local-preview.mjs http://127.0.0.1:14874 --purge --userconfig="$TEMP/dsh-preview-npmrc"
# 实测：34 个包全绿（0 失败），约 2 分钟。
```

然后在客户端里对 agent 说：

> 用 plugin_manager 的 install_bundle 装 `@dsh-pack/all@^0.2.0`。

**这条路本机实测走通过**（在真 profile 的完整副本上，registry 起着）：
`pnpm add @dsh-pack/all@^0.2.0` 4.4s 成功，`node_modules/@dsh-pack` 下 33 个实体包
（元包 + 32 成员全到齐、版本就是本批 0.2.x），启用后 `--dump-config` 32 个 id 全在、
重复 0、致命诊断 0。registry 只在**安装那一刻**要在；装完 node_modules 是自足的。

装完重启应用。首次装会被构建门禁拦一次（见 §5；本机 `allowBuilds` 已放行，不会再弹）。

> ⚠ **别用「粘 all 的 .tgz 路径」这条路装元包。** 实测（本机真 profile 副本）：
> profile 里那条陈旧的 `"@dsh-pack/all": "^0.1.0"` 会让 pnpm 为同名包做重解析，
> 去 14874 找 `^0.1.0` —— 而那里只有 0.2.0 ⇒
> `ERR_PNPM_NO_MATCHING_VERSION ... The latest release of @dsh-pack/all is "0.2.0"`，
> 整单回滚（`installBundle` 把 package.json 与 lockfile 都还原了）。
> 按名装 `^0.2.0` 自己就是新 spec，会把那条旧声明**替换**掉（实测装完
> `dependencies` 变成 `"@dsh-pack/all": "^0.2.0"`），所以按名装没有这个问题；
> 换成粘 tarball 路径则要先手工清掉那条旧声明。成员包不受影响（包名不同，不触发重解析）。

## 4. 通道 B：纯离线 tarball

**第一步必须先关掉旧的元包**，否则双装配：`all@0.1.0` 的补丁层插入 32 行，与我们新装的
成员是同一批 id，而内核的 `insert` **不去重**（`data.push(...insert)`）—— 同一个 id 装配两次，
带 webserver 路由的条目会报 `duplicate exact route` 且不激活。

> 让 agent：`plugin_manager set_bundle`，target `@dsh-pack/all`，enabled `false`。

禁用只是把它从 `dsh.profile.bundles` 里拿掉，依赖仍留在 profile 里、**不再贡献任何行**
（实测：装了但不在 bundles 里的包，`--dump-config` 里 0 行）。

第二步逐个装成员 tarball：

> 让 agent：用 `plugin_manager install_bundle` 逐个装
> `C:/Users/delinger/Desktop/dsh/packs/*.tgz` 里的成员包（32 个；也可以只挑你要的）。

- 成员之间**零** `@dsh-pack` 依赖，任意子集都能单独装、单独挂；
- `packs/dsh-pack-all-0.2.0.tgz` **不要单独装**：它的 32 个依赖要去 registry 取，
  registry 没起时会整单失败；registry 起着也不行 —— 那条陈旧 `^0.1.0` 声明会噎死它
  （两种失败都是实测，见 §3 的 ⚠）；要一条装齐就走通道 A；
- `packs/dsh-pack-host-capabilities-0.1.1.tgz` 也不要装：它是构建期探针库、不是 bundle，
  管理器会判 `not-bundle` 并回滚整次安装；
- 只想先止住「每轮 TypeError」：也按本节先禁用 `all`，再单装
  `dsh-pack-billion-context-dsh-0.2.2.tgz`。

装完重启应用。

### 4b. 自己在客户端里点（不用叫 agent）

路径清单已生成：**`packs/PATHS.txt`**（一行一条绝对路径，正斜杠写法，可反复重生成：
`node tools/pack-local.mjs`）。它的顺序是刻意排的：第 1 条是「每轮对话 TypeError」的正主；
最后 2 条会碰原生构建脚本（better-sidebar 的 `node-pty`、graph-memory 的
`@photostructure/sqlite`），放最后是因为**在放行之前，此后每一次安装都会被同一个门禁整体拒掉**。
（原生依赖只有这两个包；`harness-pet` 名字像带原生资产，实则零 `dependencies`。）

1. 设置 → 插件，先在列表里把 **`@dsh-pack/all` 的开关关掉**（停用，不要卸载 ——
   卸载在无 hmr 服务时会报 `stop-profile`）。**本机已经是这个状态**：profile 的
   `dsh.profile.bundles` 实测只有 `@deepseek-ai/dsh-base` / `-web-app`，`all` 只剩
   `dependencies` 里那条 `^0.1.0`（复现演练实测：留着它不影响装成员 tarball，
   预览 registry 没起也能装）。
2. 在安装输入框里**粘贴一条 `.tgz` 绝对路径**（如 `packs/PATHS.txt` 第 1 条），点安装。
   名字虽已存在（是旧 `all` 的依赖），tarball 形态不会被 `already-installed` 拦（见 §2）。
   ⚠ **粘成员包可以，粘 `dsh-pack-all-0.2.0.tgz` 会被那条陈旧 `^0.1.0` 声明噎死**（见 §3）。
   想一条装齐就用 §3 的通道 A。
3. 装完对话框上会有一个**「立即启用」**按钮 —— 点它，它做的就是把包名写进
   `dsh.profile.bundles`（内核 `setBundleEnabled(name, true)`）。
4. 若遇到 **「允许这些脚本并重试」**（`installApproveAndRetry`）就点它，然后照第 3 步
   再启用一次。**本机不会再弹**：profile 的 `pnpm-workspace.yaml` 里
   `allowBuilds` 已经是 `{'@photostructure/sqlite': true, node-pty: true}`。
   （没放行过的机器会弹一次，写的就是这个字段，之后不再询问。）
5. 32 条都装完启用后**重启客户端**（页内注入清单只在宿主 ready 时抓一次，刷新页面无效；
   内核自己的提示是「更改将在下次启动生效」）。实测单个成员安装约 1–3 分钟
   （每次都要重解析整棵树），32 条要留够时间。
6. 想核对结果：插件列表里应出现 32 个可开关的条目，`@dsh-pack/all` 仍是关闭态。

## 5. 首次安装会被 pnpm 11 的构建门禁拦一次（没放行过的机器）

两个依赖带 install 脚本，pnpm 默认不跑：`node-pty`（better-sidebar 的
`optionalDependencies`）、`@photostructure/sqlite`（graph-memory）。全仓库就这两处
（实测 J2 的报错原文：`Ignored build scripts: @photostructure/sqlite@1.2.1, node-pty@1.1.0`）。
本机 profile 的 `allowBuilds` 已经是 `true`，不会再弹；其它机器安装会报
`ERR_PNPM_IGNORED_BUILDS`，按提示做一次即可：

- 客户端里：点「**允许这些脚本并重试**」；
- agent：`install_bundle` 带上 `approvedBuilds: ["node-pty", "@photostructure/sqlite"]`。

这两个包**不需要编译工具链**：sqlite 的六个平台预编译都在包内（含 win32-x64/arm64），
`node-gyp-build` 运行期直接按 `prebuilds/<platform>-<arch>/` 取二进制。那一下放行是让
安装器闭嘴，不是「不点就没有二进制」。

## 6. 回滚

照 `docs/recovery.md`：恢复流程底层是 `sanitizeProfile` —— 把 profile 的
`cordis.patch.yml` 改名成 `.bak-<时间戳>` 兄弟文件，并把 bundle 列表恢复到出厂项。
**家层 `$DSH_HOME/cordis.patch.yml` 不受影响**且优先级更高（那是本机开关层）。
动手前最稳的备份就是把 `~/.dsh/profiles/desktop` 整个目录复制一份。

## 7. 别做的事

- 装完 `all` 再从插件页单装其中一个成员（双装配，见 §4）；
- 往 profile 的 `cordis.patch.yml` 写行（每个包自装载；profile 层会被原样保留成 `[]`）；
- 用 `dsh plugin --profile desktop …`（CLI 硬拦，见 §2）。

## 8. 这批包被验证到什么程度

- `node tools/audit/index.js`：8 项静态门禁，0 error；
- 单测：CI 同款命令全绿；
- **J4 真启动激活**：`tools/itest/boot-activation.mjs`，全部条目真挂载、零未激活、
  零 duplicate route，并跑页内探针；
- **J2 真装真组合**：`tools/itest/boot-desktop-profile.mjs --job=j2`，33 个 tarball
  `npm pack` 产物审计干净 → 逐个装进临时 profile → 每个 loader id 都出现在
  `--dump-config` 的最终树里（带原生依赖的两个包按插件页的真实序列：失败 → 放行 →
  重试，见该文件里 `addWithBuildApproval` 的注释）。判据按包分类：32 个成员包离线
  必装必挂（严格计数）；唯一那个元包要么装成功、要么**只允许**因「依赖版本尚未发布」
  失败 —— 别的失败原因一律红。元包依赖表 ↔ 成员的那条不变量由 `self-mount` 门禁
  离线把守（缺成员/范围写旧/列了非成员都报 error）；
- 真机复验：全插件挂载下经 openclaw-bridge 打三轮对话，HTTP 200 + mock 回复；
  另有一个一次性探针包在真内核上核对 `session.header` / `sessionPersistence.list()`
  的新形状（11/11，含两条反证）；
- **安装演练（真 profile 的完整副本，绝不动原 profile）**：
  - 通道 B：32 个成员 tarball 逐个装完 → `--dump-config` 32 个 id 全在、重复 0、
    致命诊断 0；随后把 `@dsh-pack/all` 放回 `bundles` 做**反证** —— 探针成员的
    id 计数立刻从 1 变 2（双装配确有其事），再拿掉又回到 1；
  - 通道 A：只装一条 `@dsh-pack/all@^0.2.0` 就补齐 32 个成员 + 32 个 id，指标同上；
    同一条路径下用 tarball 形态装元包则**必然失败**（陈旧 `^0.1.0`，见 §3）。
