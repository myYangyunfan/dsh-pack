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

（`--job=j3` 单独跑：它用一个自带 `@photostructure/sqlite` 的夹具包去钉**内核/pnpm 的构建脚本放行机制**
（`pendingBuilds` → `allowBuilds` 就地改写、不新增重复键）仍然按我们写文档时描述的那样工作。
注意它**不再**是给 `docs/recovery.md` 兜底的：现成员集合没有任何原生 install 脚本，那篇文档里的
放行段落已随之作废。跑 J3 的 job 必须装 pnpm —— 内核的 `dsh plugin add` 是 shell 出去调它的。）

## 预发布通道

`release.yml` 里 `prerelease` job 手动触发（`workflow_dispatch`），以 `--tag beta` 发布。

为什么需要它：官方客户端有**强制更新策略**，内核版本会在我们不参与的情况下前进。
需要一条能让真实用户先验证「新内核下还挂不挂得上」的通道，而不是等正式版撞车。

## CI 的 install：年龄豁免 + 自家成员走 workspace 链接

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

年龄门过了之后，红点会往前挪一格变成 **`ERR_PNPM_FETCH_404`**：pnpm 按 lock 去 npmjs 取
`@dsh-pack/<成员>-<版本>.tgz`（没发布过就是 404）。**只加 `--filter '!@dsh-pack/all'` 治不了**
—— 2026-10-19 的 CI 实测：`Scope: 31 of 32 workspace projects` 说明 filter 生效了，同一轮里
照样报 `[ERR_PNPM_FETCH_404] GET …/@dsh-pack/billion-context-dsh/-/billion-context-dsh-0.2.26.tgz`。
（本机那次「绿」是假绿：store 里还留着上一次从 verdaccio 装进去的 tarball，压根没发请求。
判据必须换个地方看，见下。）

决定性的开关是 `pnpm-workspace.yaml` 里的 `linkWorkspacePackages: true`：它让 pnpm 把
「自家指自家」这一段链到 workspace 目录，于是 lock 记成
`version: link:../billion-context-dsh` 而不是 registry 解析 —— 现在 lock 的 `packages:` 段里
`@dsh-pack/*` 条目是 **0 条**，没有任何东西可取，这与 store 里有没有货无关。链接只覆盖
`@dsh-pack` 这一层；成员对 npm 外部包与内核 peer 的解析照旧走 registry，用户 profile 那边
的语义不受本仓配置影响。工作流里那 5 处 `--filter '!@dsh-pack/all'` 保留，作用是让 install
连元包那个 importer 都不必展开 —— 第二层保险，不是主修。

lock 的形状当场可核：

```bash
node -e "const Y=require('yaml'),f=require('fs');const l=Y.parse(f.readFileSync('pnpm-lock.yaml','utf8'));console.log('lock 里 @dsh-pack 的 registry 条目：',Object.keys(l.packages||{}).filter(k=>k.startsWith('@dsh-pack/')).length)"
# 期望 0。不是 0 就说明 lock 漂回 registry 形状，CI 会重新 404
```

`packages/meta-all/test/workflow-install-filter.test.mjs` 钉住「每条 install 都带 filter」，
两条变异反证都是当场踩出来的：判据第一版按「行里出现 pnpm install」匹配，被 ci.yml 自己的
说明注释判了两次假红（收紧成只认 `run:` / `install:` 开头）；变异用 `text.replace(REQUIRED,'')`
删到的也是注释里的字面量，变异体等于原件、反证空跑（改成锚定命令行的正则并断言命中）。

## 重生成 pnpm-lock.yaml

**现在完全离线**：`linkWorkspacePackages: true` 之后，`pnpm install --lockfile-only
--ignore-scripts` 12s 就能重生成（2026-10-19 实测），因为 24 个成员依赖链到 workspace 目录，
不需要任何 registry。

```bash
pnpm install --lockfile-only --ignore-scripts    # 只改 lock，不动 node_modules
pnpm install --frozen-lockfile --ignore-scripts  # 判据：绿 = lock 与全部 package.json 咬合
```

> ⚠ 后一条会把依赖**真装进** `node_modules`，`nodeLinker: hoisted` 装不下的会落进
> `packages/<包>/node_modules/`，其中含内核 `@deepseek-ai` 的拷贝 —— 那正是 `kernel-shadow`
> 拦的形状；而 `packages/billion-context-dsh/node_modules/acp-kernel` 与
> `packages/dsh-pocket/node_modules` 是**入库目录**，会被就地改写（实测 127 个跟踪文件）。
> 跑完必须清回去，命令见本节末。

本机预览 registry（`tools/preview-registry.mjs`，verdaccio）现在的用途只剩一个：
验证**按 registry 解析**的真实安装语义（客户端「设置 → 插件」按名装 `@dsh-pack/all`、
J2 的 tarball 通道、以及将来真要发到 npm 前的演练）。它不再是重生成 lock 的前提。
以前那套「起 registry → 发 31 个包 → 改 ~/.npmrc → lockfile-only」的步骤仍然可用，
2026-10-19 全流程实测约 3 分钟，产出的是 registry 形状的 lock —— 那种 lock 与 npm 上的同版本
**字节等价**（`@dsh-pack` 条目只记 `integrity`，tarball 地址由安装时的 registry 配置推导，
同一 `npm pack` 产物 → 同一 sha512）；但把它提交进仓库会让 CI 重新去取 404 的 tarball，
所以仓库里存的是链接形状，别混用。

```bash
node tools/preview-registry.mjs                                   # ① 起 verdaccio（14873/14874）
node tools/codemod/preview-registry-login.mjs 14874                # ② 写独立凭证文件，不碰 ~/.npmrc
node tools/codemod/publish-local-preview.mjs http://127.0.0.1:14874 --purge \
  --userconfig="$TEMP/dsh-preview-npmrc"                            # ③ 全量发（--purge 防同版本陈旧内容）
# ④ 临时把 @dsh-pack:registry=http://127.0.0.1:14874/ 加进 ~/.npmrc（只在这轮验证期间留着）
pnpm install --lockfile-only --ignore-scripts                        # 产出 registry 形状的 lock（只用于对账，别提交）
pnpm install --frozen-lockfile --ignore-scripts                      # ⑤ 用它绿 = 按 registry 语义装得动
# ⑥ 收尾：git checkout -- pnpm-lock.yaml 退回链接形状、删掉 ~/.npmrc 那一行、停 verdaccio，
#         再把包内 node_modules 清回去（命令见本节末）
```

> 走这条通道时以前还要临时写 `minimumReleaseAge: 0` 才跑得动；现在上面那条豁免覆盖
> `@dsh-pack/*`，本机被点名的也只有这个 scope，不必再动配置
> （CLI 没有 `--minimum-release-age` 选项，写了只会 `Unknown option`）。

`--frozen-lockfile` 那条判据不能省：它才是「lock 与 32 个 package.json 咬合」的证明，
逐字段比对只查得到 specifier，查不到缺条目与 integrity 漂移。

副作用要说清楚：真装会把依赖写进 `node_modules`，`nodeLinker: hoisted` 装不下的版本会落进
`packages/<包>/node_modules/` —— 里面**包含内核 `@deepseek-ai` 的拷贝**，正是 `kernel-shadow`
门禁拦的形状，而 `packages/billion-context-dsh/node_modules/acp-kernel` 与
`packages/dsh-pocket/node_modules` 是**入库目录**，会被就地改写（实测 127 个跟踪文件）。
跑完必须清回去：

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
