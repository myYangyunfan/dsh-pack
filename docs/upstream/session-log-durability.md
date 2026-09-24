# 会话日志读取的 fail-closed 策略会销毁用户历史（上游 issue 草稿）

> **来源与出处**：本文转录自本仓库（DSH Desktop）**构建期内核补丁集**的四条 PatchSpec，
> 该补丁集已随壳层退役整体移除。为免知识丢失，以下推理在删除前逐字转录并核到实测字节。
>
> - 源 PatchSpec id：`session-header-scan-guard`、`session-load-graceful`、
>   `session-unknown-event-tolerance`、`released-v0-history-recovery`
> - 原登记处：`dsh-desktop/scripts/lib/patch-registry.js`（66 条 PatchSpec 清单中的 4 条）
> - 原实现处：`dsh-desktop/scripts/lib/patch-adapters.js`（簇 A/B/C 的 transform 与 marker）、
>   `dsh-desktop/scripts/lib/runtime-patches.js`（簇 D 的 transform 与 marker）
> - 回归用例：`scripts/test/unit-session-header-scan-guard.test.js`、
>   `unit-session-load-graceful.test.js`、`unit-patch-session-unknown-event-tolerance.test.js`、
>   `unit-released-v0-history-recovery.test.js`
> - 全部函数名/字节锚点在 pin 的 `dsh-v0.1.7-alpha.1`（`packageVersion: 0.1.7-alpha.1`）上实测命中；
>   更早世代的差异（方法改名、返回契约换代）在正文逐处标注。
> - 目标仓库：`deepseek-ai/deepseek-harness`
> - 转录日期：2026-09

**Issue 标题建议**：`fail-closed reads in session-log persistence destroy user history`
（会话持久化的读取路径 fail-closed，用户历史被永久判为不可读）

---

## 0. 一句话

`@deepseek-ai/dsh-session-persistence` 与 `@deepseek-ai/dsh-session-format-*` 在**读取**会话
日志时有三处「一处不合就整条拒载」的闸门：未知事件类型、冻结成员清单之外的载荷成员、
解码/校验失败的帧。三者都把**可恢复的信息缺口**升级成**该会话永久打不开**。
现场一台机器 **54 个会话里 19 个读不回**（簇 D 实测）。

同时，写路径是开放的：第三方插件可以自由给已知事件加载荷成员、写自定义事件类型。
**写侧可扩展 + 读侧冻结 = 任何一个插件写一个新字段，就会把该用户的历史在任何一个
更旧或更严格的 reader 上永久变砖。** 这不是某个 fork 的读取偏好，这是生态契约里的
数据丢失面。

---

## 1. 为什么这是生态契约缺陷，不是某个 fork 的问题

### 1.1 写侧：扩展是被鼓励且被支持的

| 事实 | 出处（当前 pin 的字节） |
| --- | --- |
| 事件信封有 `ignorable?: true`，专门给「读者可能不认识的新类型事件」用 | `@deepseek-ai/dsh-session/lib/types/types.d.ts` 的 `SessionEvent`：`Marks an event a reader may safely skip when it does not recognize type.` |
| 上游明确承认仓外插件事件天然落在已知词表之外 | `@deepseek-ai/dsh-session/lib/index.js` 的 `KNOWN_SESSION_EVENT_TYPES` 头注释：`Downstream (out-of-repo) plugin events are outside this list by construction. The persisted SessionEvent.ignorable marker is the compatibility mechanism; event-name registration was rejected ...` |
| 加普通事件类型**不升格式版本**，靠 `ignorable` 兜词汇增长 | 同文件 `SESSION_FORMAT_VERSION` 头注释：`Adding an ordinary event type does not bump — the per-event SessionEvent.ignorable guard covers vocabulary growth instead.` |
| 载荷成员是自由 JSON：第三方压缩插件确实往 `compaction/summary` 写了 5 个自家账本字段 | 簇 D 实测（见 §3）：`billion-context-dsh` / `acp-kernel` 写 `tier` / `kernelBlockId` / `parentBlockIds` / `directMessageIds` / `effectiveMessageIds` |

也就是说：**平台侧的写契约是「你可以加」**。

