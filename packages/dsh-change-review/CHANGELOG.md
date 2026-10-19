# dsh-change-review

## 0.1.2

### Patch Changes

- **同型缺陷同批修：自动模式不再覆盖用户正在写的草稿（与 dsh-auto-compact 0.1.2 一条根）。**

  `fireReview` 也是 `setDraft(prompt) + submit()`，而审核提示是一大段生成文本——
  自动模式在「变更停止 20 秒」后触发，那一刻用户完全可能正在输入框里写下一轮的要求，
  整篇草稿会被审核请求顶掉且不可恢复（`setDraft` 是整篇替换并立刻持久化）。

  现在 `fireReview` 先读 occupant 每帧镜像的 `cap.gate`（同一份 `composerGate` 判据：
  草稿为空且无附件、输入形态 `plain`、会话不 `running` 且无 `pendingSubmissions` 才 `ready`），
  非 `ready` 一律不提交、**保留 `pendingChanges`**；返回值由布尔改成状态串
  `fired / blocked / none`（旧代码用真值判断，字符串会变恒真——两处调用点同批改），
  自动重试链只在 `blocked` 时按 45s 退避、最多 8 次，手动按钮则把被挡的原因说出来
  （新增 `nowBlocked` / `nowUnknown` 中英文案），`note` 与真判据对齐。

- 回归锁：与 `unit-auto-compact-gate.test.js` 同套件的 change-review 半边
  （闸门同源判据 + `blocked` 不吞待审内容 + 状态串不被真值判断误当成成功）。

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

