# DSH Pack

> 装进**官方 DeepSeek Harness 桌面客户端**的插件整合包。
> 29 个插件，装 `@dsh-pack/all` 一个包就齐了。

<p align="center"><img src="docs/banner.svg" alt="DSH Pack" width="720"/></p>

---

## ⚠️ 关于旧的「DSH Desktop」自制客户端

本仓库原本是一个自制桌面客户端（`dsh-tauri/` Rust 壳 + `dsh-desktop/` 内核侧机器），
用来包裹上游内核 `@deepseek-ai/dsh`。**上游已经发布了自己的官方桌面客户端，
自制壳就此退役**——不再有新版 exe、不再有安装器、不再有自动更新。

仓库现在交付的是**纯插件包**：所有能力通过官方客户端自己的插件机制装载。

如果你还在用 0.6.x 的自制客户端：

- 它不会坏了，但也**不会再更新**；`%LOCALAPPDATA%\Programs\DSH Desktop` 请自行卸载。
- 你的会话、凭据、设置在 `~/.dsh` 下，**换客户端不会丢**——官方客户端读同一个 `~/.dsh`。
- 迁移三步：① 装官方 DeepSeek Harness；② 打开它，登录/配好模型；
  ③ 在「设置 → 插件」里装 `@dsh-pack/all`。细节见 [`docs/recovery.md`](docs/recovery.md)。

---

## 怎么装

在官方客户端内 **设置 → 插件** 的「安装插件」输入框中，支持以下两种便捷安装方式：

### 方式 A（推荐）：直接粘贴 Git 仓库链接

在输入框中直接粘贴并安装：
```text
https://github.com/myYangyunfan/dsh-pack.git
```
- **无需等待 npm 发版**：直接拉取最新代码，一键装齐全部 29 个插件。
- 仓库根目录已内置自装载描述与聚合补丁（`cordis.patch.yml`），由客户端直接识别装配。

### 方式 B：按 npm 包名安装（`@dsh-pack/all`）

在输入框输入 `@dsh-pack/all` 即可一键装齐全部 29 个插件。
或直接对会话中的 Agent 说：「用 install_bundle 装 `@dsh-pack/all`」。

> **命令行装不了。** `dsh plugin --profile desktop …` 会被官方 CLI 硬拦
> （`profile "desktop" is managed exclusively by the Electron application`）——
> 那是官方客户端自己独占的 profile。`dsh plugin` 只对自定义 profile 有效，
> 那是开发/CI 用的路子，不是给官方客户端装插件的路子。

### ⚠️ 安装重要提示

> ⚠ **装了整合包（无论是 Git 链接还是 `all`）就不要再单独装其中的单个成员插件。**
> 每个插件本来都能单装（各自带一份挂载声明），而内核的补丁 `insert` 是按行追加、
> 不按 id 去重的：同一个插件被插入两次就会被**装配两次**，
> 第二次注册路由时报 `webserver: duplicate exact route`，导致该项无法激活。
> 想要小集合，就**别装整合包**，只按下面的用途分组挑单个插件装。

### 按用途分组（挑着用，不是可叠加的层）

| 分组 | 内容 | 体积 | 说明 |
| --- | --- | --- | --- |
| 基础体验（18 个） | 余额与费用、文件变更追踪与还原、拖入/粘贴、输入历史与折叠、自动压缩、变更审核、峰谷价提醒、设置页整理、Quest 界面、子代理快视、消息撤回、工作区锚定、系统提示词自定义 | 小 | 无原生模块，装完就生效 |
| 较重 UI / 宿主路由（9 个） | 右侧栏、MCP/skills 面板、synapse 画布、视觉与推理档位、prompt 优化、社区市场、zcode 历史迁移、`harness-pet` | 中 | `harness-pet` 出厂是关的 |
| `dsh-cardian` + `graph-memory` | 知识库 + 跨会话图谱记忆 | ~85MB | 两者出厂都是关的；**放行构建脚本的是 `graph-memory`**（`@photostructure/sqlite`），`dsh-cardian` 没有原生依赖 |
| `dsh-pocket` | 手机扫码镜像/遥控 | ~45MB | 上游包，GPL-2.0，我们不 fork |
| `dsh-openclaw-bridge` | 微信 / 飞书渠道桥 | ~15MB | |
| `billion-context-dsh` | ACP 上下文压缩后端 | ~35MB | 装上即开启 |

