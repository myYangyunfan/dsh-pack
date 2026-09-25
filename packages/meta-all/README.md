# @dsh-pack/all —— 全量层

一个输入装齐全部 32 个插件：`core` / `plus` / `knowledge` / `pocket` / `bridge` / `compaction`
六个分层的**并集**。它是扁平聚合，不是嵌套元包 —— 元包依赖元包在这个包里是被禁止的
（实测：元包的传递依赖不会成为 bundle，且零报错）。

`cordis.patch.yml` 是**生成物**，由 `node tools/build-meta-patches.mjs` 从成员自己的
补丁层拼接、按 id 去重，禁止手改（`--check` 会比对漂移）。

## 注意

- 含 `knowledge`/`plus` 的原生可选依赖（`@photostructure/sqlite`、`node-pty`），
  首次安装会要求放行一次构建脚本，见仓库根 `docs/recovery.md`。
- `harness-pet` 与 `dsh-super-injector` 中只有前者出厂关闭；
  `dsh-super-injector` 已因许可出处不可核实移出发布面（见 `not-shipped/`）。
- 与单个分层重复安装是安全的：同一 id 的行两边字节相同，补丁按 id 整行替换，
  第二次应用是 no-op（J1 已实测）。
