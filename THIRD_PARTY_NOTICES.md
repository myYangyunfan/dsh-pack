# 第三方组件与许可（Third-party Notices）

本清单描述 **DSH Pack 实际会发布出去的东西**：`packages/` 下的 42 个 npm 包。

它由 `node tools/codemod/scan-licenses.mjs` 从磁盘实扫生成，不手抄。
**别再从旧自制壳的依赖树生成**——旧那份 `THIRD_PARTY_NOTICES.md` 建自 772 包的开发机
`node_modules`，里面还列着 `electron@43.4.0`、`electron-builder`、`koffi@3.1.5`，
而这三样在本仓库已经**一个都不发布**了（自制壳与内核补丁机器已整体删除）。

> 自制壳时代随包分发的 Electron / Chromium / Node 运行时 / 内置 npm / LibreOffice-kit /
> sherpa-onnx / koffi 等原生二进制，**都不再属于本仓库的发布物**。
> 需要查那段历史的许可，看 git 历史里的旧版本本文件。

## 包级许可一览

| 包 | 版本 | license | LICENSE 文件 | 署名 / 上游 | 自带 vendored |
| --- | --- | --- | :---: | --- | ---: |
| `@dsh-pack/core` | 0.1.0 | MIT | ✓ | DSH Pack 分层元包 | - |
| `@dsh-pack/plus` | 0.1.0 | MIT | ✓ | DSH Pack 分层元包 | - |
| `@dsh-pack/knowledge` | 0.1.0 | MIT | ✓ | DSH Pack 分层元包 | - |
| `@dsh-pack/pocket` | 0.1.0 | MIT | ✓ | DSH Pack 分层元包 | - |
| `@dsh-pack/bridge` | 0.1.0 | MIT | ✓ | DSH Pack 分层元包 | - |
| `@dsh-pack/compaction` | 0.1.0 | MIT | ✓ | DSH Pack 分层元包 | - |
| `@dsh-pack/host-capabilities` | 0.1.0 | MIT | ✓ | DSH Desktop contributors | - |
| `@dsh-pack/dsh-balance` | 0.1.1 | MIT | ✓ | DSH Desktop contributors | - |
| `@dsh-pack/dsh-file-changes` | 0.1.0 | MIT | ✓ | DSH Desktop contributors | - |
| `@dsh-pack/dsh-client-file-changes` | 0.1.0 | MIT | ✓ | DSH Desktop contributors | - |
| `@dsh-pack/dsh-input-fold` | 0.1.0 | MIT | ✓ | DSH Desktop contributors | - |
| `@dsh-pack/dsh-input-history` | 0.1.0 | MIT | ✓ | DSH Desktop contributors | - |
| `@dsh-pack/dsh-auto-compact` | 0.1.0 | MIT | ✓ | DSH Desktop contributors | - |
| `@dsh-pack/dsh-change-review` | 0.1.0 | MIT | ✓ | DSH Desktop contributors | - |
| `@dsh-pack/dsh-settings-groups` | 0.1.0 | MIT | ✓ | DSH Desktop contributors | - |
| `@dsh-pack/dsh-conversation-tweaks` | 0.1.0 | MIT | ✓ | DSH Desktop contributors | - |
| `@dsh-pack/dsh-quest-ui` | 0.6.0 | MIT | ✓ | DSH Desktop contributors | - |
| `@dsh-pack/dsh-subagent-lens` | 0.1.0 | MIT | ✓ | DSH Desktop contributors | - |
| `@dsh-pack/dsh-workspace-anchor` | 0.1.0 | MIT | ✓ | DSH Desktop contributors | - |
| `@dsh-pack/dsh-prompt-custom` | 0.1.1 | MIT | ✓ | DSH Desktop contributors | - |
| `@dsh-pack/dsh-image-paste` | 0.1.0 | MIT | ✓ | DSH Desktop contributors | - |
| `@dsh-pack/dsh-settings-nav-custom` | 0.1.0 | MIT | ✓ | Deepseek Harness EAC contributors | - |
| `@dsh-pack/dsh-file-drop` | 0.3.0 | MIT | ✓ | Deepseek Harness EAC contributors | - |
| `@dsh-pack/dsh-basics-panel` | 0.1.0 | MIT | ✓ | 又菜又爱玩的小猪 | - |
| `@dsh-pack/dsh-terminal-tab` | 0.1.0 | MIT | ✓ | DSH Desktop contributors | - |
| `@dsh-pack/dsh-offpeak` | 1.0.0 | MIT | ✓ | christophersmith2737-commits | - |
| `@dsh-pack/dsh-easyrewrite` | 2.5.2 | MIT | ✓ | Renzic-Stone | - |
| `@dsh-pack/dsh-prompt-optimizer` | 2.0.3 | MIT | ✓ | winditer | - |
| `@dsh-pack/dsh-synapse` | 0.3.0 | MIT | ✓ | （LICENSE 有版权行，见文件） | - |
| `@dsh-pack/dsh-reasoning-effort` | 0.7.0 | MIT | ✓ | DSH Desktop contributors | - |
| `@dsh-pack/dsh-zcode-migrate` | 0.1.1 | MIT | ✓ | dsh-zcode-migrate contributors | - |
| `@dsh-pack/dsh-cardian` | 0.14.0 | MIT | ✓ | cardian contributors | - |
| `@dsh-pack/dsh-community-market` | 0.1.1 | MIT | ✓ | Anywhere Labs | - |
| `@dsh-pack/dsh-better-sidebar` | 0.15.3 | MIT | ✓ | dsh-external（上游 omdsh-dev/DSH-better-sidebar） | 59 |
| `@dsh-pack/graph-memory` | 1.6.0-beta.1 | MIT | ✓ | adoresever（上游 adoresever/graph-memory） | 4 |
| `@dsh-pack/harness-pet` | 0.2.0 | MIT | ✓ | cakeni（上游 cakeni/harness-pet） | - |
| `@dsh-pack/billion-context-dsh` | 0.2.1 | MIT | ✓ | billion-context-dsh contributors | 1 |
| `@dsh-pack/dsh-openclaw-bridge` | 0.8.0 | MIT | ✓ | openclaw-dsh-bridge contributors | - |
| `@dsh-pack/dsh-vision` | 0.3.0 | BSD-3-Clause | ✓ | dsh-external | - |
| `@dsh-pack/dsh-pocket` | 2.10.6 | **GPL-2.0** | ✓ | Free Software Foundation, Inc.（标准 GPL 文本） | 26 |
| ~~`@dsh-pack/dsh-side-session`~~ **已移出发布面** | 0.3.1 | 声明 MIT，但上游无 LICENSE | — | hzhz314159/dsh-side-session（存在） | 见 `not-shipped/` |
| ~~`@dsh-pack/dsh-super-injector`~~ **已移出发布面** | 0.3.1 | **BSD-3-Clause**，无上游原文可引 | — | 上游仓库 404，不可核实 | 见 `not-shipped/` |

