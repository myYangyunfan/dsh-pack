# @dsh-pack/all —— 唯一的聚合元包

装这一个包就齐了：29 个插件，`cordis.patch.yml` 里 29 行。

它是**扁平聚合**，不是嵌套元包 —— 实测元包的传递依赖不会成为 bundle，且零报错，
所以嵌套只会产出一个惰性的空壳。

> 历史上这里还有 `core` / `plus` / `knowledge` / `pocket` / `bridge` / `compaction`
> 六个阶梯分层元包，已**全部退役**。原因：内核 `applyEntryPatches`
> （`@deepseek-ai/dsh-app-boot`）处理 `insert` 是 `data.push(...insert)`，
> **不看内容、也不按 id 去重** —— 「按 id 整行替换」只作用于覆盖型补丁
> （`- id: X / 字段: 值`），不作用于 `insert`。两个元包同装时共有成员被插两次 ⇒
> 装配两次 ⇒ 第二份 host 半边注册同一条由时抛
> `webserver: duplicate exact route`，条目直接不激活。
> 用内核自己的 `composeEntries` 实测：`meta-core + meta-all` = 50 行、**18 个重复 id**
> （取证：`node tools/itest/tier-overlap-proof.mjs`）。
> `tools/audit/self-mount.js` 现在断言分层成员集两两不相交，防止这个形状回来。

`@dsh-pack/all` **不是** `tools/tiers.json` 里各层的并集，它就是唯一那一层；
成员上的 `tierOf` 只是「按用途挑选」的分组标签，不再生成任何东西。

## 生成物

`cordis.patch.yml` 由 `node tools/build-meta-patches.mjs` 从成员自己的补丁层拼接生成，
**禁止手改**（`--check` 逐字节比对漂移）。生成器整行搬运、**不去重**——去重这件事
内核不做，我们也不假装做。

## 注意

- **装了本包就不要再单独装其中的任何一个成员。** 每个成员按设计必须能单装
  （自带 `cordis.patch.yml` + `package.json#dsh.bundle.patch`），所以「`all` + 某个成员」
  会让那个成员被插两次，症状与上面退役阶梯时一模一样。想只要小集合就别装本包，
  按分组单装。
- `graph-memory` 带原生可选依赖 `@photostructure/sqlite`（`"install": "node-gyp-build"`），
  `dsh-better-sidebar` 的 `node-pty` 是 optionalDependencies。首次安装会要求放行一次
  构建脚本，见仓库根 `docs/recovery.md`。
- 出厂关闭的三个成员：`harness-pet`、`dsh-cardian`、`graph-memory`。装上后需要在
  「设置 → 插件」里各自打开一次，然后**重启应用**（不是刷新页面）。
