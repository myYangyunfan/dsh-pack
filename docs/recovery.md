# 出问题了怎么恢复

面向装了 `@dsh-pack/*` 插件包的官方 DeepSeek Harness 客户端用户。

## 先知道一件事：启用/停用插件要**重启应用**，不是刷新页面

官方桌面宿主只在进程 ready 时抓一次页内注入清单
（`ctx.webServer.collectIndexInjections()`），然后把这份快照通过 boot IPC 交给渲染进程。
所以在「设置 → 插件」里打开某个开关后**只按 F5 是看不到效果的**——必须整个应用退出重开。

这不是插件包的 bug，是宿主的装载模型。

## 用户侧安装通道只有两个

CLI 对 `desktop` 这个 profile 是**锁死**的：

```
$ dsh --profile desktop --dump-config
error: profile "desktop" is managed exclusively by the Electron application
```

拦截是硬编码的按名判断（`@deepseek-ai/dsh/lib/bin.js` 的 `rejectElectronProfile`），
大小写不敏感，绕不过也不该绕。可用的通道是：

1. **设置 → 插件**，按 npm 包名安装；
2. 会话里让 agent 用 `install_bundle` 工具装（需要放行构建脚本时它还能代你填 `approvedBuilds`）。

CLI 的 `dsh plugin --profile <名字>` 只对**自定义** profile 有效——那是我们 CI 用的路子，
不是给官方客户端装插件的路子。

## 官方客户端起不来了

最常见的成因是某个插件包写坏了：`dsh.client` 声明了却有 `exports["./client"]` 缺失或指不到文件，
或者同一个包被解析出两份物理拷贝（`resolves from multiple active Loader sources`）。
两者都会让 `modules` 这个必需条目激活失败 → `StartupError` → 应用直接不给启动。

启动失败对话框里选 **「禁用第三方插件、备份 profile patch 并重启」**。

⚠️ **注意这个动作的副作用**：它底层是 `sanitizeProfile`，会把 profile 的 `cordis.patch.yml`
改名成一个 `.bak-<时间戳>` 兄弟文件，并把 bundle 列表**恢复成出厂那 3 项**。
也就是说——**一次致命启动会把整个插件包从 profile 里抹掉**，不只是禁用。
恢复完之后需要重新把包加回去（见下）。

## 把插件包加回来

只有一个聚合元包，装它就够了（在「设置 → 插件」里按包名装，或让 agent 装）：

| 包 | 内容 | 备注 |
|---|---|---|
| `@dsh-pack/all` | 32 个插件（全部成员） | 里面带原生依赖的成员要放行一次构建脚本，见下 |

装回来不等于全开：补丁层里有三个条目出厂就写着 `disabled: true` ——
`harness-pet`、`dsh-cardian`、`graph-memory`，要用得在「设置 → 插件」里自己打开，
然后**重启应用**（见文首那条）。

⚠️ **装了 `all` 就不要再从「设置 → 插件」单独装其中的某一个成员。**
每个成员包按设计都必须能单独安装（各自带一份 `cordis.patch.yml`，由
`package.json#dsh.bundle.patch` 指过去），于是「`all` + 其中一个成员」会让那个成员的行
被 **insert 两次**——内核 `applyEntryPatches` 处理 `insert` 是 `data.push(...insert)`，
不看内容、不按 id 去重（「按 id 整行替换」只作用于覆盖型补丁 `- id: X / 字段: 值`，
**不作用于 insert**）。同一个插件被装配两次，它的 host 半边第二次注册同一条路由时抛
`webserver: duplicate exact route "…"`，真机表现为「N entries did not activate」。
想要一个小集合，就**只单独装那几个成员包，别和 `all` 混装**。

