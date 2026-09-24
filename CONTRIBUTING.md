# 贡献指南

本仓库是 **DSH Pack** —— 装进官方 DeepSeek Harness 客户端的插件整合包。
交付物只有 npm 包：**不再有桌面壳、安装器、托盘、自动更新链**，也**不再修改上游内核**。

动手前请先读 [`AGENTS.md`](AGENTS.md)（约定与边界）与
[`docs/spike-official-client.md`](docs/spike-official-client.md)（对真装官方客户端的实测记录）。

## 开发环境

```bash
pnpm install
node tools/audit/index.js              # 静态门禁
node --test "packages/*/test/*.test.js"
```

前置只有一个：Node ≥ 24、pnpm 11。
**不需要** Rust / cargo / Visual Studio / Electron / NSIS / LibreOffice —— 这些随自制壳一起退场了。

跑集成用例（`tools/itest/`）还需要一份**从 npm 装的干净官方内核**：

```bash
npm i --no-audit --no-fund --ignore-scripts --prefix /tmp/kernel @deepseek-ai/dsh@0.1.7-rc.1
DSH_KERNEL_BIN=/tmp/kernel/node_modules/@deepseek-ai/dsh/lib/bin.js \
  node tools/itest/boot-desktop-profile.mjs --job=j1
```

国内网络取不到 npm 官方源时，改 `.npmrc` 里的 registry 走 npmmirror，
**不要**在脚本里硬编码 registry。

## 目录与分层

| 位置 | 放什么 |
| --- | --- |
| `packages/<目录名>/` | 一个插件包。npm 名必须是 `@dsh-pack/<目录名>`，**目录名与包名尾段严格一致** |
| `packages/meta-<分层>/` | 分层元包。它的 `cordis.patch.yml` 是**生成物**，禁止手改 |
| `packages/host-capabilities/` | 宿主能力探针，构建期内联库，不是 bundle |
| `tools/tiers.json` | 分层 → 成员清单，唯一事实源 |
| `tools/build-meta-patches.mjs` | 生成各元包补丁层（幂等，重跑必须逐字节一致） |
| `tools/audit/` | 6 项离线静态门禁 |
| `tools/itest/` | 真装真组合的集成校验（J1 组合 / J2 tarball / J3 构建脚本放行） |

当前分层：`core`(18)、`plus`(11)、`knowledge`(2)、`pocket`、`bridge`、`compaction`。
分层是**加性**的、彼此不重叠，也**不做嵌套**（实测嵌套/传递依赖不会成为 bundle，会静默不挂载）。

## 加一个插件的完整清单

不是复制粘贴旧插件的目录就完事，每一条都有对应的门禁在拦：

1. 目录放 `packages/<名字>/`，`package.json` 的 `name` = `@dsh-pack/<名字>`。
2. 写 `cordis.patch.yml`：顶层 YAML **数组**，一个 `insert` 块，一行 `{id, name}`。
   **`id` 一旦发布就永不修改**（补丁按 id 整行替换、不做字段合并；改 id 会让用户
   写在家层的 `disabled` 覆盖变孤儿）。历史疤见 issue #104。
3. `package.json` 声明 `dsh.bundle.patch: "./cordis.patch.yml"`。
   **没有这一条的包，装进去是一个插件都不会挂，而且不报错。**
4. `id` 不得与 `tools/audit/kernel-entry-ids.json`（官方内核 199 个 id）撞名。
   撞上的后果是静默顶替内核那一条——`plugin-manager` 曾这样砖掉过官方插件管理器。
5. 内核包（`@deepseek-ai/dsh*`、`@deepseek-ai/cordis` 等）**只能放 `peerDependencies`**。
   放进 `dependencies` 会在用户 profile 里装出第二份物理拷贝 →
   `multiple active Loader sources` → **官方客户端拒绝启动**。
6. `peerDependencies` 里 `@deepseek-ai/dsh*` 的区间统一 `>=0.1.0-rc.6 <2`。
7. 声明了 `dsh.client` 就必须有**可解析到的** `exports["./client"]`，
   且 `dsh.client.platform` 保持 `"web"`（别改成 `"desktop"`，改了会静默坏）。
