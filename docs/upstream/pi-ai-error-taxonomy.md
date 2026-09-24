# `dsh-llm-pi-ai` 四处 provider 错误误分类，把用户引向错误的补救动作（上游 issue 草稿）

> **来源与出处**：本文转录自本仓库（DSH Desktop）**构建期内核补丁集**的四条 PatchSpec，
> 该补丁集已随壳层退役整体移除。补丁的 transform 与幂等 marker 已核到实测字节，
> 转录如下即可直接改写为 PR。
>
> - 源 PatchSpec id：`pi-ai-credits`、`pi-ai-overflow-message`、
>   `pi-ai-reasoning-defaults`、`pi-ai-quota-not-retryable`
> - 原登记处：`dsh-desktop/scripts/lib/patch-registry.js`（order 231 / 232 / 244 / 337）
> - 原实现处：`dsh-desktop/scripts/patch-pi-ai-credits.js`、
>   `patch-pi-ai-overflow-message.js`、`patch-pi-ai-reasoning-defaults.js`、
>   `patch-pi-ai-quota-not-retryable.js`（transform + marker + 锚点字面全在其中）
> - 回归用例：`scripts/test/unit-patch-pi-ai-credits.test.js`、
>   `unit-patch-pi-ai-reasoning-defaults.test.js`、`unit-pi-ai-quota-not-retryable.test.js`
> - 函数名/锚点在 pin 的 `dsh-v0.1.7-alpha.1` 上实测命中
> - 目标仓库：`deepseek-ai/deepseek-harness`
> - 转录日期：2026-09

**Issue 标题建议**：`four provider-error misclassifications in dsh-llm-pi-ai lead users to the wrong corrective action`

---

## 0. 一句话 + 共同主线

四处缺陷的共同结构是：**一个终态、用户可自助处置的条件，被报成了暂态或被归错了因**。
四次里**有三次用户的后续动作是错的**：

| 簇 | 真相 | 用户看到的 | 用户因此做的事 | 该动作的后果 |
| --- | --- | --- | --- | --- |
| `pi-ai-credits` | 账户欠费（终态） | "API key is invalid" | **重填 API key** | 无效，且开始怀疑 key 管理/供应商 |
| `pi-ai-overflow-message` | 网关拒绝/故障（暂态，或确实是超限） | `400 status code (no body)` 死谜语，或被断定为超限 | **精简/删除会话** | 若成因是网关，删掉的是用户历史 |
| `pi-ai-reasoning-defaults` | 该模型从未声明档位（配置面缺失） | 控件不出现 / `UNSUPPORTED_REASONING_EFFORT` | 认为「第三方模型不支持思考」 | 能力其实可用，只是没有入口 |
| `pi-ai-quota-not-retryable` | 配额/余额耗尽（终态） | 界面无提示、长时间卡顿 | **等重试跑完 / 反复点重试** | 白等若干轮退避（单轮上限 60s） |

四类都**不需要新增能力**：上游已经有正确的判定函数（`isQuotaExceededError`）、
已经有正确的错误码（`QUOTA_EXCEEDED_CODE`）、已经有可恢复模式（`recovery: "recoverable"`）、
已经有 wire 消费（`thinkingLevelMap[level] ?? level`）。四处都只是
**顺序、默认值或覆盖面没收口**。这也是本 issue 主张「这是 bug 不是口味」的依据。

---

## 1. `pi-ai-credits`：欠费的 401 被判成 AUTH，UI 说「API 密钥无效」

