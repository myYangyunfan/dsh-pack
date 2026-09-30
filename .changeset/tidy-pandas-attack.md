---
"@dsh-pack/dsh-better-sidebar": patch
---

修复插件在官方 DeepSeek Harness 桌面客户端 0.2.0-rc.2 下**整体不加载**的问题，并补齐官方右栏（`@deepseek-ai/dsh-client-ui-sidebar-right` 0.2.0-rc.2）的接口对接。

**症状**：右侧边栏展开后的「开始」页里没有「侧边工作台」卡片，标签栏里也没有对应标签；设置页里也没有本插件的那一节——而**启动日志干干净净，一条报错都没有**。

**根因（真机取证，非推测）**：宿主半边在 import 期抛错 → 条目 `fiber=NO-FIBER`；`dsh-client-modules` 的 `processOne()` 见到 `entry.fiber === void 0` 会直接跳过，于是整个包**不进客户端启动图**，页内半边从未执行。

具体三点：

- 包自己的 `node_modules/@deepseek-ai/` 里带着 16 份内核包老拷贝（其中 `@deepseek-ai/schemastery@3.18.1`）。插件是按绝对路径加载的，Node 先看包自己的 `node_modules`，老拷贝因此遮蔽内核的 `3.18.4`；而 `.volatile()` 是本仓 fork 才有的扩展，`lib/index.js` 的 Config schema 用了 25 处，import 期直接抛 `z.boolean(...).volatile is not a function`。
- `intercept.tsx` 在 `ctx.workspaces` 缺席时不再抛错（可选链 + 兜底空 disposer）。
- 内核右栏接驳层按 0.2.0-rc.2 的真实形状重写：`mounted` 现在是 `sessions.onScreen`，新增 `openTabIn` / `tabsIn`，视图挂载与标签变更都走响应式订阅，不再依赖容易在 React 提交时序上落空的 MutationObserver 单点判断；会话 id 解析增加「`retainedBy.mainView > 0` → `ids[0]`」兜底，避免首帧取不到会话导致整块面板不渲染。

**同时**：标签标题统一为「侧边工作台」；`Config` 的 `z` 改为从 `@deepseek-ai/schemastery` 取（本仓 fork）；`tsdown` 的页内 bundle 注册名从 package.json 的 `name` 推导，避免与内核 boot graph 的包名键错位。

**新增门禁**：`tools/audit/kernel-shadow.js`（已接入 `tools/audit/index.js`）专门拦「本地 `@deepseek-ai/*` 拷贝遮蔽内核」这一类静默砖化；`tools/itest/pack-audit.mjs` 修掉两处 Windows 可移植性缺陷（GNU tar 专有的 `--force-local` 与 CRLF 未裁剪），此前该发布门禁在 Windows 上对所有包一律误报、等于从未真正校验过。
