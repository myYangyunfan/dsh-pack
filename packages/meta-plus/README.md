# @dsh-pack/plus —— 增强层

装一个包 = 装一整层。本元包含 **11** 个插件：

| 包 | 用途 | 装上后的状态 |
| --- | --- | --- |
| `@dsh-pack/dsh-better-sidebar` | VSCode 式右侧栏工作台（文件 / 编辑器 / 终端 / git / 浏览器），按会话隔离 | 默认启用 |
| `@dsh-pack/dsh-basics-panel` | 设置页可视化管理 MCP 服务器 / 技能 / 规则 | 默认启用 |
| `@dsh-pack/dsh-reasoning-effort` | Codex 风格「模型 + 推理强度」选择器 | 默认启用 |
| `@dsh-pack/dsh-vision` | 识图：为纯文本模型提供 view_image 工具，走任意 OpenAI 兼容 VLM 端点 | 默认启用 |
| `@dsh-pack/dsh-synapse` | 会话地图：同一工作区的会话/追问/分支呈现为可拖拽画布 | 默认启用 |
| `@dsh-pack/dsh-side-session` | 临时会话：独立悬浮窗，自动导入主对话上下文，不污染主会话 | 默认启用 |
| `@dsh-pack/dsh-super-injector` | 超级模组注入器：运行时注入本地插件包，不碰 patch / 不重启 | 默认关闭（装上但不挂载，设置页自行打开） |
| `@dsh-pack/dsh-prompt-optimizer` | 输入框 prompt 一键润色为结构化高质量提示 | 默认启用 |
| `@dsh-pack/dsh-zcode-migrate` | zcode CLI 历史会话 → dsh 原生会话日志迁移 | 默认启用 |
| `@dsh-pack/dsh-community-market` | 可视化插件市场：开放目录源 + 搜索 + registry 校验安装 | 默认启用 |
| `@dsh-pack/harness-pet` | 桌面小鲸鱼宠物 | 默认关闭（装上但不挂载，设置页自行打开） |

> 11 个体量/侵入性更高的插件：侧边栏工作台、基础能力面板、推理强度选择、识图、会话地图、临时会话、prompt 润色、zcode 会话迁移、社区插件市场；另含两个默认关闭项（超级模组注入器、桌面宠物），装上即挂载但处于 disabled，用户在设置页自行打开。

## 怎么装

官方客户端里两条通道（`dsh plugin` 命令行对 `desktop` profile 是硬拒的，见
docs/spike-official-client.md §0.1）：

1. **设置 → 插件**，按 npm 包名安装：`@dsh-pack/plus`；
2. 会话里让 agent 用 `install_bundle` 工具装同一个包名。

## 为什么元包要自带 cordis.patch.yml

实测（同一份 spike 记录 §0.3）：元包的传递依赖**不会**成为 bundle——装得上、跑得起、
一个插件都不挂，而且用户侧没有任何报错。所以本层的挂载行由
`meta-plus/cordis.patch.yml` 这一层插入，成员包同时保有自己的
`cordis.patch.yml` + `package.json#dsh.bundle.patch`，单独装任一成员也成立。

该文件由 `node tools/build-meta-patches.mjs` 从 `tools/tiers.json` 生成，**不要手改**。

## 成员清单的事实源

`tools/tiers.json`（层 → 有序成员 + `defaultDisabled`）。加/减成员改那里，再重跑生成器。

## 内核版本

官方客户端强制更新策略下内核会自行前进，所以各成员的 `@deepseek-ai/dsh*` peer 范围
统一放宽到 `>=0.1.0-rc.6 <2`。范围判不过时客户端会提示「可能导致崩溃或数据丢失」并
要求手动 `--accept-risk`——这是刻意的，不要为了让提示消失而写死精确版本。
