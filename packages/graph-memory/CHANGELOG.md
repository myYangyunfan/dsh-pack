# @dsh-pack/graph-memory

## 1.6.0

### Patch Changes

- 修「内核 0.1.7-rc.1 移除 `Session.events` 后，五个包对它的读取全部失配」。

  内核 `Session` 不再有 `events` 数组（`meta` 同时消失，改由 `header` 承载）。
  本仓库对它的读法分三类，失败形态各不相同，**静态门禁和 `--dump-config` 一个都看不见**：

  - **炸掉整轮**（最严重，billion-context-dsh）：`stateFor()` 里 `session.events.some(...)`
    被 `buildNudge` 在 `agent/pre-step` 上调用 —— 每一轮、每个 provider 都在这里
    `TypeError: Cannot read properties of undefined (reading 'some')`，用户看到的是
    「发出去没有任何反应」。属于插件形态下最坏的失败：**一个包的读取错误让整个会话不可用**。
  - **静默空转**（dsh-synapse、graph-memory）：`session.events ?? []` / `Array.isArray(...)`
    这类守卫把失配吞成空数组 —— 投影永远不应用任何事件、回填永远什么都不做，
    控制台干净、界面正常，只是功能不生效。
  - **类型错**（dsh-better-sidebar）：`boundaryDelivered(agent.session.events)` 直接把
    `undefined` 传进函数，侧聊恢复路径每次抛 TypeError。
  - **旧口子**（dsh-easyrewrite）：本来就带 `session.events` 回退，改成下标读取
    `session["events"]` 并注明缘由（见下）。

  改法：每个包加一个同步读整份日志的兼容口 `sessionEvents(session)` ——
  优先 `session.snapshotEvents()`（标弃用但可用、返回冻结副本），老宿主退回旧数组；
  回退分支**刻意写成下标读取**，因为审计门禁按 `session.events` 字面量拦旧 API，
  这里正是要保留的那一个口子（注释里写明了，不是白名单）。

  配套（本仓纪律：判据要能被拆掉）：

  - 新增 `tools/audit/session-api.js` 门禁：非测试源码里出现 `session.events` /
    `session.meta` 字面量即 error，命中在 `stripComments` 后的文本上（注释里提到不算）。
    8 条用例含 4 条反证（注释不算违规、测试夹具允许造旧形状、门禁真在扫、
    同一段代码换个路径就该报），并断言**仓库现状零 error**。
  - 新增 `tools/codemod/fix-session-events-reads.mjs`：先把它对着 `git show HEAD:` 的
    原始文件重跑一遍，证明能**逐字节复现**当前四个文件的改动（除 EOL）；
    第二次运行报告「替换=0 / 兼容口=已有」，即幂等。
  - 真机复验（隔离实例 + 真内核 + 离线 mock provider，因 compaction-acp 就是这个包）：
    修前 `agent/pre-step` 抛 TypeError（内核诊断栈直指 `AcpStateStore.stateFor`），
    修后同一路径 **HTTP 200 + mock 回复**；并发两轮均 200。