### 1.2 读侧：同一批字段一律「清单外即拒载」

| 闸门 | 抛出 | 粒度 |
| --- | --- | --- |
| `validateStoredEvents()`（旧名 `assertEventsSupported()`），`@deepseek-ai/dsh-session-persistence/lib/index.js` | `SessionFormatUnsupportedError`（`... unknown to this harness and not marked ignorable; refusing to interpret the log — it was likely written by a newer harness`） | **整个会话**拒载 |
| `assertReleasedV0Keys()`，`@deepseek-ai/dsh-session-format-v0-to-v1/lib/index.js` | `SessionFormatError`（`<label> has unexpected member "tier"`） | **整个会话**拒载（不丢弃、不降级） |
| `readZstdPrefix()` 解码/校验失败，`@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js` | 由 `decodeStoredLog()` 的 catch 包成 `SessionPersistenceCorruptionError`（`stored log is corrupt: ...`）；仅 `SessionFormatUnsupportedError` 被原样透传并补上 raw log 路径 | **整个会话**判损坏 |

上游把这些拒载写成 `@deepseek-ai/dsh-session-query` 的
`SessionQueryError("failed to observe session \"…\"", "SESSION_QUERY_PERSISTENCE_FAILED")`，
用户看到的是「历史加载失败」。完整串起来是这样（现场原样）：

```
failed to observe session "…": @deepseek-ai/dsh-session-format-v0-to-v1 refuses this
format v0 Session: compaction/summary 82013 data has unexpected member "tier";
source v0 artifact remains unchanged
```

（包装点：`dsh-session-format/lib/index.js:254` 生成
`${migration.name} refuses this format v${migration.fromVersion} ${subject}: ${detail}`；
`dsh-session-persistence-jsonl/lib/index.js` 的 `generationFailure()` 追加
`; source v${error.fromVersion} artifact remains unchanged (raw log: …)`。）

### 1.3 不对称的后果

`dsh-session-format-v0-to-v1` 的头注释自己说清了冻结语义：

```
Frozen released-v0 event and payload-member inventory.
Every listed member is preserved by the identity edge.
```

**「清单内才保留」在迁移里是可证明的数据丢失**：迁移是一次性重写
（`encodeMigrationRows()` 只写 `format.encodeEvent(...)` 出来的行，并落
`sessionFormatLogFilename(version)` → `session.v<N>.jsonl[.zstd]` 代际文件）。
所以「读者不认识 → 剥离该成员」不是保守，而是**在第一次跨代迁移时物理销毁写侧插件的语义**。

而「读者不认识 → 整条拒载」也不是安全，而是把**一个插件的一次写入**放大成
**该用户全部历史在任意 reader 上的永久不可用**。两个方向都错，正解是第三个方向：
**准入 + 原样携带 + 一次性告警**（§4）。

> 上游会有的反问，先答在这里：`SessionEvent.ignorable` 的注释承认「忘记标 ignorable
> 宁可 over-refuse（an inconvenience）也不能静默 resume 一个被掏空的会话」。我们完全同意
> 「不能静默掏空」——但 over-refuse 的实测代价是 **54 个会话里 19 个永久打不开**，
> 这不是 inconvenience，是数据不可达。诉求是把「拒绝」换成「带着未知部分原样读 +
> 显式告警」，两边都不静默。

---

## 2. 四个簇：靶点 / 失效机理 / 修法 / 严重度

> 每一节的「修法」都写到可以照着重新做出 patch 的程度：给出**靶函数、锚点字面、
> 改前/改后逻辑**，以及**哪些语义刻意不动**（这是当年评审的通过条件，也是上游 PR 的
> 安全边界）。

### 簇 A：`session-header-scan-guard` — header 扫描无上限，一个坏文件顶爆内核

- **靶文件**：`@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js`
- **失效机理（为什么是 fail-closed 的一种表现）**：`listArtifacts()` 列会话时
  对**每个**会话文件走一次 header 解压；`readFirstZstdLine()` 的累积缓冲
  **没有上限**——遇到「损坏或正在写入中、首帧永不完整」的文件，会把整个文件
  持续 `Buffer.concat` 进内存反复扫。打开子代理 → `persistence.list()` → 全量扫描
  **291 个会话文件**，每个都 zstd 解压 header，在内存吃紧时把内核 node 进程
  **OOM 打死**：不是「这个会话读不了」，而是「整个内核连带所有会话都没了」。
