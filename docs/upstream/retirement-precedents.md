# 退役先例录：本仓库如何在内核换代中干净地删掉自己的代码（上游可读的机构记忆）

> **来源与出处**：本文转录自 `dsh-desktop/scripts/compat/kernel-pin.json` 的
> `services.required` / `services.removed` 两表，以及
> `dsh-desktop/scripts/lib/patch-registry.js` 里的逐条退役注释。
> 这两处随壳层退役与补丁机件删除一并消失，故在删除前整表转录为独立文档。
>
> - 源文件：`dsh-desktop/scripts/compat/kernel-pin.json`
>   （`compatLayerVersion: 0.6.0-skeleton.1`；`kernel.tag: dsh-v0.1.7-alpha.1`，
>   `packageVersion: 0.1.7-alpha.1`，`acquisition: offline-tarball`，
>   `vendorDir: vendor/dsh-kernel`，`upstream: https://github.com/deepseek-ai/deepseek-harness`，
>   `maturity: developer-preview`，
>   `pinPolicy: exact — 官方 developer preview 破坏性变更随时发生，禁止浮动`）
> - 校验器：`dsh-desktop/scripts/compat/validate-pin.js`
> - 转录日期：2026-09
>
> 这份记录的目的不是怀旧：**它证明本仓库对上游的价值面**——每次内核换代，
> 我们都会把「已被上游吸收的东西」从自己这边摘干净，并把「为什么摘」留成机器可校验的表。
> 上游把它当外部反馈清单用即可：`services.removed` = 上游已收编的能力清单，
> 逐条附带上游自己的版本号。

---

## 1. 这张表是什么，谁在机器层面守着它

`kernel-pin.json` 的 `services._meta` 原文：

> `关键后端服务清单（id = 组合 yml 行 id / loader entryId）。来源：官方 ctx seam 表（dsh-std/01 §4）+ 桌面组合实装。此清单取代散落在健康页/插件管理里的硬编码 id。`

它不是文档性清单，而是**fail-closed 门禁的数据源**
（`scripts/compat/validate-pin.js` 头注释）：

> `职责（v0.6.0 M1，fail-closed）：1. kernel-pin.json 结构与语义校验（kernel.tag 精确 pin、services 清单唯一且非空、removed 项不得出现在 required）；2. 离线内核分发物（vendor/dsh-kernel/*.tgz）的版本与 pin 的 packageVersion 一致（官方 developer preview 破坏性变更随时发生——pin 与实际不符即拒绝，禁止浮动，v0.1.2-alpha.1 升级的教训）；3.（可扩展）boot 接线点：presets/preflight 步骤调用本模块，pin 不符即 fail-closed 进恢复页。`

发布说明对该表用途的定义（`dsh-tauri/docs/release-notes/v0.6.0.md`，兼容层 M0/M1 一节）：

> `scripts/compat/kernel-pin.json：登记 vendored 内核版本 + 补丁面清单 + 已知移除 API（removedInKernel 携带教训注记，如 v0.5.7 健康页误报的 api-gateway）`

**退役在评估方法论里是一个正式档位，不是随手删代码**
（`dsh-tauri/docs/compat-layer/README.md` §4 ③）：

> `内核升级 = 逐个适配器判定：锚点存活（绿）/ 需重靶（黄）/ 原生化可退役（蓝）/ 内核面重构需重写（红）`

---

## 2. `services.required`（13 项，pin 到 0.1.7-alpha.1 时的关键后端服务）

| id | module | label |
| --- | --- | --- |
| `credentials` | `@deepseek-ai/dsh-credentials-local` | 凭据服务 |
| `settings` | `@deepseek-ai/dsh-settings` | 设置文档 |
| `llm` | `@deepseek-ai/dsh-llm` | 模型调用核心 |
| `llm-deepseek` | `@deepseek-ai/dsh-llm-deepseek` | DeepSeek 模型路由 |
| `session` | `@deepseek-ai/dsh-session` | 会话域 |
| `session-persistence-jsonl` | `@deepseek-ai/dsh-session-persistence-jsonl` | 会话落盘 |
| `sandbox` | `@deepseek-ai/dsh-sandbox-local` | 文件边界 |
| `approval` | `@deepseek-ai/dsh-user-approval` | 权限审批 |
| `storage-json` | `@deepseek-ai/dsh-storage-json` | 本地存储 |
| `webserver` | `@deepseek-ai/dsh-host-webserver` | 本地服务端口 |
| `plugin-inventory` | `@deepseek-ai/dsh-host-plugin-inventory` | 插件清单服务 |
| `modules` | `@deepseek-ai/dsh-client-modules` | 前端模块表 |
| `connection` | `@deepseek-ai/dsh-client-connection` | 前后端传输 |

