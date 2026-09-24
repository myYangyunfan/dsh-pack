# @dsh-pack/host-capabilities

宿主能力探针。**它不是 cordis bundle**——没有 `dsh.bundle.patch`，不会作为 loader row 插入，
也不会被 `dsh plugin add` 安装。它是发布出去给别的插件在**构建期内联**用的库。

## 为什么存在

我们退役的自制桌面壳，会往页面注入一个 55 方法的 `window.dshDesktop`。
官方 DeepSeek Harness 客户端**也**往同一个全局名上挂对象（`preload-app.cjs` 的
`exposeInMainWorld("dshDesktop", …)`），但形状完全不同：

```js
{ protocolVersion: 1, browser: { acquire, release, onOpenRequested }, updates: { status, open, subscribe } }
```

于是老代码里 `if (window.dshDesktop) { … 走原生分支 }` 这类写法，在官方客户端下会拿到一个
**truthy 却什么都调不通**的对象——静默失效，不抛错。已经实测到的两处真实伤害：

- 一个「还原」按钮的 `disabled: busy || !window.dshDesktop` ⇒ 按钮显示可点，点了静默 return；
- `root.style.top = window.dshDesktop ? "36px" : "0px"` ⇒ 在没有标题栏内衬的客户端下凭空多出 36px。

也不能「给老名字打补丁补回来」：`contextBridge` 交出来的是**不可扩展的代理对象**，改不动。
所以只能换寻址方式。

## 用法

```js
import { hostCapabilities } from '@dsh-pack/host-capabilities';

const caps = hostCapabilities();
if (caps.has('revertFiles')) { /* 真的能还原 */ }
const top = caps.hasTitlebarInset ? '36px' : '0px';
const path = caps.pathForFile?.(file) ?? '';
```

三条纪律：

1. **永远用 `caps.has(...)` 或 `caps.xxx?.()` 问能力，不要对宿主对象做 truthiness 判断。**
   上面那两个 bug 的成因就是后者。
2. **必须构建期内联。** 官方浏览器模块系统只对种子表（`PLATFORM_MODULES`）、memo 记录、
   boot-graph 行和已注册工厂解析裸标识符，**其余一律 throw**。所以运行时
   `require('@dsh-pack/host-capabilities')` 会炸；各插件的打包器要把它 tree-shake 进
   `lib/client.js`。这也是本包保持零 import、零依赖、`sideEffects: false` 的原因。
3. **探针永不抛错，返回值是 `Object.freeze` 的。** 认不出来的宿主一律降级为
   `kind: 'browser'`、所有原生能力 `null`，绝不把异常漏给页面。

## 判据

`official` 用的是官方 preload 自己决定「要不要给全量 API」的那同一个条件
（`location.protocol === 'dsh-app:' && location.hostname === 'app'`），再加一道
`dshDesktop.updates.subscribe` 是函数的形状确认。注意 `updates` 是**对象**不是函数——
探错层级会让所有官方宿主都被误判成浏览器（这个 bug 被本包的单测抓到过）。

`legacy` 用「有 `getInfo()`」区分：我们那个壳总有它，官方的三键对象永远没有。

## 给宿主半边用的 node 侧探针

```js
import { nodeHost } from '@dsh-pack/host-capabilities/node';
const host = nodeHost();
if (!host.mayRestartHostProcess) { /* 别自己 spawn 宿主 */ }
```

官方桌面宿主启动内核时会把 `ELECTRON_RUN_AS_NODE=1` 与
`DSH_DESKTOP_NODE_EXECUTABLE=<electron 主程序>` 一起传进 `runProfile` 的
`packageManager.env`，这两个组合是官方宿主独有的（我们退役的 Tauri 壳用的是 `DSH_TAURI_*` 一族）。
插件该问的问题其实不是「是不是桌面客户端」，而是「我能不能自己重启/自更新宿主」——
在两种壳下答案都是「不能」，因为官方宿主还有强制更新准入锁（锁定期把 `connection/request`
打成 503），插件自己重启宿主会打断它。这个语义就是 `isSupervised` / `mayRestartHostProcess`。