### 两件必须知道的事

**① 启用/停用插件要重启应用，不是刷新页面。**
官方宿主只在进程启动时抓一次页内注入清单，之后是快照。按 F5 看不到效果。

**② 带 `graph-memory` 的安装会要求你放行一次构建脚本。**
pnpm 11 默认拦依赖的 install 脚本，而它的依赖 `@photostructure/sqlite` 带
`"install": "node-gyp-build"`，所以第一次装会失败并列出待放行包。
在「设置 → 插件」页面点 **「Allow these scripts and retry」** 即可，之后不再询问。

（不用担心要装编译工具链：该包六个平台的**预编译二进制都在包内**，含 `win32-x64`/`win32-arm64`，
运行期直接取用。这道点击只是让安装器闭嘴。）

---

## 里面有什么

### `core` —— 每天都在用的那些

- **`dsh-balance`** 余额坞：会话区显示账户余额 + 本轮估算费用，含峰谷价与周末折扣判定。
  官方客户端本身**没有**任何余额功能，这是本包补的最大一个洞。
- **`dsh-file-changes` / `dsh-client-file-changes`** 「本会话改了哪些文件」视图 + 逐条 diff + **一键还原**。
- **`dsh-input-history`** 像终端那样用 ↑/↓ 翻本会话发过的消息；**`dsh-input-fold`** 折叠超长 prompt。
- **`dsh-auto-compact`** 接近上下文上限时自动 `/compact`。
- **`dsh-change-review`** 让模型复核自己刚写的改动（正确性 / 安全 / 是否切题）。
- **`dsh-offpeak`** 峰谷价守卫：高峰期按住不发，排到谷期再发。
- **`dsh-easyrewrite`** 无缝撤回并重编辑已发送消息。
- **`dsh-conversation-tweaks`** 折叠超长输出 + 右侧会话导航轨。
- **`dsh-quest-ui`** 任务式沉浸界面（默认关）。
- **`dsh-subagent-lens`** 子代理/Task 委派的展开式活动视图。
- **`dsh-settings-nav-custom` / `dsh-settings-groups`** 设置页左侧导航显隐重排 + 低频项折叠成「高级」。
- **`dsh-prompt-custom`** 定制内核注入的系统提示。
- **`dsh-workspace-anchor`** 给稳定系统提示注入紧凑的 `{{cwd}}` 偏好块，让 agent 守在工作区里。

### `plus` —— 更重的界面与能力

- **`dsh-better-sidebar`** 类 VSCode 的右侧栏：资源管理器 / 编辑器 / 终端 / git / 浏览器，
  按会话隔离。用的是内核公开的右栏标签 API，不是改内核。
- **`dsh-basics-panel`** 一处集中查看/管理 MCP server、skills、rules。
- **`dsh-synapse`** 可拖拽缩放的非线性会话画布（分支、追问）。
- **`dsh-reasoning-effort`** 从模型目录取 `reasoning.efforts` 的 Codex 风格模型/思考档位选择器。
- **`dsh-prompt-optimizer`** 一键把输入区草稿打磨成结构化 prompt。
- **`dsh-community-market`** 可视化插件市场：开放目录源、搜索、校验过的 npm 安装、开关与回执。
- **`dsh-zcode-migrate`** 把 zcode CLI 的 SQLite 历史转成原生 dsh 会话日志。
- **`harness-pet`** *（出厂关）* 一只页内小鲸鱼。

> 原先这一层还含 `dsh-side-session`（浮动窗口临时会话）与 `dsh-super-injector`
> （运行时插件注入器）。查证后两者**不由我们发布**：前者上游仓库存在但没有任何 LICENSE
> （无许可证即保留所有权利），后者上游地址直接 404、且我们改过它的源码。
> 详见 [`not-shipped/README.md`](not-shipped/README.md)；需要 side-session 的话，
> 在「设置 → 插件」填上游 GitHub 地址自行安装即可，那是你与作者之间的授权关系。

### 可选大件

- **`knowledge`** — `dsh-cardian`（RepoWiki / 知识卡片 / 记忆 → 本地 Obsidian vault）
  + `graph-memory`（跨会话知识图谱：PageRank、社区检测、向量去重）。
- **`pocket`** — 手机扫码实时镜像并操作桌面 Web UI，走局域网或公网隧道。
- **`bridge`** — 微信 / 飞书官方渠道接进 dsh agent 会话。
- **`compaction`** — 用 ACP 模型驱动的上下文裁剪替换内置压缩后端。