0.1.6-alpha.1 换代评估当时的结论是这张表**一项都没被上游除名**
（`dsh-tauri/docs/compat-layer/v016-alpha1-migration-assessment.md` §3.3）：
`pin.json services.required 13 项无一直接除名`。

---

## 3. `services.removed`：12 条退役先例（逐字转录）

字段语义：`id` = 我们这边登记的服务/包标识；`removedInKernel` = **上游**移除或替代该能力的
内核版本；`reason` = 当时的判定原文（**逐字**，含中文原文）。

### 3.1 全表

| # | `id` | `removedInKernel` | `reason`（逐字原文） | 我们的东西 → 上游替代 | 这条示范了什么 |
| --- | --- | --- | --- | --- | --- |
| 1 | `api-gateway` | `0.1.2-alpha.1` | `网关 folded 进核心原生实现（v0.5.7 健康页误报教训）` | 独立网关服务 → 核心原生实现 | **退役判定错了也会被自己的门禁抓到**：健康页当时按旧清单报「网关缺失」，是误报而非真缺。教训固化为「`removedInKernel` 必须携带教训注记」 |
| 2 | `code-runtime-python` | `0.1.2-alpha.4` | `上游 alpha.4 未发布该包且家族依赖树零引用，随升级一并移除（242/244）` | Python code-runtime → 上游不再发布 | **零引用即随升级清理**，并留下采集口径编号（242/244）供回查 |
| 3 | `tool-subagent-report` | `0.1.2-alpha.4` | `上游 alpha.4 未发布该包且家族依赖树零引用，随升级一并移除（242/244）` | 子代理回报工具 → 上游不再发布 | 同上（同批判定，说明规则可批量套用） |
| 4 | `code-runtime` | `0.1.6-alpha.1` | `JS code-runtime 家族退役，PTC runtime（run_code 按次超时 120-600s）接替` | JS code-runtime → **PTC runtime**（`run_code`，按次超时 120–600s） | 上游换范式时我们跟着退役；注记里带上**接替者的可观察行为**（超时区间），便于日后判断自己哪里还依赖旧形态 |
| 5 | `code-runtime-worker-thread` | `0.1.6-alpha.1` | `同上（worker-thread 形态并入 workflow-ptc）` | worker-thread 形态 → `workflow-ptc` | 家族退役要**逐成员记形态落点**，不能只写「家族没了」 |
| 6 | `e2b` | `0.1.6-alpha.1` | `E2B 云沙箱三件套（e2b/fs-e2b/subprocess-e2b）整体移除` | `dsh-e2b` / `dsh-fs-e2b` / `dsh-subprocess-e2b` 三件套 → 整体移除 | **成组能力一次退役**：一行记一个三件套，注记里列全三个包名 |
| 7 | `settings-file` | `0.1.7-alpha.1` | `上游重构合并为 @deepseek-ai/dsh-settings` | `settings-file` → 合并进 **`@deepseek-ai/dsh-settings`** | 上游合并包时改的是 **id 与 module 两处**，我们的 required 表据此跟着收敛 |
| 8 | `cordis-plugin-hmr` | `0.1.7-alpha.1` | `由官方 @deepseek-ai/dsh-hmr 替代` | 通用 cordis HMR 插件 → 官方 **`@deepseek-ai/dsh-hmr`** | **第三方包被官方同名能力替代**：这是「壳侧/插件侧代码可以整块删掉」的最干净形态 |
| 9 | `agent-presets` | `0.1.7-alpha.1` | `更名为 @deepseek-ai/dsh-agent-preset` | `agent-presets` → 更名 **`@deepseek-ai/dsh-agent-preset`** | 纯改名也要登记——否则健康页与插件装配会按旧 id 找不到而误报 |
| 10 | `client-ui-settings-unarchive-sessions` | `0.1.7-alpha.1` | `0.1.6 起原生支持，0.1.7 官方已移除此包` | 我们补的「设置页取消归档会话」UI 包 → **上游原生支持（0.1.6 起）**，0.1.7 官方把该包移除 | **最有代表性的一条**：上游先原生吸收能力、隔一个版本再删掉外挂包。退役注记里同时留下「哪版开始原生」与「哪版删包」两个版本号 |
| 11 | `cordis-plugin-logger-console` | `0.1.7-alpha.1` | `上游 0.1.7 已废弃退役` | console 日志插件 → 上游废弃 | 上游单方面废弃时我们只做**跟随**，不猜测替代者 |
| 12 | `agent-team-web-profile` | `0.1.7-alpha.1` | `上游 0.1.7 已废弃退役` | agent-team 的 web profile → 上游废弃 | 同上（同批两条，说明按版本批次登记） |

