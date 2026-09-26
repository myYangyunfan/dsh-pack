---
"@dsh-pack/dsh-better-sidebar": patch
"@dsh-pack/dsh-community-market": patch
"@dsh-pack/dsh-easyrewrite": patch
"@dsh-pack/dsh-file-drop": patch
"@dsh-pack/dsh-pocket": patch
---

修「插件槽位整条崩掉、控制台 Minified React error #130」。

`#130` 的判词是「元素类型是 undefined」——即我们渲染了一个 `undefined` 组件。
真机现象是两条 slot 消失（`sidebar.footer.action` 与 `shell.overlay`），
因为一个 undefined 组件会带走整条 slot 的渲染。

根因：**图标成员名取自旧内核的命名**。旧版 `@deepseek-ai/dsh-client-ui-primitives`
导出的是带尺寸后缀的名字（`IconApiOutline14`、`IconFolderOpenOutline16`），
现内核（0.1.7-rc.1）的导出里**没有任何数字后缀**，同一图标按变体拆成
`IconApiOutlineRegular` / `…Medium` / `…Artwork`。成员取到 `undefined` 后当组件渲染，
就报 #130。`node_modules` 里残留的 0.1.1-rc.1 内核拷贝正是旧命名的来源，
所以本地看 grep 有、真机加载就炸。

- 8 个页内 bundle、169 处引用改成 `…Regular`（`tools/codemod/fix-icon-size-suffix.mjs`，
  逐名对快照核验，目标名不存在则拒绝写盘）。
- `tools/audit/extract-kernel-snapshots.mjs` 改为解析 primitives **真实的
  `export { … }` 块**（新产出 `kernel-primitives-icons.json`，186 个名字），
  取代原先「扫任意大写标识符」的瞎猜 —— 那个版本把不存在的裸名
  `IconSearchOutline` 也判成合法，属假绿。
- `tools/audit/namespace.js` 加第 ⑤b 条判据：页内 bundle 里对 primitives 的
  `Icon*` 成员访问必须命中快照，快照缺失时 fail-closed。

验证（不靠推断，逐名对着 app.asar 核对）：从官方客户端
`resources/app.asar` 解出 primitives 的真实导出 **186 个 Icon**，与仓库快照
**双向相等（缺 0 / 多 0）**；扫我们全部包，引用 **32 种 / 169 处 Icon 成员，
不存在者 0 处**。隔离实例真启动、全量启用，控制台 **#130 归零**。