- **我们的修法（两层，注入点各自唯一）**：

  1. **读取上限**——锚点 `readFirstZstdLine` 累积那行
     `content = Buffer.concat([content, chunk.subarray(0, bytesRead)]);`，其后追加：

     ```js
     const ZSTD_HEADER_SCAN_MAX_BYTES = 256 * 1024;
     // …
     if (content.length > ZSTD_HEADER_SCAN_MAX_BYTES)
       throw new Error(`corrupt Zstandard session log: no complete header frame within ${ZSTD_HEADER_SCAN_MAX_BYTES} bytes`);
     ```

     抛错**故意**落在 `listArtifacts()` 既有 corrupt-guard 的 catch 覆盖面内 →
     降级成 warn + 跳过该文件，启动扫描不再被击穿。

  2. **header 扫描缓存**——模块级 `Map` + FIFO 上限 4096，按
     `(path, size, mtimeNs)` 做身份；注入 `readHeaderLineCached(path, signal)`，
     并把 `listArtifacts` 里那一条读表达式
     `this.compression === "zstd" ? await this.readFirstZstdLine(selected.sourcePath, signal) : await this.readFirstLine(selected.sourcePath, signal)`
     改写为 `await this.readHeaderLineCached(selected.sourcePath, signal)`。
     二次 `list()` / 刷新列表**零解码**；`size`/`mtimeNs` 任一变化即失效重读，
     不掩盖真实变更；解析与身份校验仍走 `listArtifacts` 原链路。

     > 锚点分两代：旧内核是 `/** Read and validate only the independently compressed header frame. */`，
     > 0.1.5-rc.1 起改为 `/** Read only the header frame; compression failures reject as corruption, while I/O and cancellation propagate. */`，
     > 且读取对象从 `path` 变成 `selected.sourcePath`。

- **严重度 / 复现**：中（可用性）。复现姿势：往会话目录放一个 zstd 首帧永不完整的
  文件（写入中截断即可），触发一次全量 `list()`，观察 `readFirstZstdLine` 的 RSS 单调上涨。
  这条和簇 B/C/D 的关系是：**同一个「读路径不许失败」的假设在列目录时被换成了
  「读路径可以把进程弄没」**，两者都源于「损坏只有拒载这一种回答」。

### 簇 B：`session-load-graceful` — 尾部损坏击穿整条历史加载，且降级会销毁完好帧

- **靶文件**：`@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js`
  （函数 `readZstdPrefix`，调用链 `readStoredLog` → `decodeStoredLog` → `readZstdPrefix`，
  消费端 `persistContiguous` → `storage.truncateTornTail` / `persistBatch`）
- **失效机理**：自动压缩（auto-compaction）会把一个多事件批次
  （`compaction/start`、`compaction/summary`、`user/message` replace、`compaction/end`）
  **一次性追加落盘**，帧体比单事件帧大得多。中断/崩溃后可能留下两类残骸：
  - 「结构撕裂的最后一帧」——上游 torn-tail 恢复已经兜住；
  - 「**结构完整但校验失败 / seq 断档 / 中部非法 magic**」的帧——`readZstdPrefix`
    直接抛，而它的读路径不像 `listArtifacts` 有 corrupt-guard，
    `decodeStoredLog` 的 catch 会把它包成 `SessionPersistenceCorruptionError`
    → **整条历史加载失败**，随后渲染进程跟着崩。

    注意一个容易看漏的点：当前 pin 的 `readZstdPrefix` 里
    `new SessionLogScanner(headerFrame.value)` 用的是默认 `recovery = "recoverable"`，
    但 `consumeEventLine()` 在**任何** recovery 模式下都把
    `SessionFormatUnsupportedMigrationError` 原样重抛：

    ```js
    if (error instanceof SessionFormatUnsupportedMigrationError$1)
      throw new SessionFormatUnsupportedError(error.message);
    ```

    即：**可恢复模式对「不认识」这一类失效是不生效的**——这正是我们希望上游改的地方。

