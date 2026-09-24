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
恢复完之后需要重新把各分层加回去（见下）。

## 把插件包加回来

按需要的分层逐个装（在「设置 → 插件」里，或让 agent 装）：

| 分层 | 内容 | 体积 | 备注 |
|---|---|---|---|
| `@dsh-pack/core` | 18 个基础体验插件 | 小 | 无原生模块、无需构建脚本放行 |
| `@dsh-pack/plus` | 11 个较重的 UI/宿主路由插件 | 中 | `harness-pet`、`dsh-super-injector` 出厂是关的 |
| `@dsh-pack/knowledge` | `dsh-cardian` + `graph-memory` | ~85MB | **需要放行一次构建脚本**，见下 |
| `@dsh-pack/pocket` | 手机扫码镜像 | ~45MB | GPL-2.0 上游包，我们不 fork |
| `@dsh-pack/bridge` | 微信/飞书渠道桥 | ~15MB | |
| `@dsh-pack/compaction` | ACP 上下文压缩后端 | ~35MB | 装这一层本身就是开启 |

`core` 与 `plus` 是加性关系，README 建议两个都装。分层刻意不做嵌套：
实测元包的**传递依赖不会变成 bundle**，嵌套元包会静默地一个插件都不挂。

## 「Allow these scripts and retry」是怎么来的

pnpm 11 默认拦依赖的 install 脚本。`@dsh-pack/knowledge` 依赖的
`@photostructure/sqlite` 带 `"install": "node-gyp-build"`，所以安装会失败并列出 `pendingBuilds`：

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @photostructure/sqlite@1.2.1
```

在「设置 → 插件」页面点 **「Allow these scripts and retry」**；批准按包名持久化在
profile 的 `pnpm-workspace.yaml` 的 `allowBuilds` 里，之后不再询问。

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