- **靶文件**：`@deepseek-ai/dsh-llm-pi-ai/lib/index.js` → `classifyPiAiError(message)`
- **现象**：第三方 provider（例：opencode）在账户余额不足时返回
  **HTTP 401 + `CreditsError("Insufficient balance")`**。
  `classifyPiAiError` 里 `401/403 → "AUTH"` 那一行**排在**
  `isQuotaExceededError → QUOTA_EXCEEDED_CODE` **之前**，于是：

  ```js
  // 改前（上游，两行顺序）
  if (/\b(?:401|403)\b/.test(message)) return "AUTH";
  if (isQuotaExceededError(message)) return QUOTA_EXCEEDED_CODE;
  ```

  `AUTH` 先命中直接 return，`isQuotaExceededError` 那行**永远到不了**。
  客户端再把 `AUTH` 统一投影成固定文案——
  `dsh-client-ui-chat/lib/client.js` 的 `failureMessage(message, code, t)`：
  `return code === "AUTH" ? t("message.failure.auth") : message;`
  文案 zh「API 密钥无效」/ en `"API key is invalid"`
  （同一份文案也在 `dsh-client-ui-trajectory/lib/client.js` 的 `details.failure.auth`）。
  **key 其实有效，只是欠费。**

  注意这不是「上游没有识别能力」：`@deepseek-ai/dsh-llm/lib/index.js` 的
  `isQuotaExceededError()` **已经覆盖** `insufficient[\s_-]+(quota|balance|credits?)` 等
  余额/配额措辞——问题纯在判定顺序。

- **我们的修法（只调换顺序，余额判定前置）**：

  ```js
  /* dsh-desktop-patch: credits-before-auth — 第三方 provider 余额不足(CreditsError)
     会返回 401，须先于 AUTH 判定，否则误显示 API key is invalid */
  if (isQuotaExceededError(message)) return QUOTA_EXCEEDED_CODE;
  if (/\b(?:401|403)\b/.test(message)) return "AUTH";
  ```

  - 锚点是这两行**相邻**的字面（正则里带 `\r?\n`，因为目标文件历史上出现过 CRLF，
    不兼容就会静默漏打）；锚点失配（上游重排判定）即 `anchor-missing` 不改写、自动退役。
  - **真 401（消息里无余额/配额关键词）仍判 `AUTH`** —— 原行为不变，
    不是把「key 无效」这条能力削弱了。
  - 后续分支（`429 → RATE_LIMIT`、`413/400 → INVALID_REQUEST`、`5xx → SERVER` …）逐字不动。

- **严重度 / 复现**：高（误导性）。复现：mock 一个
  `401 + {"error":{"message":"Insufficient balance"}}` 的端点 →
  期望 code `QUOTA`，改前实得 `AUTH`。
  单测里钉的就是这条顺序断言：
  *patched 源码中 `isQuotaExceededError` 判定行必须出现在 `401/403` 判定行之前*。

- **运维补充（这段值得原样抄进 PR 描述）**：本补丁历史上**只**在 `postinstall`
  （`patch-deps`）阶段应用过，`node_modules` 一刷新就静默丢失——v0.5.3 的 payload 与
  dev 树实测**都缺**。所以「一次性打过」不等于「在位」；上游若吸收，请放进构建产物的
  正常代码路径，并由测试锁顺序。

---

## 2. `pi-ai-overflow-message`：裸 400 无响应体是**模糊信号**，不能说死成超限

- **靶文件**：`@deepseek-ai/dsh-llm-pi-ai/lib/index.js` → `mapStopReason(message, contextWindow)`
  （helper 注入点在函数签名之前，靠 function 声明提升可用）
- **现象与链路**：OpenAI 兼容端点（`openai-completions` 协议）在输入超过上下文窗口时，
  常见形态是 **HTTP 400 且响应体为空**。OpenAI SDK 把它格式化成字符串
  `"400 status code (no body)"`；pi-ai 的 catch 经 `formatProviderError`
  （`@earendil-works/pi-ai/dist/utils/error-body.js:111`）原样透出。
  上游对这个串**自己写过说明**（`error-body.js` 头注释）：

  > `Endpoints behind a proxy / gateway may return a non-2xx response whose body the provider SDK cannot fold into error.message ... surface opaque messages like "403 status code (no body)"`

  pi-ai 把它当超限认（`@earendil-works/pi-ai/dist/utils/overflow.js` 的
  `OVERFLOW_PATTERNS` 末条就是 Cerebras 形态）：

  ```js
  /^4(?:00|13)\s*(?:status code)?\s*\(no body\)/i, // Cerebras: 400/413 with no body
  ```

  于是 `dsh-llm-pi-ai` 的 `mapStopReason` 里
  `isContextOverflow(...)`（`import { isContextOverflow } from "@earendil-works/pi-ai/utils/overflow"`）
  返回 true → **错误码 `CONTEXT_WINDOW_EXCEEDED` 是对的**，但
  `failure.message` 仍是那句原样 `errorMessage`；客户端只对 `AUTH` 做过文案改写，
  其余 code 原样显示 message。用户于是看到：

  ```
  本轮运行失败 400 status code (no body)
  ```

