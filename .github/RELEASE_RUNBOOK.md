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
| 静态审计 | `node tools/audit/index.js` | 8 项里 `publish-readiness` 是 **P0**：一个包写错就能让**整个官方客户端拒绝启动** |
| 发布物内容 | `node tools/itest/pack-audit.mjs` | `npm pack` 真实产物：查 `files` 白名单有没有把 `node_modules`/`.map`（内嵌上游 TS 源码）/测试目录打进去，以及 bundle 的 `cordis.patch.yml` 有没有随包发布 —— 漏了就是「装得上、一个都不挂」 |
| 单测 | `node --test "packages/*/test/*.test.js"` | — |
| J1 组合 | `node tools/itest/boot-desktop-profile.mjs --job=j1` | 验证补丁层真挂得上、id 恰好出现一次、二次安装字节幂等 |
| J4 激活 | `node tools/itest/boot-activation.mjs` | **发布前必跑**：真挂载所有条目，抓「apply 里抛错」「被 catch 吞掉的降级日志」「duplicate route」，并按 `tools/itest/live-probes.json` **真发 HTTP** 打一遍页内表面（路由未挂上时症状是 405，日志里一行都没有）。J1 的 `--dump-config` 只证明组合，证明不了激活 |
| J2 tarball | `... --job=j2` | **只有 tarball 安装会暴露 `files` 白名单错误与 `private:true`**；路径安装会把这两类都掩盖掉 |

> `pack-audit` 目前因 `dsh-side-session`、`dsh-super-injector` 缺 LICENSE 而红。
> 这是**真实的发布阻塞**（BSD-3 要上游原文与署名人；`@dsh-external` 包的作者未核实），
> 不要靠加白名单让它变绿：要么补齐出处，要么明确不发布这两个包并从 `tools/tiers.json` 摘掉。

（`--job=j3` 单独跑，用来钉住 pnpm 构建脚本放行的文案与恢复路径，防止 `docs/recovery.md` 腐烂。）

## 预发布通道

`release.yml` 里 `prerelease` job 手动触发（`workflow_dispatch`），以 `--tag beta` 发布。

为什么需要它：官方客户端有**强制更新策略**，内核版本会在我们不参与的情况下前进。
需要一条能让真实用户先验证「新内核下还挂不挂得上」的通道，而不是等正式版撞车。

## 供应链年龄门禁与 `@dsh-pack` 豁免

`pnpm-workspace.yaml` 里这条不是可选装饰，别顺手删：

```yaml
minimumReleaseAgeExclude:
  - '@dsh-pack/*'
```

pnpm 11 默认带 24h 的 `minimumReleaseAge` 供应链门禁 —— 它要按 registry 上的发布时间来判，
而 `@dsh-pack/*` 是我们自己的包：**每次发版拿到的都是刚发布的版本**，必然落在窗口里被 fail-closed。
2026-10-19 实测形状就是 CI 的 `pnpm install --frozen-lockfile=false --ignore-scripts` 当场报
`[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] 24 lockfile entries failed verification`
（逐条附 `GET https://registry.npmjs.org/@dsh-pack%2F…: Not Found - 404`——没发布过就取不到发布时间）。
豁免只放自己的 scope，外部依赖的年龄校验一字不动；**即便将来真发到 npm，这两行仍要留着**，
否则每次 release 后的首个 CI 都会这样红一遍。

反证（本机同一条命令，只改这两行的有无）：加上 → `✓ Lockfile passes supply-chain policies (1674 entries)`
且 `pnpm-lock.yaml` 一字节不动；撤掉 → exit 1，报的就是 CI 那句 24 条违规。

## 重生成 pnpm-lock.yaml

`pnpm-lock.yaml` 只有在 `@dsh-pack/*` 可解析时才重得动 —— pnpm 10+ 默认
`link-workspace-packages: false`，所以即便成员都在本仓 workspace 里，`^x.y.z` 声明仍然
要去 registry 取。没发 npm 之前的正解是走本机预览 registry（实测 2026-10-19，全流程约 3 分钟）：

```bash
node tools/preview-registry.mjs                                   # ① 起 verdaccio（14873/14874）
node tools/codemod/preview-registry-login.mjs 14874                # ② 写独立凭证文件，不碰 ~/.npmrc
node tools/codemod/publish-local-preview.mjs http://127.0.0.1:14874 --purge \
  --userconfig="$TEMP/dsh-preview-npmrc"                            # ③ 全量发（--purge 防同版本陈旧内容）
# ④ 临时把 @dsh-pack:registry=http://127.0.0.1:14874/ 加进 ~/.npmrc，然后：
pnpm install --lockfile-only --ignore-scripts
pnpm install --frozen-lockfile --ignore-scripts                     # ⑤ 用它绿 = lock 与全部 package.json 咬合
# ⑥ 收尾：删掉 ~/.npmrc 那一行、停 verdaccio，再把包内 node_modules 清回去（见下面「副作用」）
```

> 第 ④ 步以前还要在 `pnpm-workspace.yaml` 里临时写 `minimumReleaseAge: 0` 才跑得动；
> 现在上面那条豁免已经覆盖 `@dsh-pack/*`，而本机被点名的只有这个 scope，所以不必再动配置
> （CLI 也没有 `--minimum-release-age` 这个选项，写了只会 `Unknown option`）。

两条会当场拦住你的策略，都是真的，别绕过去骗自己：

- **年龄门禁**：见上一节。它拦的是「发布时间取不到 / 太新」，不是包体有问题。
- **lock 里不会留下本机地址**：`@dsh-pack` 条目只记 `integrity`，tarball 地址由安装时的
  registry 配置推导。所以本机发的那份 lock 与将来 npm 上的同一版本**字节等价**（同一 `npm pack`
  产物 → 同一 sha512），不需要事后改 host。

副作用要说清楚：第 ⑤ 步会把依赖真装进 `node_modules`，`nodeLinker: hoisted` 装不下的版本会落进
`packages/<包>/node_modules/` —— 里面**包含内核 `@deepseek-ai` 的拷贝**，正是 `kernel-shadow`
门禁拦的形状，而 `packages/billion-context-dsh/node_modules/acp-kernel` 与
`packages/dsh-pocket/node_modules` 是**入库目录**，会被就地改写。跑完必须清回去：

```bash
git clean -fdX -- "packages/*/node_modules"                # 只删未入库（含 ignored）的新增
git checkout -- packages/billion-context-dsh/node_modules packages/dsh-pocket/node_modules
node tools/audit/index.js                                  # kernel-shadow 应回到只报 dsh-pocket 一条
```

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
