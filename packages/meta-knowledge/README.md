# @dsh-pack/knowledge —— 知识库层

装一个包 = 装一整层。本元包含 **2** 个插件：

| 包 | 用途 | 装上后的状态 |
| --- | --- | --- |
| `@dsh-pack/dsh-cardian` | 知识中心：RepoWiki / 知识卡片 / 记忆三区知识库 | 默认关闭（装上但不挂载，设置页自行打开） |
| `@dsh-pack/graph-memory` | 跨会话知识图谱记忆：PageRank / 社区检测 / 向量召回 | 默认关闭（装上但不挂载，设置页自行打开） |

> 2 个知识类插件：Cardian 知识中心（RepoWiki / 知识卡片 / 记忆，落地到本地 Obsidian 仓库）与 Graph Memory（跨会话知识图谱 + PageRank / 社区检测 / 向量召回）。两者默认 disabled，装上后在设置页自行打开。

## 怎么装

官方客户端里两条通道（`dsh plugin` 命令行对 `desktop` profile 是硬拒的，见
docs/spike-official-client.md §0.1）：

1. **设置 → 插件**，按 npm 包名安装：`@dsh-pack/knowledge`；
2. 会话里让 agent 用 `install_bundle` 工具装同一个包名。

## 为什么元包要自带 cordis.patch.yml

实测（同一份 spike 记录 §0.3）：元包的传递依赖**不会**成为 bundle——装得上、跑得起、
一个插件都不挂，而且用户侧没有任何报错。所以本层的挂载行由
`meta-knowledge/cordis.patch.yml` 这一层插入，成员包同时保有自己的
`cordis.patch.yml` + `package.json#dsh.bundle.patch`，单独装任一成员也成立。

该文件由 `node tools/build-meta-patches.mjs` 从 `tools/tiers.json` 生成，**不要手改**。

## 成员清单的事实源

`tools/tiers.json`（层 → 有序成员 + `defaultDisabled`）。加/减成员改那里，再重跑生成器。

## 内核版本

官方客户端强制更新策略下内核会自行前进，所以各成员的 `@deepseek-ai/dsh*` peer 范围
统一放宽到 `>=0.1.0-rc.6 <2`。范围判不过时客户端会提示「可能导致崩溃或数据丢失」并
要求手动 `--accept-risk`——这是刻意的，不要为了让提示消失而写死精确版本。

### 装完还要两次点击：pnpm 11 的 ignored-builds 提示（knowledge 层专属）

`graph-memory` 依赖 `@photostructure/sqlite`，它的 `install` 脚本是 `node-gyp-build`，
pnpm 11 默认不放行构建脚本，于是首次安装会停在：

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @photostructure/sqlite@1.2.1
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

**这不是装失败，也不是要装 MSVC。** 实测（spike §0.2）1.2.1 的六个平台预编译都在包内
（`prebuilds/win32-x64/…glibc.node` 等），`node-gyp-build` 运行期按平台目录取二进制，
install 脚本跑不跑都不影响加载。要消掉提示并让它照常工作：

1. 在官方客户端的 **设置 → 插件** 里，安装报错处点 **「Allow these scripts and retry」**
   （允许这些脚本并重试）——第一次点击；
2. 重试完成后回到 **设置 → 插件**，确认 `graph-memory` 与 `dsh-cardian` 都在列表里，
   把它们的开关打开一次——第二次点击。

> 两个已知待办（不在本阶段，别顺手改）：
> · `graph-memory/package.json` 里该依赖仍写 `^1.0.0`，spike §0.2 的结论是**锁精确版本
>   （1.2.1）**——浮动的 1.x 可能挑中一个不带 win32 预编译的版本；
> · 发版 CI 应断言 `pendingBuilds` 里点名的就是这个包，这样上游换依赖时上面那段说明会红，
>   提醒同步改这里。