- **这个形态为什么是**模糊**而不是超限的充分证据（实测）**：
  0.6.0 期间供应商 tokenrhythm 故障窗口内，**连 530 字节的标题请求**都返回
  400 空体。也就是说：`400 (no body)` 既可能是上下文超限，
  也可能是**供应商网关拒绝/故障**。把它断言成超限，用户唯一能被引导去的动作就是
  精简/删除会话——在网关故障的场景里这是在销毁历史。

- **我们的修法（只改这一条 opaque 文案，且两成因并列）**：

  ```js
  // 改前
  message: message.errorMessage ?? `pi-ai detected context overflow for model "${message.model}"`,
  // 改后
  message: friendlyPiAiOverflowMessage(message.errorMessage, message.model),
  ```

  ```js
  function friendlyPiAiOverflowMessage(errorMessage, model) {
    if (typeof errorMessage === "string" && /^4(?:00|13)\s*(?:status code)?\s*\(no body\)/i.test(errorMessage)) {
      return "模型端点返回 HTTP 400/413 无响应体（模糊错误，两种常见成因）：① 上下文超限——精简对话、压缩附件或开启新会话；② 供应商网关拒绝或故障——稍后重试或换模型/供应商。4xx 明细见数据目录 llm-4xx-dump.log。";
    }
    return errorMessage ?? `pi-ai detected context overflow for model "${model}"`;
  }
  ```

  刻意保守的三点：
  - **正则与上游 `OVERFLOW_PATTERNS` 的 Cerebras 条目同形**，不新增判定面；
  - **其余可读超限文案逐字不动**（如 Anthropic
    `prompt is too long: X tokens > Y`）——那些已经带信息，改反而丢信息；
  - **错误码不改**（仍 `CONTEXT_WINDOW_EXCEEDED`），只改人话；
    `llm-4xx-dump.log` 是配套的 `pi-ai-4xx-dump` 诊断落盘（见下）。

- **配套诊断（本仓库另一条补丁，建议上游收进官方排障手册）**：
  `pi-ai-4xx-dump` 在 `@earendil-works/pi-ai/dist/api/openai-completions.js` 的
  `stream()` catch 里，把当时的 model / baseUrl / 完整 params 落到
  `$DSH_HOME/llm-4xx-dump.log`（messages 每条截 2000 字，写失败静默、绝不影响请求流）。
  动机正是「网关对 streaming 请求的 4xx 一律无响应体（实测 401-no-body），
  错误侧看不到任何成因」——**一次复现即可定位真实拒因**。
  上游若不愿落盘，最小替代是把 `error.body` / `error.response` 并入展示文案
  （`normalizeProviderError` 已经把 body 探出来了，只差用上）。

- **严重度 / 复现**：中高（误导可致数据损失）。复现：让端点返回
  `400` + 空 body → 改前展示 `400 status code (no body)`。

---

## 3. `pi-ai-reasoning-defaults`：手声明路由永远拿不到思考档位，而且 UI 侧根本没有入口