### 3.2 转录校订（相对任务书的原始清单）

任务书给的骨架是「`client-ui-settings-unarchive-sessions`、`settings-file`、
`cordis-plugin-hmr`、`agent-presets`、code-runtime 家族、e2b 三件套」。实际文件里是
**12 条**，另有 6 条骨架未提及：`api-gateway`、`code-runtime-python`、
`tool-subagent-report`、`code-runtime-worker-thread`、`cordis-plugin-logger-console`、
`agent-team-web-profile`。两处与骨架的描述差异需要校正：

- `code-runtime` 一族的退役**分散在两个内核版本**：
  `code-runtime-python` / `tool-subagent-report` 早在 **0.1.2-alpha.4**
  就以「上游未发布 + 零引用」被移除；`code-runtime` / `code-runtime-worker-thread`
  才是 **0.1.6-alpha.1** 的 PTC 接替。写「一族一次退役」会把历史压扁。
- `code-runtime-worker-thread` 的 `reason` 原文是
  `同上（worker-thread 形态并入 workflow-ptc）`。而 0.1.6 换代评估文档里
  「并入 workflow-ptc」那条对应的是 **`dsh-workflow-worker-thread`**
  （`v016-alpha1-migration-assessment.md` §3.2：
  `dsh-workflow-worker-thread | workflow worker 退役（并入 workflow-ptc）`）。
  两个包名相近、注记文本相同，**这一条是否存在串写未核实**——引用时以本文件
  3.1 表第 5 行的原文为准，并注明疑点。

### 3.3 换代评估文档里的原始取证（退役记录的可追溯链）

`removed` 表不是手写的结论，而是从每代升级评估里落下来的。0.1.5-rc.2 → 0.1.6-alpha.1
的评估（`dsh-tauri/docs/compat-layer/v016-alpha1-migration-assessment.md`）：

> `### 3.2 移除 6`
> `| dsh-code-runtime / dsh-code-runtime-worker-thread | **JS code-runtime 退役**，由 PTC runtime 接替（run_code 按次超时） |`
> `| dsh-e2b / dsh-fs-e2b / dsh-subprocess-e2b | E2B 云沙箱三件套移除 |`
> `| dsh-workflow-worker-thread | workflow worker 退役（并入 workflow-ptc） |`
>
> `### 3.3 桌面 services 面影响`
> `- pin.json services.required 13 项**无一直接除名**；…`
> `- pin.json services.removed 建议追加：code-runtime（0.1.6-alpha.1 退役，PTC 接替）、e2b（同批移除）。`

也就是说：**评估文档先出「建议追加」，pin 表再落账**。这条链（评估 → 建议 → 登记表 →
fail-closed 校验器 → 发布说明引用）是这张表最值得留给上游的部分。

---

## 4. 补丁层的退役：机制与逐字注释

同一套「上游吸收了就让本地代码消失」的纪律也作用在 66 条 PatchSpec 上。
退役有**三条互补机制**，全部是机器判定，不靠人记：