8. `dsh.client.inject` / `external` 里的每个包名都要在
   `tools/audit/kernel-packages.json` 里真实存在。引用不存在的包**不响亮失败**，
   只表现为页内半边静默消失。
9. 写 `files` 白名单（否则 npm 会把 `src/`、`test/`、`node_modules`、
   带 `sourcesContent` 的 `.map` 全部打进去）。**不能是 `private: true`。**
10. 有 `license` 字段；第三方出处要落进 `THIRD_PARTY_NOTICES.md` 与 `docs/attributions.md`。
11. 加进 `tools/tiers.json` 的某一层，跑 `node tools/build-meta-patches.mjs` 重新生成元包补丁层。
12. 写 `packages/<名字>/test/*.test.js`，`node --test` 过。

做完跑 `node tools/audit/index.js`，它会把这 12 条里能机器检查的全部拦一遍。

## 测试要求

- **功能新增 / bug 修复必须带测试。** 纯函数进 `packages/<包>/test/`，用 `node --test`。
  bug 回归用例头部注明 issue 号。
- **新守卫必须配反证。** 只测「正常输入给正确答案」不算测过——要把判据一项项拆掉，
  看结论是否随之改变；否则说明判据根本没起作用。
  （这条是真付出过代价的：`host-capabilities` 第一版把「`updates` 是函数」当判据写错了，
  正是因为先有了「协议不匹配就不能判官方」这类反证用例，才当场暴露。）
- **断言不许假绿。** 「0 个包全部通过」不是通过。批量检查必须先断言样本量非零，
  上游步骤失败时要短路掉下游断言。`tools/itest/` 里就是这么做的。
- **测试必须隔离。** 一律把 `DSH_HOME` 指到 `mkdtemp` 的临时目录，
  **绝不触碰真实 `~/.dsh`**，也不写 `%APPDATA%`。`tools/itest/boot-desktop-profile.mjs`
  开头就有「检测到真实 `~/.dsh` 或仓库外路径就拒绝执行」的断言，别绕过它。
  这条是踩过才写下的：`packages/dsh-openclaw-bridge` 那份协议测试裸跑时，
  就往真实 `~/.dsh/openclaw-bridge/` 写过 `session-map.json`、`workspace/` 与日志。
- **跑不了的测试要显式排除，不要伪装成通过。** 把文件挪进该包的 `test/disabled/`
  （不会被 `packages/*/test/*.test.*` 收到），并在文件顶部写清为什么不跑、实测证据、恢复步骤。
  反例：留在 `test/` 里 `console.log('SKIP')` + `process.exit(0)`，报告会计成「1 pass」——
  那是假绿，比根本没有这个文件更糟。

## 没有的工具链

本仓库**没有** eslint / typescript / tsconfig / prettier，也没有任何 lint 脚本。
语法门禁只有 `tools/audit/syntax.js`（管 `node --check` 抓不到的模式扫描）加测试。
**不要凭空发明工具链**，也不要在 PR 里顺手格式化无关文件。

## 提交与 PR

- commit：`<type>: <简述>（#issue号）`，type ∈ `feat/fix/refactor/perf/docs/test/chore/build`。
- 分支：`feature/` `fix/` `refactor/` `docs/`。
- 一次提交只做一件事；维护者 squash merge。
- 中文 commit message 与中文注释（标识符、包名、错误串保持原文）。
- 改动行为要带一条 changeset（`pnpm changeset`），否则不会进版本变更集。

## 稳定性三原则（评审默认立场）

1. **客户端必须能打开**——在插件包形态下这条更硬：一个写坏的包能让**整个官方客户端**
   拒绝启动，而用户一旦按下恢复对话框，`sanitizeProfile` 会把我们的包**整体抹掉**。
2. **兼容性不报错**，意外以日志收场，不以崩溃收场。
3. **用户数据不动。**

## 我们做不到的事（别在 PR 里试图复活）

托盘 / 关窗常驻 / 一键重启、**系统级**会话完成通知、宠物原生悬浮窗、
WSL 后端、自定义应用图标。这些是原生窗口管理能力，插件进程内无法复现，
且已明确决定**不留任何原生伴侣进程**。
余额取数、剪贴板图片落盘、文件一键还原这几件**已经**搬进插件宿主半边，照常可用。