- **靶文件**：`@deepseek-ai/dsh-llm-pi-ai/lib/index.js` → `resolveModelReasoning(provider, entry, base)`
- **三环问题链（2026-08-23 定案；三环相互独立，任一环都能造成「第三方思考强度不生效」）**：

  1. **设置页从不写 `reasoningEfforts`**。CustomProviderCard 写
     `llm-pi-ai` profile 时模型条目只有 `id` / `name` / `contextWindow` / `maxTokens`。
     这是上游**有意**设计——`@deepseek-ai/dsh-client-ui-settings-models/lib/client.js:1184` 原文：

     > `There is deliberately no reasoning-effort control, here or on the editor card: effort is a per-MODEL capability, and the models under one provider disagree about it, so a provider-scoped control can only be set to a value some of them reject. The composer's model picker offers each model its own levels instead.`

     实测该 UI bundle 里 **`reasoningEfforts` 出现 0 次**（既不在 CustomProviderCard，
     也不在 ModelListEditor）——即：**没有任何界面途径能声明档位**。

  2. **回落语义在手声明条目上空转**。`resolveModelReasoning` 对未声明字典的条目
     回落「继承内置 catalog 同 id 条目」：

     ```js
     // 改前
     if (efforts === void 0) return { reasoning: base?.reasoning ?? false };
     ```

     手声明路由在内置 catalog 里**没有基条目**（`base === undefined`）→ 恒
     `reasoning: false` → `reasoningInfo()` 返回 `{}` → 思考强度控件**永不出现**；
     显式配了档位则 `resolveReasoningLevel()` 抛
     `UNSUPPORTED_REASONING_EFFORT`
     （文案：`pi-ai provider "<p>" model "<m>" does not support reasoning effort "<e>"`）。

     上游对这一后果**写在注释里**（`reasoningInfo` 头注释）：

     > `A model that carries no reasoning metadata — every hand-declared one, and every catalog model pi-ai marks as non-reasoning — is reported by pi-ai as supporting the single level off. ... Omitting reasoning entirely is the seam's way of saying the capability is unavailable, which leaves the surface offering only the provider's default.`

     **这就是 bug 的所在地**：设计说明声称「picker 会给每个模型它自己的档位」，
     但对手声明模型 `reasoning:false` 使 picker 无档位可给，而唯一能声明档位的
     途径（`reasoningEfforts`）又没有任何 UI。**声明式路由的思考能力在原生链路上从未可用过。**

  3. **插件旁路也断了**。v0.5.3 的 VB3 把 `PiAiAdapter` 整类豁免出
     `dsh-third-party-thinking`。豁免本身**正确**——插件注入的假档位会被 pi-ai
     原生校验拒绝——但结果是旁路同断，用户侧只剩「不生效」。

- **我们的修法（宿主侧单一改动：无基条目时回落标准档位字典）**：

  ```js
  if (efforts === void 0) {
    // 手声明条目（无内置 catalog 基条目）默认思考档位。catalog 基条目存在时维持上游继承语义。
    if (base === void 0) return {
      reasoning: true,
      thinkingLevelMap: { minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" }
    };
    return { reasoning: base?.reasoning ?? false };
  }
  ```

  语义边界（三条都有单测钉住）：
  - **档位宇宙**取上游自己的 `THINKING_LEVELS`：
    `off / minimal / low / medium / high / xhigh / max`（`dsh-llm-pi-ai/lib/index.js:297`）。
    默认字典覆盖除 `off` 之外的 6 档，即「7 档全可调」；
  - **`off` 不进 map = 不发字段**：这是上游规范形态，
    pi-ai 各协议原生消费方式为 `model.thinkingLevelMap?.[level] ?? level`
    （如 `@earendil-works/pi-ai/dist/api/openai-completions.js:667`、`:709`、`:717`），
    未选档位时（`if (options?.reasoningEffort)`）**不向 wire 发任何字段**；
    对 `thinkingFormat === "deepseek"` 的形态，`model.thinkingLevelMap?.off !== null`
    决定发不发 `thinking:{type:"disabled"}`。**因此严格校验请求体的第三方网关不受影响**
    （未选档位时字节上等同于今天）；
  - **不替用户猜档位**：第三方网关对自身不支持的档位按端点文档拒绝，选择权在用户；
  - **catalog 条目与已显式声明字典的条目语义不变**（`base` 存在走继承、
    `efforts` 存在走声明路径）。

  三个可手声明协议（`PROTOCOL_LABEL_KEYS` / `LISTABLE_PROTOCOLS`：
  `openai-completions` / `openai-responses` / `anthropic-messages`）
  对同名拼写都有原生消费：前两者走 `reasoning_effort` / `reasoning.effort`，
  anthropic 走 `mapThinkingLevelToEffort(model, level)`
  （`@earendil-works/pi-ai/dist/api/anthropic-messages.js:639`）。

  升级通道也留了：marker 在位但字典是旧版
  `{ low, medium, high }` 时**就地替换为完整字典**——否则已装包用户会因 marker
  短路永久停在旧档位集，`getSupportedThinkingLevels()` 也就不会把 `xhigh/max` 计入可选。