- **我们的修法（保守：只在损坏落在尾巴上时降级）**：
  1. 把 `const scanner = new SessionLogScanner(headerFrame.value);` 的声明提升到函数作用域
     （`let scanner;`），并自持一个 `loadFrameIndex`（在 `remainingFrames -= 1;` 处 `+= 1`），
     用于定位「第几帧抛的错」。
  2. 把 `catch` 的「无条件 rethrow」换成**末帧守卫 + 降级返回**：

     ```js
     // 仅当损坏帧就是最后一个帧（或循环已收尾 = 物理撕裂尾）时才降级
     if (scanner !== void 0 && frames !== void 0 &&
         (loadFrameIndex === void 0 || loadFrameIndex >= frames.length - 1)) {
       const corruptStart = loadFrameIndex !== void 0 && loadFrameIndex < frames.length
         ? frames[loadFrameIndex].start : void 0;
       const truncateTo = corruptStart ?? (frames.length > 0 ? frames[frames.length - 1].end : 0);
       console.warn(`[dsh-session-persistence] degraded session load to last complete frame (byte ${truncateTo}): …`);
       const prefix = scanner.finish();
       return { meta: prefix.meta, inheritedEventCount: prefix.inheritedEventCount,
                events: prefix.events, tornTruncateTo: truncateTo, recoveredTail: [] };
     }
     throw error;
     ```

  3. header 帧损坏**仍然致命**（scanner 未建立即重抛）——不掩盖「这文件根本不是会话日志」。
- **v1→v2→v3 的两次收窄，是这条补丁最有价值的部分，上游 PR 请直接采纳**：
  - **v1 的错**（0.5.4~0.6.1 在野）：不区分损坏帧位置。`truncateTo` 是**就地截盘**，
    中部帧校验失败也照样返回降级 → `commitRepair`/`truncateTornTail` 把该帧**之后的完好帧
    一并销毁**。补丁本意是「多读点」，实际变成「少一截且不合上游契约的历史」。
    v2 因此加末帧守卫，并引用上游 torn-tail 自己的契约句：
    *"A torn record in any earlier frame ... remains a hard corruption error."*
  - **v2 的死代码问题**（0.1.5-rc.1 契约换代）：返回契约从嵌套
    `{tornMarker:{truncateTo,recoveredEvents}}` 改成扁平
    `tornTruncateTo` / `recoveredTail`（rc.1 pristine 全文 `tornMarker` 出现 **0 次**）。
    锚点三态判定仍返回 `changed`（锚点行没变），但注入体**没人读** →
    降级只落在内存里，损坏尾既不截盘也不回灌；并且缺 rc.1 必填的
    `inheritedEventCount`，seeded 会话会在 `toHeaderLine` 硬抛
    `seeded session header requires an inherited event count`。v3 只改返回体形态修这个。
  - **教训（我们建议上游也写进契约测试）**：*凡注入体含「返回给上游消费」的对象字面量，
    必须比对该字段名集在消费端的出现次数，而不是只看锚点在不在。*
- **严重度 / 复现**：高。我们侧的成因链在
  `dsh-desktop/docs/audit-host-0.2.0.md` 有实名记录（M1/M2 两条）：
  启动失败重试会累积多个 harness 进程**同时写同一 `DSH_HOME`**（M1），
  `killTree` 用 `taskkill /F` 无宽限期强杀，**正在写入的 `session.jsonl.zstd`
  尾部被撕裂**（M2）。**但这类形状不是壳层专属**：断电、OS 强杀、杀软隔离、
  磁盘满都会产出同一个形态。读路径对它的正确回答不应该是「整条判死刑」。

### 簇 C：`session-unknown-event-tolerance` — 一条未来类型事件让整份历史拒载

- **靶文件**：`@deepseek-ai/dsh-session-persistence/lib/index.js`
  （函数 `validateStoredEvents(meta, events, location)`；0.1.5-rc.1 之前是类方法
  `assertEventsSupported(meta, events)`，rc.1 起改顶层函数并加 `location` 形参、
  `this.unsupported(...)` 改模块级 `unsupported(...)`）
