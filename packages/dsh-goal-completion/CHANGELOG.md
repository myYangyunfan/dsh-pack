# @deepseek-ai/dsh-goal-completion

## 0.1.0

- 内核右栏新增「目标收尾」标签页：显示当前会话目标的状态机（`phase` 四态 +
  `activation` + 轮次 / 修订 / 更新时间，`blocked` 显示 code 与原因原文），
  并提供**手动标记完成**——`remote.goals.complete` 这个动词官方 GoalBar 没有暴露
  （它只有 save / cancel / pause / resume / edit / clear），目标过去只能等 agent 自己收尾。
- 口径：会话取自右栏标签槽的 `inject(sessionId)`；目标本体读会话投影 `faceOf("goal")` 的
  `goal` 那份，`activation` 从 `remote.goals.get` 补（信封 `{ok:true, value}` 里的 `value`，
  且只在 `id`+`revision` 与投影对齐时才采纳），两条线都缺才算无目标；写状态带
  `{id, revision}` 的 CAS，被拒时显示原文并重新读取，不用陈旧 revision 重试。
- 完成是终态（phase 机里没有回退路径），按钮两次点击确认、8 秒窗口自动取消，
  标签页不自动弹出；入口是右栏标签条「＋新标签页」打开的引导页里那枚胶囊。
- 界面全部走内核 sanctioned 面：`ctx.locale.register/bind` 字典命名空间（槽位声明
  `locale: NS` 后由 renderer 注入 `t`，切语言整体重渲染），控件用原语 `Tag`（八档语义色）
  与 `Button`（四档 variant），不覆盖原语配色。
- `sidebarRightTabs` 用 `ctx.inject` 的可选接法：原生右栏缺席的内核上只是不注册标签，
  不会让整插件装配失败。