- **与本仓库插件的配对关系（这是「缺口真实存在」的第二证据）**：
  `dsh-reasoning-effort`（`dsh-desktop/assets/plugins/dsh-reasoning-effort`）
  就是**同一个缺口的 UI/诊断面**，本补丁是**后端默认字典面**，两者互补。
  登记处的注释写得很直白
  （`dsh-desktop/scripts/lib/companion-plugins.js`，`COMPANION_PLUGINS` 中
  `{ id: 'reasoning-effort', name: 'dsh-reasoning-effort' }` 一条）：

  > `推理强度选择器（HanaAyane/dsh-reasoning-effort，MIT）… 宿主半边只读诊断自定义 provider 缺 reasoningEfforts 声明并给 copy-ready 指引。与 F4 补丁 patch-pi-ai-reasoning-defaults 互补（本插件 UI/诊断面，F4 后端默认字典面）。取代已退役的 dsh-third-party-thinking（fake 档位注入 + fetch 拦截旁路）。`

  插件自己把「为什么需要它」写在模块头注释里
  （`assets/plugins/dsh-reasoning-effort/lib/index.js`）：

  > `The slider can only offer what the DSH model directory exposes, and the request path validates every submitted effort against that same directory (UNSUPPORTED_REASONING_EFFORT otherwise). This half therefore never invents levels and never writes configuration: it diagnoses custom-provider models the directory under-describes and returns copy-ready reasoningEfforts declarations ... for the user to paste into settings.yaml.`

  以及 `lib/knowledge.js`：`Levels not named are pinned unsupported by dsh-llm-pi-ai's resolution`。
  **也就是说：这个插件存在的全部理由，就是「上游没有任何途径能给手声明模型声明档位」。**
  上游若吸收本 issue，插件的 `reasoningEfforts` 指引面即可退役（保留滑块与主题面）。

- **严重度 / 复现**：中（能力不可达，非崩溃）。复现：设置页「添加自定义供应商」→
  声明一条 `openai-completions` 路由与任意模型 → 观察 Composer 无思考强度控件；
  在 profile 里显式配 `effort: high` → `UNSUPPORTED_REASONING_EFFORT`。
  唯一 workaround 是**手改 `settings.yaml` 写 `reasoningEfforts` 字典**（本仓库插件
  给出的正是这份可粘贴 YAML）。

---

## 4. `pi-ai-quota-not-retryable`：配额耗尽与限流同为 429，但前者是终态

- **靶文件**：`@earendil-works/pi-ai/dist/utils/provider-retry.js`
  → `isRetryableProviderError(error)`（pi-ai 各 provider 路由共用的重试判定，
  被 `api/openai-completions.js`、`api/anthropic-messages.js`、
  `api/azure-openai-responses.js` 等的 `retryProviderRequest(...)` 调用）
