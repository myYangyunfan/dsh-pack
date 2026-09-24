# @dsh-pack/core —— 核心体验层

装一个包 = 装一整层。本元包含 **18** 个插件：

| 包 | 用途 | 装上后的状态 |
| --- | --- | --- |
| `@dsh-pack/dsh-balance` | DeepSeek 账户余额 + 本轮会话费用估算（对话统计栏 dock） | 默认启用 |
| `@dsh-pack/dsh-file-changes` | 会话文件更改投影（fileChanges）：为「文件」视图与回退提供数据 | 默认启用 |
| `@dsh-pack/dsh-client-file-changes` | 「文件」视图：会话文件更改追踪 + 一键还原 | 默认启用 |
| `@dsh-pack/dsh-file-drop` | 选中上传 + 拖入文件到对话，图片走内核官方附件管道 | 默认启用 |
| `@dsh-pack/dsh-image-paste` | 粘贴图片自动落临时目录并把完整路径注入输入框 | 默认启用 |
| `@dsh-pack/dsh-input-fold` | 超长用户提示词默认折叠为前几行，点击展开全文 | 默认启用 |
| `@dsh-pack/dsh-input-history` | 终端式命令历史回溯：↑/↓ 翻阅本会话已发送消息 | 默认启用 |
| `@dsh-pack/dsh-auto-compact` | 接近上下文上限时自动发送 /compact | 默认启用 |
| `@dsh-pack/dsh-change-review` | AI 变更审核：让模型复查自己刚做的改动 | 默认启用 |
| `@dsh-pack/dsh-offpeak` | 峰谷价格卫士：高峰时段发送前拦截提醒，可定时到闲时价执行 | 默认启用 |
| `@dsh-pack/dsh-settings-nav-custom` | 设置页左侧导航显示/隐藏与排序 | 默认启用 |
| `@dsh-pack/dsh-settings-groups` | 设置页低频选项折叠进「高级选项」组 | 默认启用 |
| `@dsh-pack/dsh-conversation-tweaks` | 会话体验微调：隐藏长篇输出 + 右侧导航滑轨 | 默认启用 |
| `@dsh-pack/dsh-quest-ui` | Quest 模式界面（分组会话栏 + 卡片式输入区），默认关闭 | 默认启用 |
| `@dsh-pack/dsh-subagent-lens` | 子代理活动快视：Task/subagent 委派调用的展开式活动视图 | 默认启用 |
| `@dsh-pack/dsh-easyrewrite` | 消息撤回与再编辑（上游 Renzic-Stone/DSH-EasyRewrite） | 默认启用 |
| `@dsh-pack/dsh-workspace-anchor` | 向稳定系统提示注入 {{cwd}} 偏好块，让 agent 默认落在会话工作区 | 默认启用 |
| `@dsh-pack/dsh-prompt-custom` | 在设置页自定义官方内核注入的提示词 | 默认启用 |

> 18 个轻量纯客户端/宿主插件：余额与费用、文件变更追踪与还原、拖入/粘贴、输入历史与折叠、自动压缩、变更审核、峰谷价提醒、设置页整理、Quest 界面、子代理快视、消息撤回、工作区锚定、系统提示词自定义。装完即用，无额外二进制、无网络副作用。

## 怎么装

官方客户端里两条通道（`dsh plugin` 命令行对 `desktop` profile 是硬拒的，见
docs/spike-official-client.md §0.1）：

1. **设置 → 插件**，按 npm 包名安装：`@dsh-pack/core`；
2. 会话里让 agent 用 `install_bundle` 工具装同一个包名。

## 为什么元包要自带 cordis.patch.yml

实测（同一份 spike 记录 §0.3）：元包的传递依赖**不会**成为 bundle——装得上、跑得起、
一个插件都不挂，而且用户侧没有任何报错。所以本层的挂载行由
`meta-core/cordis.patch.yml` 这一层插入，成员包同时保有自己的
`cordis.patch.yml` + `package.json#dsh.bundle.patch`，单独装任一成员也成立。

该文件由 `node tools/build-meta-patches.mjs` 从 `tools/tiers.json` 生成，**不要手改**。

## 成员清单的事实源

`tools/tiers.json`（层 → 有序成员 + `defaultDisabled`）。加/减成员改那里，再重跑生成器。

## 内核版本

官方客户端强制更新策略下内核会自行前进，所以各成员的 `@deepseek-ai/dsh*` peer 范围
统一放宽到 `>=0.1.0-rc.6 <2`。范围判不过时客户端会提示「可能导致崩溃或数据丢失」并
要求手动 `--accept-risk`——这是刻意的，不要为了让提示消失而写死精确版本。
