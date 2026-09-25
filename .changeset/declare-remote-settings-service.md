---
"@dsh-pack/dsh-conversation-tweaks": patch
"@dsh-pack/dsh-quest-ui": patch
"@dsh-pack/dsh-vision": patch
"@dsh-pack/dsh-prompt-custom": patch
"@dsh-pack/dsh-subagent-lens": patch
"@dsh-pack/dsh-openclaw-bridge": patch
---

修「设置开关永久禁用、控制台零报错」。

上一轮把页内半边从幽灵的 `ctx.settingsScope` 换成 `ctx.remote.settings` 之后，
真浏览器里设置行**渲染出来了但点不动**：`disabled: true`，且控制台一行错误都没有。

根因：`inject` 里只声明了 `"remote"`，没声明 `"remote.settings"`。
这种时候 `ctx.remote.settings` 拿到的不是 undefined（所以不抛错），而是一个
**永不 settle 的代理** —— `describe()` 的 promise 既不 resolve 也不 reject，
于是快照永远停在 `loading`，控件永久禁用。
官方 5 个用它的包（dsh-client-ui-settings / -general / -models /
permission-presets / agent-preset）全都同时声明两个名字。

- 6 个包的 `inject` 补上 `"remote.settings"`。
- `tools/audit/settings-api.js` 加第 ④ 条判据：调 `ctx.remote.settings.*` 却没声明
  `"remote.settings"` 即 error；配套两条反证用例（缺声明必红、补上必绿）。
- AGENTS.md 契约 11 记下这条，因为它的不失败症状是「什么都不发生」，最难查。

端到端实测（隔离实例、真浏览器、真点击）：
开关可点 → `aria-checked` 翻转 → `data-dsh-quiet-output="1"` 立即生效 →
**整页重载后仍为 true** → 临时 profile 的 `cordis.patch.yml` 里出现
`- id: conversation-tweaks / config: quietOutput: true`（写路径经内核 config editor、
按 profile 条目 id 落盘）。