- **失效机理（改前逐字）**：

  ```js
  function validateStoredEvents(meta, events, location) {
    for (const event of events) {
      if (!KNOWN_SESSION_EVENT_TYPES.has(event.type) && event.ignorable !== true)
        throw unsupported(`session "${meta.id}" contains event type "${event.type}" (seq ${event.seq}) unknown to this harness and not marked ignorable; refusing to interpret the log — it was likely written by a newer harness`, location);
      if (event.type === "request/header") { /* 旧 reason "fallback" 另一次拒载 */ }
    }
  ```

  一条新版 harness 写入的 `slice/digest`（或任何本 build 不认识的类型）→
  `SessionFormatUnsupportedError` → 整个 `observe` 拒载 → 用户降级/换装后
  **老对话全部打不开**。
- **我们的修法**：整方法替换为「收集 + 跳过 + 一次性告警」，**只放行未知事件这一支**：

  ```js
  const dshUnknown = [];
  for (const event of events) {
    if (!KNOWN_SESSION_EVENT_TYPES.has(event.type) && event.ignorable !== true) {
      dshUnknown.push(`${event.type}@${event.seq}`);
      continue;
    }
    if (event.type === "request/header") { /* 原样保留的 legacy reason 拒载 */ }
  }
  if (dshUnknown.length !== 0)
    console.warn(`[dsh-unknown-event-tolerance] session "${meta.id}": skipping ${dshUnknown.length} unknown event(s) (${dshUnknown.slice(0, 5).join(", ")}${dshUnknown.length > 5 ? " …" : ""}) instead of refusing to load — the session may render with gaps if a newer harness wrote semantic events.`);
  ```

  刻意不动的三处（评审通过条件）：
  - `assertVersion()` 的**格式版本**判定仍 fail-closed，且沿用上游的方向感知文案
    `sessionFormatVersionRefusal()`（新版日志→「upgrade the harness」，旧版→「no upgrade path」）；
  - `request/header` 的 `reason === "fallback"` 退役形态仍照拒；
  - 告警**诚实写明**「若含语义事件渲染可能有缺口」，不假装无损。
  - 跳过在每次读取时一致发生 → 重建语义自洽（同一文件两次读结果相同）。
- **严重度 / 复现**：高（跨版本日常路径）。最小复现：用 N+1 版本写一条
  `type: "slice/digest"`、不带 `ignorable` 的事件，再用 N 版本 `open` 该会话 → 拒载。
  这条的杀伤面最大，因为它**不需要文件损坏**，只需要装过一次更新的插件或新版 harness。

### 簇 D：`released-v0-history-recovery` — 冻结成员清单把第三方字段判成损坏

- **靶文件**：`@deepseek-ai/dsh-session-format-v0-to-v1/lib/index.js`
  （`RELEASED_V0_EVENT_DISPOSITIONS` 表 + `assertReleasedEventPayload()`；
  执法函数是同文件的 `assertReleasedV0Keys(record, required, optional, label)`）
- **失效机理**：`dsh-session-format-v0-to-v1` 是随内核换代新增的
  **frozen "released-v0" 编解码器**，它冻结了**第一方 v0 构建当时写出的载荷成员清单**；
  清单外成员一律 `SessionFormatError` 整条拒载——不丢弃、不降级：

  ```js
  function assertReleasedV0Keys(record, required, optional = [], label) {
    const allowed = new Set([...required, ...optional]);
    const unexpected = Object.keys(record).find((key) => !allowed.has(key));
    if (unexpected !== void 0)
      throw new SessionFormatError(`${label} has unexpected member ${JSON.stringify(unexpected)}`);
    const missing = required.find((key) => !Object.hasOwn(record, key));
    if (missing !== void 0)
      throw new SessionFormatError(`${label} lacks required member ${JSON.stringify(missing)}`);
  }
  ```

  跨代留存的会话因此**永久读不回**。同类形态在
  `@deepseek-ai/dsh-session-format-v1-to-v2/lib/index.js` 也有
  （`assistant/chunk <seq> has unexpected member …`，实测该文件命中 1 处；
  v2→v3 / v3→v4 无该形态）。