- **先澄清一点（实测，避免上游误修）**：**分类本来就是对的**。
  `@deepseek-ai/dsh-llm/lib/index.js:179` 的 `isQuotaExceededError()`
  已覆盖 `insufficient_quota` / `quota exceeded` 等措辞；
  `dsh-llm-pi-ai` 的 `classifyPiAiError` 已把 `QUOTA` 排在 `429 → RATE_LIMIT` 之前
  （即 §1 修好顺序之后）。拿真实 payload 实测 `isQuotaExceededError` **返回 true**
  （反向对照：纯限流文案、`401 invalid api key` 均为 false）。
  **所以问题不是「显示成限流」，也不是「显示成 key 无效」。**
- **真正的缺陷**：`isRetryableProviderError` 把 **429 一律判可重试**
  （镜像 OpenAI/Anthropic SDK 的退避策略，对**限流**是正确的）：

  ```js
  return (error.status === 408 || error.status === 409 || error.status === 429 ||
          (typeof error.status === "number" && error.status >= 500));
  ```

  而 OpenAI 兼容渠道的**配额/余额耗尽同为 429**，却是**终态**（不充值永远不会成功）：

  ```json
  {"message":"Allocated quota exceeded, please increase your quota limit...","type":"insufficient_quota","code":"insufficient_quota"}
  ```

  于是每次请求先白等若干轮退避才把错误交给上层分类。退避量的准确口径：
  - provider 主动要求的延迟（`retry-after-ms` / `retry-after`）受
    `DEFAULT_MAX_RETRY_DELAY_MS = 60_000` 约束——**超过 60s 直接失败**，
    所以「单轮上限 60s」指的是这条；
  - pi-ai 自带指数退避是 `Math.min(0.5 * 2 ** retryIndex, 8) * 1000` 再乘 ≤25% 抖动，
    **封顶 8s**；
  - 轮数由调用方传入的 `options.maxRetries` 决定（`?? 0`）。
    注意：`dsh-llm-pi-ai` 的 `profileOptions()` 目前对 pi-ai 传
    `maxRetries: 0`（并在 profile 出现 `maxRetries`/`maxRetryDelayMs` 时直接抛错，
    提示改用 `dsh-llm-retry`），因此该路径上的额外等待取决于实际装配的重试选项；
    本仓库观测到的是「整轮请求先白等若干轮退避才报错」。**具体轮数口径 未核实**，
    引用时请按「若干轮、单轮上限 60s」表述，不要写成固定值。
- **我们的修法：不动分类、只改可重试性——命中配额特征即立即不可重试**。
  在 `x-should-retry` 显式头之后、任何按状态码的判定之前插入：

  ```js
  function isRetryableProviderError(error) {
      const shouldRetry = error.headers?.get("x-should-retry");
      if (shouldRetry === "true") return true;
      if (shouldRetry === "false") return false;
      // 配额耗尽即终态，先于任何按状态码的判定返回不可重试（显式 x-should-retry 头仍优先，运维可覆盖）。
      if (__dshIsQuotaExhaustedError(error)) return false;
      if (error.status === undefined) return true;
      …
  ```

  helper 的关键词集**与 `dsh-llm` 的 `isQuotaExceededError` 逐条对齐**（单源对照，便于同步维护），
  取的是 `error.code / error.type / error.message / error.body / error.response.data`
  里的字符串拼接：

  ```js
  /\binsufficient[\s_-]+(?:quota|balance|credits?)\b/i
  || /\b(?:quota|usage[\s_-]+limit)[\s_-]+(?:exceeded|exhausted|reached)\b/i
  || /\bexceed(?:ed|s)?[\s_-]+(?:(?:your|the)[\s_-]+)?(?:current[\s_-]+)?quota\b/i
  || /\b(?:balance|credits?)[\s_-]+(?:exhausted|depleted)\b/i
  || /\bout[\s_-]+of[\s_-]+(?:credits?|budget)\b/i
  ```

  优先级与反向控制（单测 8/8 钉住）：
  1. **显式 `x-should-retry` 头优先**（运维覆盖口，位置在配额判定之前）；
  2. 其后才看配额特征 → 命中即 `false`；
  3. **纯限流文案（`rate limit` / `too many requests`）不命中，仍走正常退避重试**；
  4. 反向四条必须仍可重试：纯限流 429、空正文 429、500、408，
     且 helper 对它们逐一返回 `false` ——
     **证明这不是「把 429 全禁了」，也没放宽成「任何 429 都禁」**。
  5. 锚点要求**恰好命中 1 次**，否则整份不改（拒绝半投）。

  副作用面：只影响「重试与否」，不改分类、不改文案、不改任何错误码口径。
  `@deepseek-ai/dsh-llm` 侧的 `DEFAULT_RETRYABLE_CODES`
  本就不含 `QUOTA`（只含 `EMPTY_RESPONSE` / `RATE_LIMIT` / `SERVER` / `TIMEOUT` / `TRANSPORT`），
  所以本修法是**把 SDK 层与 harness 层的口径对齐**，不是新增策略。

