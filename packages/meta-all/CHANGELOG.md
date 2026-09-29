# @dsh-pack/all

## 0.2.0

### Minor Changes

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


### Patch Changes

- Updated dependencies

  - @dsh-pack/dsh-balance@0.1.2
  - @dsh-pack/dsh-file-drop@0.3.1
  - @dsh-pack/dsh-image-paste@0.1.1
  - @dsh-pack/dsh-input-fold@0.1.1
  - @dsh-pack/dsh-input-history@0.1.1
  - @dsh-pack/dsh-auto-compact@0.1.1
  - @dsh-pack/dsh-change-review@0.1.1
  - @dsh-pack/dsh-offpeak@1.0.1
  - @dsh-pack/dsh-settings-nav-custom@0.1.1
  - @dsh-pack/dsh-settings-groups@0.1.1
  - @dsh-pack/dsh-conversation-tweaks@0.1.1
  - @dsh-pack/dsh-quest-ui@0.6.1
  - @dsh-pack/dsh-subagent-lens@0.1.1
  - @dsh-pack/dsh-easyrewrite@2.5.3
  - @dsh-pack/dsh-prompt-custom@0.1.2
  - @dsh-pack/dsh-better-sidebar@0.15.4
  - @dsh-pack/dsh-basics-panel@0.1.1
  - @dsh-pack/dsh-reasoning-effort@0.7.1
  - @dsh-pack/dsh-vision@0.3.1
  - @dsh-pack/dsh-synapse@0.3.1
  - @dsh-pack/dsh-prompt-optimizer@2.0.4
  - @dsh-pack/dsh-zcode-migrate@0.1.2
  - @dsh-pack/dsh-community-market@0.1.2
  - @dsh-pack/harness-pet@0.2.1
  - @dsh-pack/dsh-cardian@0.14.1
  - @dsh-pack/graph-memory@1.6.0
  - @dsh-pack/dsh-pocket@2.10.7
  - @dsh-pack/dsh-openclaw-bridge@0.8.1
  - @dsh-pack/billion-context-dsh@0.2.2
