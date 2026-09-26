---
"@dsh-pack/dsh-reasoning-effort": patch
---

修「模型的 reasoning-effort 诊断一直不出结果，控制台只有一行 405」。

真机复现：打开自定义 provider 模型的诊断面板，控制台出现
`Failed to load resource: 405 (Method Not Allowed) http://127.0.0.1:3080/dsh-reasoning-effort/diagnose`，
面板不出内容。那个 405 不是「方法用错」，而是**路由根本没挂上** —— POST 落到了静态处理器
（`dsh-client-modules` 对非 GET/HEAD 一律回 405）。

根因在内核：宿主半边走 `ctx.connection.rpc.handle(channel, handler)`，而
`@deepseek-ai/dsh-client-connection` 的插件 `inject` 只有 `["credentials"]`，它自己的
`HostConnectionService.register()` 里却要 `owner.webServer.register(route)`（owner 就是
服务自己的 ctx）⇒ cordis 隔离层抛 `cannot get property without inject`，注册从未生效。
失败形态是最难查的那类**静默**：apply 不报错、J4 只看日志也看不见；页内
`rpc.call` 又把 HTTP 405 吞成 `null`，UI 表现成「点了没反应」。
内核自己的 `/api` 路由也是挂在 `ctx.inject(["webServer"], …)` 里的（同一个 `apply()`）。

- 通道改为挂到本插件自己 inject 的 `webServer` 上（`lib/web-rpc.js`），逐分支复刻内核
  `/api` 的传输语义（404 / 415 / 400 / 信封失败回 200 + `server-response` / 500），
  页内半边不动 —— 它用的就是内核原生 `connection.rpc.call`。
- 栅栏沿用内核语义：`connection.requestRejection` 可用就用它（**方法形式**调用，
  丢 this 会把所有请求误判 forbidden，见 dsh-pocket issue #117），
  否则退到 loopback + `sec-fetch-site`/Origin 校验。
- `failResult` 补上 `error.details`：页内 `parseConnectionResponse` 校验
  `isRecord(error.details)`，缺了它连失败信封都被抛掉、错误再次静默成 null。
  反证用例把这条钉住（去掉 details 必被内核判据拒）。

验证（不靠推断，真启动 + 真 POST）：
- `packages/dsh-reasoning-effort/test/web-rpc.test.mjs` 19 条，含反证
  （段校验拆掉必放行 `..`；415 闸拆掉 handler 就会被执行；details 缺了必被判非法；
  requestRejection 裸函数调用必丢 this）。
- 隔离实例（临时 DSH_HOME + workspace 源码覆盖）真启动后 POST：
  `diagnose` → **200** 且返回真实诊断载荷（`entryHead`/`expected`/`settingsPath` 齐全）；
  未知 endpoint → 200 `not-found` 信封；通道根 → 404；`text/plain` → 415；
  **不带会话 cookie → 401**（栅栏真的在拦，不是敞开）。