1. **`already` 短路**——幂等 marker 在位即跳过。适用于「上游做了等价改动但字节不同」之外
   的重复应用；对**靠存在性判定**的补丁（如向 catalog 追加条目）就是退役通道。
2. **`anchor-missing` 自动退役**——锚点字面失配即不改写、计入 `report.anchorMissing`、
   `failPolicy: 'warn'` 只告警不阻断 boot。上游重构掉该处（无论是否吸收），补丁自动失效。
3. **摘除 + 休眠**——确认无增量后从 `PATCH_SPECS` 摘掉条目，
   但 **`patch-*.js` / transform 保留为休眠代码**（不删），由计数哨兵
   （`ta6-registry-invariants`、`unit-patch-registry`）随摘除同步调整基线。

`patch-registry.js` 里的注释原文（行号是该文件删除前的位置）：

| 位置 | 逐字注释 | 示范 |
| --- | --- | --- |
| 头部字段约定 `cli` 段（L39–41） | `cli:true 现共 26 项（HEAD 原有 8 个 + … 四个数据完整性补丁 + 两个内核韧性补丁 + …）；计数哨兵见 ta6-registry-invariants.test.js F 与 unit-patch-registry.test.js` | 退役必须**同步改哨兵**，否则测试红——摘除是显式动作而非顺手删。（该注释里的计数已滞后：文件删除前实测 `getSpecsByCli().length === 29`、`PATCH_SPECS.length === 66`，与 AGENTS.md「基线数字常滞后，以实测为准」一致） |
| 头部 `failPolicy` 段（L42–47） | `failPolicy 'warn'（失配告警跳过，多数现状）\| 'degrade'（失配降级 + 升级提示）\| 'fatal'（仅 build 期保留）`；`degrade 档补丁的 anchor-missing 会分流进 report.degraded（降级告警），warn 档计入 report.anchorMissing（版本差异）` | 失配被**分类统计**，能区分「上游吸收了」与「上游漂移了」 |
| 头部退役说明（L52–57） | `退役说明（0.1.5-rc.1 重靶期）：preset-seat-fix / token-meter-clamp 已由上游原生修复，从 PATCH_SPECS 摘除（patch 脚本保留休眠）；其余失配项已重锚（image-send / profile 系 / menu-viewport #182 / open-project-dir / session-persistence corrupt / wsl-picker / header-scan / ds-tool / conversation-assembly / reasoning-row / unknown-event）` | 一次换代里**退役与重锚分流**，两类都要留名 |
| L419–420（`persistent-shell-abort-race` / `terminal-interrupt-escalation`） | `上游修复意向：上游内置同款 abort race / 中断升级后，两补丁经 already / anchor-missing 自然退役（参照 vision-key-fix 休眠先例），无需手工摘除。` | 登记时就**预先写明退役条件**，不等到时候再判断 |
| L938–939（`pi-ai-opencode-go-models`） | `…上游重新生成 catalog 收录后经「已存在即跳过」自然退役。见 scripts/patch-pi-ai-opencode-go-models.js。` | 数据型补丁靠**存在性判定**天然退役 |
| L963–964（`pi-ai-credits`） | `锚点失配（上游重排判定）自动退役。见 scripts/patch-pi-ai-credits.js。` | 顺序类修复的退役条件 = 上游把顺序改对 |
| L1069–1070（`pi-ai-reasoning-defaults`） | `锚点失配（上游重构该函数）自动退役。见 scripts/patch-pi-ai-reasoning-defaults.js。` | 同上 |
| L1293（`wsl-picker-browse`） | `上游 resolver 内置同款判定后经 already / anchor-missing 自然退役。` | 平台判定类补丁的退役口径 |
| L1689（`skill-dirs-compat`） | `上游原生收录这些根后经 already / anchor-missing 自然退役。cli:true：boot + CLI 同步期均应用。` | 兼容性扩展同上 |

**已经发生的两次真实退役（有计数证据）**：