- **三类实测被拒的载荷成员**（全部来自真实用户机，非构造）：

  | # | 位置 | 被拒成员 | 写入方 | 语义 |
  | --- | --- | --- | --- | --- |
  | 1 | `compaction/summary` 的 `data` | `tier`、`kernelBlockId`、`parentBlockIds`、`directMessageIds`、`effectiveMessageIds` | 第三方压缩插件 **`billion-context-dsh` / `acp-kernel`** 自带的块账本 | 块身份与账本；**剥掉即丢插件语义** |
  | 2 | `permission/preset` 的 `data` | `origin`（实测值 `"default"`） | 早期写入方 | 展示/溯源信息，准入不影响语义 |
  | 3 | `subagent/descriptor` 的 `data.version` | `version: 2` | 早期 v0 构建 | 字段集与 v3 完全相同（v3 子集） |

  第 3 类是**单纯过度收紧**：上游只在 **v0 分支**拒 `version:2`，
  **v1 分支直接 `return` 容忍**，而下游 v2→v3 又硬要求 3。

- **我们的修法：只扩准入清单，成员原样保留到 v3；必填/类型/形状校验一律不放宽**。

  1. `compaction/summary` 的 `disposition` 第二参（optional）追加 5 个块账本字段：

     ```js
     "compaction/summary": disposition([
       "compactionId","summary","shadowedRange","shadowedSeqs","shadowedTokenCount","provider","model"
     ], [
       "sourceCommandId","maxTokens","usage","rawOutput","llmStreamCall",
       // 第三方压缩插件 billion-context-dsh(acp-kernel) 的块账本字段。
       // 原样保留到 v3，不剥离、不重写 —— 剥掉会丢插件的 tier/块身份语义。
       "tier","kernelBlockId","parentBlockIds","directMessageIds","effectiveMessageIds"
     ]),
     ```

  2. `permission/preset` 从 `disposition(["preset"])` 扩成 `disposition(["preset"], ["origin"])`。
  3. 描述符分支：**盖章版本后继续走原有严格校验**（不 `return`、不跳过）：

     ```js
     if (event.type === "subagent/descriptor" && data["version"] !== 3) {
       const descriptorVersion = sessionFormatCount(data["version"], `${event.type} ${event.seq} version`);
       if (version === 0 && descriptorVersion === 2) data["version"] = 3;   // ← 新增：只盖章
       else if (version === 0) throw new SessionFormatUnsupportedMigrationError(`${event.type} ${event.seq} uses unsupported descriptor version ${descriptorVersion}`);
       else return;                                                        // ← v1 分支逐字不变
     }
     ```

  三处**一起成 / 一起不成**（任一锚点缺失即整体 `anchor-missing` 不落地），
  避免出现「准入放宽了但校验没对齐」的半投状态。
  落地后仍受原严格校验，`RELEASED_V0_EVENT_DISPOSITIONS` 的
  `Every listed member is preserved by the identity edge` 使这 6 个成员
  **活着走完 v0→v1→v2→v3 迁移**。

- **被否决的方案（写下来防重犯，也帮上游省事）**：把 `assertReleasedV0Keys`
  的未知成员改成一律 `delete`。错在两处：
  ① 迁移是一次性重写，`delete` 等于在第一次跨代迁移时**物理摧毁** `billion-context-dsh`
  的块账本（`tier`/块身份是它的语义依赖）；
  ② 覆盖不到第 2、3 类（`origin` 与描述符版本压根不是同一失效形态）。
  **准入只能按来源逐条白名单化，不能一刀切放宽。**
  回归锁：反向控制三条钉住「没把校验关掉」——未知垃圾成员仍
  `has unexpected member`、未知描述符版本仍 `unsupported descriptor version`、
  必填缺失仍 `lacks required member`；并断言产物里不得出现 `delete record[key]`。
- **严重度 / 复现**：**最高（数据不可达）**。现场一台机器 **54 个会话里 19 个读不回**。
  复现：任取一个含第三方 `compaction/summary` 事件的 v0 会话，用带
  `dsh-session-format-v0-to-v1` 的内核打开 → `has unexpected member "tier"`。
  生效条件值得提醒用户：改的是已载入 ESM 缓存的模块，**需重启**；重启后这些会话首次
  加载会完成 v0→当前代迁移并写出新代际文件（正常路径）。

