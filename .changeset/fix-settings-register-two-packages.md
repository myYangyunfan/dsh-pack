---
"@dsh-pack/dsh-reasoning-effort": patch
"@dsh-pack/dsh-community-market": patch
---

修「apply 里抛 TypeError 导致整条 not activate」。

内核 0.1.7-rc.1 的 settings 服务（`SettingsForms`）只有
`describe / update / configure / schema / prepareDocument`，**没有 `register`**
（全内核 0 处命中）。官方包的形状是：插件自己 `export const Config = z.object({...})`，
cordis 的 `resolveConfig()` 拿它校验 profile 行里的 `config:`，校验结果就是
`apply(ctx, config)` 的第二个参数；要写回则走 `settings.update(条目id, patch, revision)`，
而 `describe()` 只收录「至少有一个 volatile 字段」的条目。

- `dsh-reasoning-effort`：`settings.register(STORE_NS, StoreSchema)` → `export const Config`
  + 读 `apply` 的 config；另把 `settings.get(LLM_NS)`（同样不存在）改成走 `describe()`，
  与相邻的 `userDeclaredModel` 同一口径。故意不加 volatile：本插件从不写配置，
  而 `z.array(z.any())` 进 volatileForm 投影不出形状。
- `dsh-community-market`：`settings.register(ns, schema, {applies:'live'})` →
  `Config` 导出 + `marketScope(ctx, config)` 适配器（volatile 引用做 `get()`，
  `settings.update(entry.options.id, patch, revision)` 做写回）。三个字段都标了
  `.volatile()`，否则 `describe()` 不收录本条目、写回也就无从取 revision。

验证方式：`tools/itest/boot-activation.mjs`（J4）——真启动挂载，不再只看 `--dump-config`。