- `preset-seat-fix`（L898–902）：
  > `preset-seat-fix 已退役（0.1.5-rc.1 重靶期）：上游 AgentPresetSeatController 已把 this.remotePresets(ctx) 双重错误（模块级函数误加 this + ctx 应为 this.ctx）改为 this.ctx.remote.agentPresets.select(...)，且 select 返回 { ok, error } 结果对象（!result.ok 分支复位 busy）——busy 卡死根因已原生修复，补丁无增量。patch-preset-seat.js 保留（休眠，参照 vision-key-fix 先例）。`
  这条同时是**给上游的确认回执**：我们报过去的 bug，上游用哪种形态修掉、修在哪个函数，都被记下来了。
- `token-meter-clamp`（L1007–1012）：
  > `token-meter-clamp 已退役（0.1.5-rc.1 重靶期）：上游 contextBreakdown 的 apply 重构为「systemTokens = findLast(system) + messageTokens = system + message + delta - system」——新公式恒非负（…）写端负值 bug 已原生修复；stateVersion 亦已演进到 4（0.5.6 的 ver=2 负值行经 restoreFloor 自然作废）。两层子补丁均无增量。patch-token-meter-clamp.js 保留（休眠）。`
  退役判定的依据是**上游新算法的不变量**（恒非负），不是「测试绿了」。
- `workspace-search-rail-fix`（L628–632）：
  > `workspace-search-rail-fix 已退役（v0.6.0 alpha.2 重靶期）：0.1.2-alpha.2 上游原生包含同款守卫（if (!wide || !searchExpanded || searchOnExpand) return; 且 deps 含 searchOnExpand，pristine :L1991 实证），补丁无增量。transform 保留在 patch-adapters（休眠，参照 session-event-bound 先例）。`
  配套 commit 即计数证据：`6e01aea feat(v0.6.0): M2 红区重靶完成——三包锚点全存活 + search-rail 原生化退役（51→50）`，
  发布说明同条：`search-rail 原生化退役：内核已原生提供同能力，壳侧补丁删除（51 → 50）`。

**marker 有世代，退役要能覆盖在野副本**（`session-load-graceful` 的
`SESSION_LOAD_GRACEFUL_MARKER_V2` / `_V3`，`patch-adapters.js` L2181–2195）：
上游改返回契约后，旧注入体变成「锚点命中但语义失效」的死代码，因此
补丁引入 `(v2)` / `(v3)` 世代标记 + **就地升级通道**（整块历史字面量 → 整块新注入体，
保证「升级产物与 pristine 全新应用逐字节相同」）。教训原文
（`dsh-desktop/CHANGELOG.md`，0.1.5-rc.1 换代条目）：

> `**这一类缺陷抓不住的原因**：锚点三态判定依旧返回 changed（锚点行本身没变），ta6 基线矩阵与 patch-surface 都只校验「补丁是否投上去」，不校验「注入体的产物形态是否还被消费端认」——只有读上游消费端函数体才能发现。**教训固化**：换代时凡注入体含「返回给上游消费」的对象字面量，必须比对该字段名集在 rc.1 消费端的出现次数，而不是只看锚点。`

---

## 5. 这份记录对上游的三条用处

1. **收编清单**：`services.removed` 逐条给出「哪版内核吸收/替代/废弃了什么」，
   可直接当上游的**向后兼容回归面**——第 10 行那种「0.1.6 原生支持、0.1.7 删外挂包」
   的节奏，正是外部依赖者需要预告的信号。
2. **外部验证**：第 4 节两条已退役补丁（`preset-seat-fix`、`token-meter-clamp`）
   记录了上游修复的具体函数与不变量，等于第三方对上游修复的**独立验收结论**。
3. **退役纪律的模板**：登记表 + fail-closed 校验器（`removed` 不得与 `required` 自相矛盾）
   + 计数哨兵 + 休眠保留 + marker 世代升级 + 就地升级通道。
   任何长期给上游打补丁/跟随上游换代的项目都可以照抄这套骨架。

> 转录时的诚实边界：本文件所有 `reason` 与注释均为**逐字**抄自上述源文件；
> 唯一存疑处是 §3.2 标注的 `code-runtime-worker-thread` / `dsh-workflow-worker-thread`
> 注记串写可能（已标 **未核实**）。此外，`compatLayerVersion` 与 `kernel.tag`
> 属工作树未提交状态（0.1.7-alpha.1），不保证与任一已发布 tag 完全对应。