原来那套阶梯分层（`core` ⊂ `plus` ⊂ `all`）已经全部退役，原因同上：
`core` 与 `all` 同装时组合出 50 行、**18 个重复 id**（取证脚本
`tools/itest/tier-overlap-proof.mjs`，直接调内核的 `composeEntries`）。
成员在 `tools/tiers.json` 里仍留着 `tierOf` 标签，但那只是「按用途分组」的文档口径，
**不再生成元包，也不代表可以叠加安装的层**。
元包也只此一个、不做嵌套：实测元包的**传递依赖不会变成 bundle**，
所以 `all` 自带一份由成员补丁层拼接生成的 `cordis.patch.yml`。

## 「Allow these scripts and retry」是怎么来的

pnpm 11 默认拦依赖的 install 脚本。`all` 里会撞上它的，是带原生依赖的成员：
`@photostructure/sqlite`（`graph-memory` 的依赖，`install` 脚本是 `node-gyp-build`）与
`node-pty`（`dsh-better-sidebar` 的终端标签，声明在 `optionalDependencies` 里）。
所以装 `@dsh-pack/all` 时可能失败并列出 `pendingBuilds`：

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @photostructure/sqlite@1.2.1
```

在「设置 → 插件」页面点 **「Allow these scripts and retry」**；批准按包名持久化在
profile 的 `pnpm-workspace.yaml` 的 `allowBuilds` 里，之后不再询问。

不点放行会怎样：`@photostructure/sqlite` 缺席则图谱记忆不可用；`node-pty` 缺席则终端标签
不可用，但**不会崩** —— `dsh-better-sidebar` 的 `loadNodePty` 是懒加载且明确 never throws，
缺席时走 `/sidebar/api/terminal.deps` 给出修复提示，其余功能照常。

被拦下时 pnpm 会先在那个文件里写好一个**待你填空的占位条目**：

```yaml
allowBuilds:
  '@photostructure/sqlite': set this to true or false
```

那个按钮做的事就是把 `set this to true or false` 就地改成 `true`。
所以如果你更想手改文件：**改这一行的值，别在文件里另加一个 `allowBuilds:` 键**——
YAML 重复键会让 `pnpm add` 直接失败（我们 CI 的 J3 用例就是钉住这个形状的）。

补充一点实测结论，免得担心：该包**六个平台的预编译二进制都在包内**（含 `win32-x64`、`win32-arm64`），
`node-gyp-build` 运行期就是按 `prebuilds/<platform>-<arch>/` 取二进制。所以这道点击是
「让安装器闭嘴」，不是「不点就没有二进制、还要装 MSVC 编译器」。

## 版本提示：「may cause crashes or data loss」

官方客户端有强制更新策略，内核版本会在我们不参与的情况下前进。内核的兼容门禁会检查
插件 `peerDependencies` 里 `@deepseek-ai/dsh*` 的区间是否满足当前运行时；不满足就直接拒绝安装。

我们把区间放宽成 `>=0.1.0-rc.6 <2`，正是为了避免每次官方升级都让所有用户看到这句警告。
如果你真的碰到了，逃生门是（CLI，且只能对自定义 profile 用）：

```
dsh plugin --profile <名字> allow-version <@dsh-pack/包名>@<版本> --dsh-version <内核精确版本> --accept-risk
```

它会写进该 profile 的 `compatibility.json`。请把它当成显式承担风险的动作，而不是常规操作。

## 唯一不会被恢复流程抹掉的层

`$DSH_HOME/cordis.patch.yml`（家层）优先级压过每个 profile 的 patch 层，而且 `sanitizeProfile`
明确**不动**它。所以：

- 想永久关掉某个插件，写到家层比写到 profile 层更耐折腾；
- 因为补丁层是**按 id 整行替换、不做字段合并**的，家层里覆盖某个插件时必须**重述整行**
  （包括完整 `config:`），只写想改的那个字段是不生效的；
- 家层的 id 以插件自带 `cordis.patch.yml` 里那行为准，我们承诺不改 id（改了用户手写覆盖会变孤儿）。