---

## 3. 现场证据汇总

| 证据 | 数值 | 记录处 |
| --- | --- | --- |
| 一台机器 54 个会话中读不回 | **19 个** | 本仓库 `dsh-desktop/CHANGELOG.md`「fix(session)：旧对话『历史加载失败』——v0→v1 迁移整条拒载（0.6.4 在野）」；`patch-registry.js` / `runtime-patches.js` 簇 D 注释 |
| 三类实测来源的分布 | 块账本 **17 个会话**、`origin` **4 个**、`descriptor version:2` **14 个** | 同上（CHANGELOG 0.6.4 条目） |
| 一次全量 header 扫描的文件数 | **291 个会话文件** | `patch-registry.js` / `patch-adapters.js` 簇 A 注释（K5 根因记录） |
| 症状串 | `failed to observe session "…": @deepseek-ai/dsh-session-format-v0-to-v1 refuses this format v0 Session: compaction/summary 82013 data has unexpected member "tier"; source v0 artifact remains unchanged` | CHANGELOG 0.6.4 条目（原样） |
| 撕裂尾/拼接日志的本地成因 | 同 `DSH_HOME` 双写（启动重试泄漏孤儿进程）、`taskkill /F` 无宽限期 | `dsh-desktop/docs/audit-host-0.2.0.md` M1/M2 |

> **口径提醒**：三类分布 17 + 4 + 14 = 35 > 19。原记录未写明统计口径；最自然的解释是
> 一个会话可同时命中多类（例如带第三方块账本的会话往往也带 subagent 描述符），
> 19 是「至少坏一处」的去重会话数。**这一点标 未核实**，提 issue 时按
> 「19/54 不可读 + 三类来源」引用，不要引用逐类相加的总数。

---

## 4. 具体诉求（建议上游按此实现）

1. **把 unknown-*event* 与 unknown-*member* 处理改成「加性容忍」（additively tolerant）**，
   三者同时成立：
   - **skip 不丢**：未知事件类型不进重建，但**原样保留**在会话产物里
     （inert record），后续升级 reader 还能捞回来；未知载荷成员**留在对象上随迁移携带**
     （等价于把 `RELEASED_V0_*` 的准入从「白名单」改成「必填 + 形状 + 保留其余」）。
   - **warn 一次**：固定前缀（我们用的是 `[dsh-unknown-event-tolerance]`）+
     列 `type@seq`（截前 5 条）+ 明说「若含语义事件渲染可能有缺口」。
   - **格式版本检查保持 fail-closed**：`assertVersion()` /
     `sessionFormatVersionRefusal()` 一字不改——真正不兼容的日志照旧拒载，
     用户看到的是「升级 harness」而不是「损坏」。
     这条区分是本 issue 的全部要点：**版本 = 契约不匹配 → 拒；类型/成员 = 词汇不认识 → 容忍并保留。**
2. **让 `recovery: "recoverable"` 对「不认识」这一类真正生效**。机制上游已经有了
   （`SessionLogScanner` 的 recoverable 分支会跳过畸形行、`createRestore({recovery:"recoverable"})`
   已在迁移路径使用），只差把 `consumeEventLine()` 里那句无条件
   `throw new SessionFormatUnsupportedError(error.message)` 收进 strict 分支。
3. **在读路径补 corrupt-tail 降级 + 修复标记**（对应簇 B）：解码/校验失败时
   「加载到最后一个完整帧」，并沿用已有的扁平 torn-tail 契约
   （`tornTruncateTo` 驱动 `truncateTornTail` 截盘、`recoveredTail` 驱动 `persistBatch` 回灌）。
   两条硬性边界请照抄我们的守卫：
   - **只在损坏落在最后一帧时降级**（中帧损坏必须仍是硬错误，否则就地截盘会销毁完好帧）；
   - **header 帧损坏仍致命**。
   并额外落一个**可观测的修复标记**（我们目前只有 `console.warn`，没有磁盘侧痕迹）：
   建议在 header 或独立 marker 记录「于 T 因 R 截断至 byte N」，让"这条历史被修过"可查。
