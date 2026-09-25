# 发版手册 — DSH Pack

本仓库**只发 npm 包**。没有 exe、没有安装器、没有签名、没有四架构产物。
旧那套「推 `v*` tag → `tauri-release.yml` 出 NSIS」的入口已经随自制壳一起退役并删除。

## 唯一发版路径

1. 改完代码，带一条 changeset：

   ```bash
   pnpm changeset            # 选受影响的包 + semver bump + 中文摘要
   ```

2. PR 合并到 `main` → `release.yml` 的 `version` job 自动做两件事：
   - 跑 `node tools/audit/index.js` 作为**发布门禁**（任一条红就不出版本）；
   - `changesets/action` 生成/更新「版本变更集 PR」。维护者合并那个 PR 才真正触发 publish。

3. publish 执行 `pnpm -r publish --access public --tag latest`。
   令牌来自 `secrets.NPM_TOKEN`，**不写进任何签入文件**。

版本号只有一个来源（changesets 的那次 version 提交）。
旧那套「`dsh-desktop/package.json` + `Cargo.toml` + `tauri.conf.json` 三处同步、
漏改一处发版直接 fail-fast」的问题结构上不存在了。

## 发版前必须绿的四件事

| 检查 | 命令 | 为什么是发布门禁而不只是 CI |
| --- | --- | --- |
| 静态审计 | `node tools/audit/index.js` | 6 项里 `publish-readiness` 是 **P0**：一个包写错就能让**整个官方客户端拒绝启动** |
| 发布物内容 | `node tools/itest/pack-audit.mjs` | `npm pack` 真实产物：查 `files` 白名单有没有把 `node_modules`/`.map`（内嵌上游 TS 源码）/测试目录打进去，以及 bundle 的 `cordis.patch.yml` 有没有随包发布 —— 漏了就是「装得上、一个都不挂」 |
| 单测 | `node --test "packages/*/test/*.test.js"` | — |
| J1 组合 | `node tools/itest/boot-desktop-profile.mjs --job=j1` | 验证补丁层真挂得上、id 恰好出现一次、二次安装字节幂等 |
| J2 tarball | `... --job=j2` | **只有 tarball 安装会暴露 `files` 白名单错误与 `private:true`**；路径安装会把这两类都掩盖掉 |

> `pack-audit` 目前因 `dsh-side-session`、`dsh-super-injector` 缺 LICENSE 而红。
> 这是**真实的发布阻塞**（BSD-3 要上游原文与署名人；`@dsh-external` 包的作者未核实），
> 不要靠加白名单让它变绿：要么补齐出处，要么明确不发布这两个包并从 `tools/tiers.json` 摘掉。

（`--job=j3` 单独跑，用来钉住 pnpm 构建脚本放行的文案与恢复路径，防止 `docs/recovery.md` 腐烂。）

## 预发布通道

`release.yml` 里 `prerelease` job 手动触发（`workflow_dispatch`），以 `--tag beta` 发布。

为什么需要它：官方客户端有**强制更新策略**，内核版本会在我们不参与的情况下前进。
需要一条能让真实用户先验证「新内核下还挂不挂得上」的通道，而不是等正式版撞车。

## 内核漂移

`kernel-drift.yml` 每夜取 `@deepseek-ai/dsh@latest`，重新生成包名 / loader id 快照并比对，
有 diff 就**自动开 issue**。

这是我们主动选择宽 peer 区间（`>=0.1.0-rc.6 <2`）的代价：区间宽，用户就不会在官方升级后
立刻看到「may cause crashes or data loss」+ 手动 `--accept-risk`；但代价是必须有人盯着漂移。
这个 workflow 就是那只眼睛。

**收到漂移 issue 要做的事**：
1. 看新增的 loader id 有没有和我们某一行撞名——撞了就是 P0，补丁按 id 整行替换，
   我们的行会静默顶替内核那一条（历史上 `plugin-manager` 真发生过）；
2. 看消失/改名的内核包有没有被某个插件的 `dsh.client.inject` / `external` 引用——
   引用不存在的包**不会响亮失败**，只表现为某个插件的页内半边静默消失；
3. 决定要不要把 `tools/audit/kernel-*.json` 与 `dsh-runtime.json` 刷新到新内核。

## 发布前的人工验收（在真装的官方客户端上）

CI 覆盖不到的必须手点一遍，逐条对照：

- [ ] 在官方客户端「设置 → 插件」按包名装 `@dsh-pack/all` 成功
- [ ] 重启应用后插件真的出现了（**注意：只刷新页面不会有**，注入清单是启动期快照）
- [ ] 插件列表里能看到我们这个元包及其行与 live entries，且**没有**条目报
      「did not activate」/ `webserver: duplicate exact route`（装了 `all` 就别再单装成员，
      内核的 `insert` 不去重，同 id 插两次就是双装配）
- [ ] 关掉一个插件 → 重启后真的生效
- [ ] 装 `@dsh-pack/all` 时若报 `ERR_PNPM_IGNORED_BUILDS` 并点名 `@photostructure/sqlite`
      （它由 `all` 里的 `graph-memory` 带进来），点「Allow these scripts and retry」后成功
- [ ] 故意在 profile 补丁层放一条坏行触发恢复对话框，确认 `docs/recovery.md` 的
      重新添加步骤确实能把包恢复回来（`sanitizeProfile` 会把整个包抹掉，这是已知行为）

## 绝对不要做的事

- **不要复活旧的 Electron / Tauri 发版流水线。** `release.yml` 历史上写过 `false && A || B`
  造成「假短路」，那份流水线是**删除**而非原地改写；要新增发版形态就重新写清楚门禁。
- **不要冒烟测试跑真安装器**（已无安装器）；集成测试一律用临时 `DSH_HOME`，
  `tools/itest/` 开头就断言拒绝真实 `~/.dsh`。
- 不要把 `@deepseek-ai/*` 写进任何包的 `dependencies`——会在用户 profile 里装出第二份
  物理拷贝，导致官方客户端拒绝启动。
- 不要改已经发布过的 cordis loader id。