## ⚠ 已从发布面移除的两个包（不是「待补 LICENSE」，是不可再分发）

调查过程与完整证据见 [`not-shipped/README.md`](not-shipped/README.md)。摘要：

| 包 | 查证结果 | 为什么不发 |
| --- | --- | --- |
| `dsh-super-injector` | npm 无此包；社区目录给的仓库 `github.com/dsh-external/dsh-super-injector` 返回 **404**；无 author；而且我们**改过它的源码** | manifest 写 BSD-3-Clause 却没有任何上游原文可引。由我们补一份 BSD-3 再填个署名，等于**伪造许可来源** |
| `dsh-side-session` | 上游 `github.com/hzhz314159/dsh-side-session` **真实存在**（描述与内置插件逐字吻合），但**没有 LICENSE 文件**；npm 无此包 | 无许可证 = 保留所有权利。我们此前给它标 `license: "MIT"` 本身就是不实标注，无权以 MIT 再分发 |

两者已从 `tools/tiers.json` 摘除（`plus` 11 → 9，分层成员合计 32），源码移到 `not-shipped/`
留在仓库作对照，但**不进 `packages/`** —— 这样审计与打包门禁的绿灯只覆盖我们真能发的东西。

需要 `dsh-side-session` 的用户，可在「设置 → 插件 → GitHub 仓库地址」填上游地址直接装：
那是他与原作者之间的授权关系，不需要我们冒名再分发。

## 其余许可事项

1. **`dsh-vision` 是 BSD-3-Clause**（有 LICENSE 文件）。发布前核对其署名行与上游一致。
2. **`dsh-pocket` 为 GPL-2.0**，按上游原样依赖、不 fork。
3. **`graph-memory` 的 `license: "MIT"` 已核对准确**：磁盘 LICENSE 是
   `MIT License, Copyright (c) 2026 adoresever (Wywelljob@gmail.com)`。
4. `docs/attributions.md` 记的 `v4-flash-godmode-opencode-go` 上游无 LICENSE 一条已不再是发布物
   —— 9 个 agent-presets 随自制壳一并删除。

## GPL-2.0 组件的处理方式

`dsh-pocket` 是包里唯一的 copyleft 组件（GPL-2.0）。我们的做法是**按上游原样依赖，不 fork**：

- 仅依赖 = 聚合（aggregation），不触发 GPL 的派生作品条款；
- 一旦 fork 并修改，`@dsh-pack/pocket` 整体变 GPL-2.0，并附带**源码提供义务**；
- 需要改变它的行为时，走分层补丁行里的 `config:`，或向上游提 PR 要一个开关
  （已知需要的是把「是否受监督宿主」变成可配置，见 `docs/spike-official-client.md`）。

## 自带 vendored 依赖的包

4 个包在目录里携带自己的 `node_modules`：`dsh-better-sidebar`(59)、`dsh-pocket`(26)、
`graph-memory`(4)、`billion-context-dsh`(1)。

这些**不会进发布 tarball**：每个包的 `package.json#files` 白名单只列产物目录
（`lib` / `dist` / `client` / `core` / `assets` 等），不含 `node_modules`；
运行期依赖由 pnpm 从 registry 安装。`tools/itest` 的 J2 用 `npm pack` 打真 tarball
并断言产物里不出现 `node_modules`，就是钉住这件事——路径安装会掩盖 `files` 写错，
tarball 安装不会。

其中两个含**原生二进制**，许可与来源需一并留意：

- `graph-memory` 依赖 `@photostructure/sqlite`（含六平台 `prebuilds/*.node`，其 install 脚本是
  `node-gyp-build`）；
- `dsh-community-market` 可选依赖 `sharp`（经 `@img/sharp-*` 预编译包提供，无 install 脚本）。

## 重新生成本清单

```bash
node tools/codemod/scan-licenses.mjs            # 人读摘要 + 缺口清单
node tools/codemod/scan-licenses.mjs --markdown # 上面那张表，可直接粘贴
```

若需要完整传递依赖清单（含各第三方 npm 包），在装好依赖后跑
`npx license-checker --summary`；但注意那只反映**开发机**的树，
不代表发布物——发布物由每个包的 `files` 决定。
