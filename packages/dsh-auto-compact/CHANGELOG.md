# dsh-auto-compact

## 0.1.2

### Patch Changes

- **修「右下角弹出自动压缩提示，把我写了一半的草稿清掉了」（2026-10-18 用户报障）。**

  根因不在提示，在提交：`fireCompact` 此前无条件
  `inputActions.setDraft("/compact")`，而内核这条 API 的契约是**整篇替换**
  （`dsh-client-ui-conversation/lib/client.js:15023` "Replace the whole draft (persisted-draft
  seed and programmatic writes)"），且 `publish()` 会把它**立刻写进该会话的持久化草稿**
  （`:15708-15716` + `:17965` 的 `bindDraftPersistence`），成功提交后 `commit-draft` 还会
  砍掉 undo 栈（`contract/input.d.ts:380-388`）——所以用户半篇引导词不是「被遮挡」，
  是不可恢复地被覆盖。触发那条 effect 原先只有 `enabled / 阈值 / 冷却` 三道判据，
  既没判草稿非空、也没判这一轮是否还在跑，而 `/compact` 本身要求 agent 空闲，
  于是忙时还会「草稿已丢、压缩又被拒」双重坏。

  现在加一道纯函数闸门 `composerGate(input, session)`，判据照内核 InputBar 的同源口径
  （`:18803-18806`：`draft.trim() === "" && attachments.length === 0`；
  `machineBusy = phase === "adjudicating" || "submitting"`）与
  `useSession(s => s.running / s.pendingSubmissions)`：
  草稿有内容或有附件 → `has-content`；形态非 plain 或轮次在跑 → `busy`；
  `useInput` / `useSession` 读不到或形状不认识 → `unknown`。
  **只有 `ready` 才提交**，且跳过时不记冷却、不打扰，等输入框空了由下一次投影更新补做。
  设置页的「立即压缩」走同一道门，被挡时把原因说出来（新增 `nowBlocked` / `nowUnknown` 文案），
  `note` 文案改为与真判据一致（旧文案「仅在对话空闲时进行」在 0.1.1 里是不成立的）。

  快照来源是 dock occupant 的标准注入面（`:19738-19753` 的 `hooks.input = shell.state`），
  不是 `inputActions`——那个对象只有 8 个方法（`captureInsertion / insertText / setDraft /
  persistDraft / addAttachments / removeAttachment / pruneAttachments / submit`），
  没有 `state` / `getDraft` / `draft` / `busy` 任何一项，按那些字段读会恒 undefined、
  把守卫做成静默死的。

- 回归锁：`dsh-desktop/scripts/test/unit-auto-compact-gate.test.js`（闸门 8 条 + occupant 接线
  与「草稿非空绝不 setDraft」的渲染级用例 + 手动按钮被挡的文案 + 反证四条）。

## 0.1.1

### Patch Changes

- 修「装了却不挂载」，并退役阶梯分层元包。

  **22 个插件的页内 bundle 注册名改成包名。** 官方客户端真机一次报 20 条
  `client-modules: could not load "@dsh-pack/x": loaded without registering "@dsh-pack/x"
  via __ModuleLoader__.load`。内核 boot graph 行以**包名**为键
  （`dsh-client-modules/lib/client.js:625`），而 `register()` 的键是
  `stripClientSuffix(registration.id)`（同文件 569），我们的 bundle 却注册裸名
  （`'dsh-input-fold'`）或换代前的 `@dsh-external/…`，那一行永远等不到。失败形态是
  静默不挂载：宿主照常起来、插件没反应，所以补了一条 P0 门禁
  （`tools/audit/publish-readiness.js`）而不只是改一次。

  **`@dsh-pack/core` / `plus` / `knowledge` / `pocket` / `bridge` / `compaction` 退役，
  只留 `@dsh-pack/all`。** 阶梯分层在内核语义下不成立：`applyEntryPatches` 处理 `insert`
  是 `data.push(...insert)`，不按 id 去重（整行替换只作用于覆盖型补丁），所以两个元包同装
  会把共有成员装配两次，第二次注册路由即报 `webserver: duplicate exact route` ——
  真机那批「N entries did not activate」的成因。用内核自己的 `composeEntries` 实测
  core+all = 18 个重复 id。原来装过这些层的用户请改装 `@dsh-pack/all`。

  ⚠ 随之而来的使用约束：**装了 `all` 就不要再单独装其中的某个成员插件**，
  那同样会把那个成员插两次。想要小集合就别装 `all`，按用途分组单装。