4. **给第三方事件一个正式的兼容面**：至少把「插件写事件必须 `ignorable: true`」写进
   插件契约并在 loader 侧强制/校验（本仓库的插件契约文档
   `dsh-tauri/contracts/plugin-contract.md` 已按此口径自查）。
   上游曾以「事件名注册不分类 omission 安全性、且会让读取依赖组合」为由否决注册表——
   我们同意否决注册表，但**否决注册表不等于保留整条拒载**：保留 + 告警同样不依赖组合。
5. **文档口径**：`types.d.ts` 的 `ignorable` 注释说忘记标记只会
   over-refuse（an inconvenience）。请把实测代价补进去：**单台机器 19/54 会话永久不可读**。

---

## 5. 可随 issue 附带的诊断工具与现场记录

以下脚本在本仓库可直接跑（纯 `node:zlib` + `node:fs`，不依赖我们的壳），
适合作为 issue 的 repro/取证附件：

| 脚本 | 作用 |
| --- | --- |
| `dsh-desktop/scripts/repair-session-log.js` | 拼接/撕裂会话日志的**离线修复器**：解帧 → 展开 packed chunk 行（镜像上游 `decodeStorageRecord` 的 `seq0 + k` 语义）→ 校验 seq 连续性 → 定位活世代起点 → 密度校验 → 陈旧世代要求以 `turn/end` 收尾 → 合成缺失 seed 事件、把陈旧世代另存为独立会话、备份原文件。**任一步不过即 ABORT 不写盘** |
| `dsh-desktop/scripts/analyze-session-log.js` | 单文件解全帧 + 定位 seq 断档（镜像上游 reader 语义），输出 `frames=N tornStart=…` |
| `dsh-desktop/scripts/inspect-session.js` | 多帧会话日志的事件词表盘点（`FRAMES=`/`LINES=`/逐类型计数）；历史上只解首帧的问题已修，记录见 `dsh-desktop/ISSUE_COVERAGE.md` 第 74 条 |
| `dsh-desktop/session-watcher.js` 的 `scanZstdFrames()` | 上面三个脚本共用的 zstd 帧扫描器唯一实现（历史上三份副本已收口） |

配套现场记录：`dsh-desktop/CHANGELOG.md`（0.6.4 条目，含完整症状串与三类计数）、
`dsh-desktop/docs/audit-host-0.2.0.md`（M1/M2 撕裂尾本地成因）、
`dsh-desktop/README.md`（`inspect-session.js` 的用法行）。

> 未核实项：`dsh-desktop/docs/troubleshooting.md` **没有**会话历史加载失败的现场条目
> （现有章节是「报障三件套 / 症状对照表 / macOS 损坏 / Windows 覆盖安装 /
> v0.6.4 侧栏不渲染」）。转录任务书里提到该文件可能有相关报告，实测无——
> 现场证据请引用上面 CHANGELOG 与 audit 文档。

---

## 6. 为什么这是 bug 而不是设计偏好

1. **它违反上游自己声明的读语义**。`SessionFormatUnsupportedError` 的注释写着
   *"The stored log is intact but this runtime cannot faithfully interpret it ...
   nothing is damaged; the raw log remains readable"*——但用户侧表现是历史**永久不可达**、
   无任何恢复入口，"remains readable" 对终端用户为假。
2. **同一失效在相邻代码里有两种相反处理**，说明是收紧过头而非统一策略：
   `subagent/descriptor` 的 `version:2` 在 v1 分支被 `return` 容忍、在 v0 分支被拒；
   `recovery: "recoverable"` 会跳过畸形行、却对「不认识」无条件重抛。
3. **代价与收益不对称**：拒载换来的是「绝不静默掏空」，但**加性容忍（保留 + 告警 +
   版本仍拒）**同样不静默，却不销毁任何东西。
4. **失效面由第三方决定，而平台把风险转嫁给用户数据**：写侧契约开放（§1.1），
   读侧冻结（§1.2）——一个插件的一次写入即可让用户全部历史砖化。这就是生态数据丢失向量。
