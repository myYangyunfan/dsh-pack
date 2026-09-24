# @dsh-pack/pocket —— 手机同屏层

装一个包 = 装一整层。本元包含 **1** 个插件：

| 包 | 用途 | 装上后的状态 |
| --- | --- | --- |
| `@dsh-pack/dsh-pocket` | 手机扫码实时同屏操控桌面 web（WebSocket 透传 + cloudflared 隧道 + 二维码配对） | 默认启用 |

> DSH Pocket：手机扫码实时同屏操控桌面端，局域网 + 公网（内置 cloudflared 穿透与二维码配对）。随包带 node_modules 与二进制下载逻辑，体积明显大于核心层，故单列一层。

## 怎么装

官方客户端里两条通道（`dsh plugin` 命令行对 `desktop` profile 是硬拒的，见
docs/spike-official-client.md §0.1）：

1. **设置 → 插件**，按 npm 包名安装：`@dsh-pack/pocket`；
2. 会话里让 agent 用 `install_bundle` 工具装同一个包名。

## 为什么元包要自带 cordis.patch.yml

实测（同一份 spike 记录 §0.3）：元包的传递依赖**不会**成为 bundle——装得上、跑得起、
一个插件都不挂，而且用户侧没有任何报错。所以本层的挂载行由
`meta-pocket/cordis.patch.yml` 这一层插入，成员包同时保有自己的
`cordis.patch.yml` + `package.json#dsh.bundle.patch`，单独装任一成员也成立。

该文件由 `node tools/build-meta-patches.mjs` 从 `tools/tiers.json` 生成，**不要手改**。

## 成员清单的事实源

`tools/tiers.json`（层 → 有序成员 + `defaultDisabled`）。加/减成员改那里，再重跑生成器。

## 内核版本

官方客户端强制更新策略下内核会自行前进，所以各成员的 `@deepseek-ai/dsh*` peer 范围
统一放宽到 `>=0.1.0-rc.6 <2`。范围判不过时客户端会提示「可能导致崩溃或数据丢失」并
要求手动 `--accept-risk`——这是刻意的，不要为了让提示消失而写死精确版本。