- **严重度 / 复现**：中（体验 + 成本：整轮卡顿）。复现：mock
  `429 {"type":"insufficient_quota","code":"insufficient_quota"}` + 打开重试
  → 改前多轮退避后才上报，改后立刻上报 `QUOTA`。

---

## 5. 合并诉求（建议上游一并处理，四处互不重叠）

1. `classifyPiAiError`：把 `isQuotaExceededError` 判定移到 `401/403 → AUTH` **之前**（§1）。
2. `mapStopReason`：对 opaque 的 `400/413 (no body)` 给**两成因并列**的可操作文案，
   不断言单一成因（§2）；并把 `normalizeProviderError` 已经探到的 body 用上。
3. `resolveModelReasoning`：手声明条目（无 catalog 基条目）未声明字典时，
   回落标准档位字典（`off` 缺席 = 不发字段），使控件开箱可用（§3）。
   **或者**给 `settings-models` 的模型条目加逐模型 `reasoningEfforts` 控件——
   二者择一即可，但不要停在「UI 说 picker 会给档位、picker 永远没有档位」这个组合上。
4. `isRetryableProviderError`：配额耗尽即终态、立即不可重试，
   `x-should-retry` 头仍优先，纯限流仍退避（§4）。
5. 面向生态的一条通则（与 §1/§4 同源）：**HTTP 状态码在 OpenAI 兼容渠道上不携带语义终态性**。
   401 可以是欠费、429 可以是配额耗尽、400 可以是网关故障。
   任何「按状态码分类」的代码都应先看 **body/code/type 措辞**再看状态码，
   并且 `retryable` 应由「是否终态」决定而非「状态码集合」。

---

## 6. 核实边界（不确定的都标出来了）

- 四处的靶文件、函数名、锚点字面、错误码、文案，均在本仓库 pin 的
  `dsh-v0.1.7-alpha.1` 上**实测命中**（补丁 marker 在 dev 树与 payload 副本中均在位）。
- §2 的「530 字节标题请求也返回 400 空体」来自 tokenrhythm 故障窗口的现场记录，
  原文只存在于被删除的补丁注释里（本文件即其转录）；**独立复现步骤 未核实**。
- §4 的「若干轮退避」的**轮数与总耗时口径 未核实**
  （`dsh-llm-pi-ai` 的 `profileOptions()` 对 pi-ai 传 `maxRetries: 0`，
  与该观测之间的链路我们当年没有完全钉死）。**60s 是单轮 provider 请求延迟的上限**
  （`DEFAULT_MAX_RETRY_DELAY_MS`），不是内置指数退避的上限（后者封顶 8s）。
- 转录时对原任务书的两处修正：
  - 档位回落不是「`low/medium/high` 直通」三档，而是**完整
    `THINKING_LEVELS` 宇宙（除 `off` 的 6 档，含 `minimal/xhigh/max`）**；
    `off` 由「缺席」表达（= 不发字段）。
  - 相关现场记录**不在** `dsh-desktop/docs/troubleshooting.md`（那里没有会话日志/供应商
    错误的条目），本文件引用的是 CHANGELOG 与 audit 文档。
