# Changelog

All notable changes to Harness Pet are documented here.

## 0.2.1

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

## [0.1.0] - 2026-08-14

- Added a close control for the conversation card, a **Show Dialog** recovery action in settings, and per-session dismissal behavior.
- Made the settings panel independently draggable by its title bar, with viewport clamping and small-window scrolling.
- Added a persisted interface language selector with English as the default plus Simplified Chinese, Japanese, and Korean translations.
- Prevented the settings panel from jumping while the pet-size slider changes, and clarified the independent floating-pet action for minimized Harness windows.
- Made long streamed replies follow their latest output in the dialog, and added the official `chat.legacy` signal mirror as a compatibility fallback.
- Renamed the user-facing brand to Harness Pet and replaced the old 4×4 artwork with a transparent 6×9 atlas containing six dedicated frames for each of the nine states.
- Rebuilt the animation with the open-source `hatch-pet` fixed-cell pipeline: 8×9 atlas, deterministic frame extraction, left/right drag rows, motion previews, and zero-error transparency/geometry validation.
- Enriched semantic state motion with a connected water-spout success loop, a flipper-held magnifier search loop, and a red-hot fault/error loop while retaining fixed-cell QA guarantees.
- Added the native DSH client bundle and profile patch, structured nine-state detection, local-only settings, reduced-motion support, and complete lifecycle cleanup.
- Added unit tests, GitHub Actions CI, bilingual documentation, privacy and compatibility notes, and an optional Chromium Document Picture-in-Picture pet window.