完整清单与每个插件的开关，装好之后在「设置 → 插件」里能直接看到。

> **已退役成员**：`dsh-vision`（识图）、`dsh-file-drop`（文件拖拽/导入）及 `dsh-image-paste`（图片粘贴）已退役并移出元包，因官方客户端已全面原生支持输入框附件导入、文件拖拽导入、剪贴板图片粘贴与多模态端点识图，避免与官方功能重复与冲突。

---

## 自制壳退场所带来的功能差异

诚实说明我们**做不到**的部分——这些原本是原生窗口管理能力，插件形态下无法复现：

| 原自制壳有 | 现在 |
| --- | --- |
| 托盘常驻、关窗最小化到托盘、一键重启 | **没有**（官方无托盘概念） |
| 会话完成的**系统级**通知、任务栏闪烁 | 降级为页内提醒（宿主不给原生 toast） |
| `harness-pet` 的**原生悬浮窗** | 只有页内宠物 |
| WSL 后端（把内核跑在 WSL 发行版里） | **没有**，见 `docs/wsl.md`（如何在 WSLg 里跑官方客户端） |
| 自定义应用图标（含改 .lnk 快捷方式） | **没有** |
| 自制壳那条 36px 玻璃标题栏 + ⋯ 菜单 | 官方用自己的原生窗口装饰 |

反过来，几件原本是「壳替插件干活」的能力已经**搬进插件自己**，所以照常可用：
余额取数、剪贴板图片落盘、文件一键还原 —— 都是插件宿主半边直接注册 HTTP 路由完成的。

---

## 开发

```bash
pnpm install
node tools/audit/index.js                      # 8 项静态门禁，发布前必须绿
node tools/build-meta-patches.mjs              # 由成员补丁层重新生成 meta-all 的补丁层
node tools/itest/tier-overlap-proof.mjs        # 取证：元包同装会不会把成员插两次
node --test "packages/*/test/*.test.js"        # 单测
node tools/itest/boot-desktop-profile.mjs --job=j1   # 真装真组合（需 npm 装一份内核）
```

约定、边界、以及**改之前必须知道的坑**都写在 [`AGENTS.md`](AGENTS.md)。
贡献流程见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

几件会让人踩坑的事实，记在 [`docs/spike-official-client.md`](docs/spike-official-client.md)
（对真装的官方客户端逐字实测的记录）里，其中三条最要紧：

- 插件必须**自己声明补丁层**才能挂载；靠元包 `dependencies` 带进来是**惰性无效**的
  ——不报错，但一个都不挂。
- `@deepseek-ai/*` 只能放 `peerDependencies`。放进 `dependencies` 会装出第二份物理拷贝，
  导致**整个官方客户端拒绝启动**。
- 一个包写错（比如声明了 `dsh.client` 却没有可解析的 `exports["./client"]`）
  同样能让官方客户端起不来；而用户一旦触发恢复对话框，`sanitizeProfile` 会把
  **整个插件包从 profile 里抹掉**。所以 `tools/audit/publish-readiness.js` 是 P0 门禁。

## 给上游提的 bug

我们退役了自制的内核补丁层，其中两簇是真·上游缺陷（插件表达不了），
正文与可复现证据都在 `docs/upstream/`：

- [`session-log-durability.md`](docs/upstream/session-log-durability.md) ——
  会话日志的读路径 fail-closed，会毁掉用户历史。现场实测一台机器
  **54 个会话里 19 个打不开**。写路径可扩展、读路径冻结，
  意味着任何写了新字段的第三方插件都会永久砖掉更旧读取者的历史。
- [`pi-ai-error-taxonomy.md`](docs/upstream/pi-ai-error-taxonomy.md) ——
  四处 provider 错误误分类，把终态、用户可操作的状况报成瞬时或误归因的状况，
  其中三处用户的纠正动作（重填密钥 / 删会话 / 等重试）是** actively 错的**。
- [`retirement-precedents.md`](docs/upstream/retirement-precedents.md) ——
  本仓库在上游吸收后干净退役自己代码的制度记忆。

## 许可

MIT。第三方组件的署名与再分发说明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)；
其中 `dsh-pocket` 为 GPL-2.0（我们按上游原样依赖，不 fork）。
