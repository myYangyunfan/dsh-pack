# `ctx.connection.rpc.handle` 在这版内核里无法使用（静默不挂载）

**环境**：`@deepseek-ai/dsh` 0.1.7-rc.1（官方客户端 `resources/app.asar` 内同一份代码）。
**影响**：任何第三方插件想给页内暴露一条 RPC 通道，照文档调 `connection.rpc.handle`
都会得到一个**静默失败**：路由从未挂上，apply 不抛错、启动日志干净、`--dump-config` 全绿。

## 现象

页内 `ctx.connection.rpc.call(channel, endpoint, payload)` 的 transport 就是

```
fetch(`${channel}/${endpoint}`.slice(1), { method: 'POST', ... })
```

（`dsh-client-connection/lib/client.js` 的 `createWebConnectionRpc`）。当宿主那侧的路由
不存在时，这个 POST 落到静态处理器 `dsh-client-modules/lib/index.js:959`
（`if (method !== "GET" && method !== "HEAD") return { status: 405 }`），控制台只留一行

```
Failed to load resource: 405 (Method Not Allowed) http://127.0.0.1:3080/<channel>/<endpoint>
```

而页内那句 `rpc.call` 往往被调用方的 try/catch 吞成 `null` ⇒ 用户侧表现为「点了没反应」。
**405 不代表方法写错，而是「这条路由根本没注册」。**

## 根因

`@deepseek-ai/dsh-client-connection`（宿主半边）的插件级依赖是：

```js
const inject = ["credentials"];
```

而它提供的服务方法里要注册路由：

```js
register(owner, channel, handler) {
    ...
    return owner.effect(() => owner.webServer.register(route), `client-connection: ${channel} rpc channel`);
}
```

`owner` 是 `get rpc()` 里的 `this.ctx` —— **服务自己的 ctx**，它的注入清单里没有
`webServer`。cordis 的隔离层因此抛 `cannot get property without inject`，注册从未生效。

内核自己的 `/api` 路由**不是**走这条路的，而是在同一个 `apply()` 里：

```js
ctx.inject(["webServer"], (webCtx) => {
    ...
    webCtx.effect(() => webCtx.webServer.register(route), "client-connection: /api route");
});
```

即：内核知道要这么写，但 `rpc.handle` 这条「给插件用的通用注册口」没跟上。

## 建议修法（上游）

任选其一：

1. `register()`/`registerInterceptor()` 用**调用方**的 ctx 而不是服务自己的 ctx 去
   `effect` + `webServer.register`（`handle(channel, handler)` 增加 `owner` 形参传递）；
2. 或把 `webServer` 加进 `HostConnectionService` 构造时所用的 ctx（即给该插件
   `inject` 加上 `"webServer"`，并容忍它在 headless 场景缺席）；
3. 至少在 `webServer` 不可达时**抛出一个可诊断的错误**，不要让它以
   `cannot get property without inject` 的形式消失在隔离层里。

## 我们的绕行（本仓库）

插件自己 inject `webServer`（页面侧半边无需改动，仍用内核原生
`connection.rpc.call`），把通道挂在自己的路由上，并逐分支复刻 `/api` 的传输语义：

- `packages/dsh-pocket/lib/web-rpc.js`（最早发现，注释里记着
  `dsh v0.1.5-alpha.1+ client-connection inject 收缩为 ['credentials']`）；
- `packages/dsh-reasoning-effort/lib/web-rpc.js`（同样的形状，含 401/403 栅栏与
  `client-request` → `server-response` 信封）；
- 门禁：`tools/itest/boot-activation.mjs` 会按 `tools/itest/live-probes.json`
  **真发 HTTP** 打这些通道，`405` 直接算失败。

顺带一个同源坑：失败信封必须带 `error.details`（`parseConnectionResponse` 会校验
`isRecord(error.details)`），缺了它连错误都会被页内解析器抛掉 —— 错误第二次静默。
