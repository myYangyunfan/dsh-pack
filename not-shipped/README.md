# not-shipped —— 源码留着，但不由我们发布

这里的插件**不在 DSH Pack 的发布面**里：已从 `tools/tiers.json` 摘掉、元包不再插入它们的
loader 行、`tools/audit` 与 `tools/itest/pack-audit.mjs` 也不再扫它们（扫描根是 `packages/`）。

代码原样保留是为了**对照与后续重制**，不是留着待发布。

## dsh-super-injector：上游是幽灵，且我们改过它的源码

| 查的东西 | 结果 |
| --- | --- |
| npm registry（`dsh-super-injector` / `@dsh-external/dsh-super-injector`） | **不存在**（`Not found`） |
| 社区目录里给的上游地址 | `github.com/dsh-external/dsh-super-injector` → **404** |
| 目录条目的许可证字段 | 未标 |
| 我们 manifest 里写的 | `license: "BSD-3-Clause"`，但**包内没有 LICENSE 文件**，也没有 author / repository / homepage |
| 我们是否改动过 | **改过**：`9c5d91c fix(super-injector): 六处写穿 DSH_HOME 的 homedir() 硬编码改为跟随内核 home` |

结论：BSD-3-Clause 要求随包分发**原始版权声明与免责条款**——既没有上游原文可引，
又是我们改过的代码。这种情况下由我们补一份 BSD-3 文本并填一个署名，等于**伪造许可来源**。
所以不发。

要恢复发布，需要先确定真正的作者与许可证原文（不是由我们代拟），或把代码重写成
不含上游受版权保护内容的实现。

## dsh-side-session：上游真实存在，但**没有 LICENSE**

| 查的东西 | 结果 |
| --- | --- |
| 上游仓库 | `github.com/hzhz314159/dsh-side-session`，存在 |
| 仓库描述 | 「DSH 临时会话插件：独立悬浮窗，自动导入当前主对话上下文（实时订阅），不污染主会话的临时追问」—— 与我们内置的那个逐字吻合，确认是同一项目 |
| LICENSE 文件 | **没有** |
| npm registry | 不存在 |
| 我们 manifest 里写的 | `license: "MIT"`，无 author / repository |

**没有许可证不等于「可以随便用」**：默认是所有权利保留。我们把它标成 MIT 再分发是错的，
之前那份 MIT 标记本身就是不实标注。所以不发。

用户如果想用，可以自己在官方客户端「设置 → 插件 → GitHub 仓库地址」填
`https://github.com/hzhz314159/dsh-side-session` 直接装上游 —— 那是**他与原作者之间**的授权关系，
不需要我们冒名再分发。

想恢复发布，只有两条正路：向作者取得书面许可（并请他自己在仓库加 LICENSE），或重写实现。

## 为什么允许这种代码留在仓库里

保留源码是为了「对照上游 v0.2.3→v0.3.1 的演进」和「将来重制时知道差异在哪」。
留在 `packages/` 会被审计与打包门禁扫到，也就等于假装它是可发布的 ——
所以物理上移出 `packages/`，让**门禁的绿灯只覆盖我们真能发的东西**。
