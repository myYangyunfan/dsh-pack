# `dsh plugin add`：构建脚本放行后的重试会**静默半装**（依赖进了 profile，bundle 没进 `dsh.profile.bundles`）

**环境**：`@deepseek-ai/dsh` 0.1.7-rc.1；pnpm 11.19.0（Windows x64；pnpm 11 的构建门禁行为与平台无关）。
**影响**：CLI 路径上，凡是首装被 `ERR_PNPM_IGNORED_BUILDS` 拦下的包，按失败提示
「Allow these scripts and retry」重试之后：命令**退出码 0**、pnpm 真的跑完（该依赖的
postinstall 有输出）、`node_modules` 里包也在 —— 但这个包**没有**被写进 profile 的
`dsh.profile.bundles`，于是它的补丁层永远不参与组合：插件静默消失，无报错、无警告。
用户以为是「重试成功」，实际什么都没挂上。

服务路径（插件页 / agent 的 `plugin_manager install_bundle`）**不受影响**（差异见根因）。

## 复现（最小步骤）

用一个依赖带 install 脚本的包（例：`node-pty`）打成 tarball 后：

```bash
# ① 首装被门禁拦下（预期）
$ dsh plugin --profile p2 add <tarball>
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: node-pty@1.1.0
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
dsh: plugin command failed; diagnostics: …\profiles\p2\.plugin-manager\logs\operation-XXXX\pnpm.log

# ② 此时 profile 的 package.json **已经有**这个依赖；pnpm-workspace.yaml 写了占位：
#    allowBuilds:
#      node-pty: set this to true or false

# ③ 就地放行（= 失败提示里那句「Allow these scripts and retry」对占位值做的事）
$ sed -i 's/set this to true or false/true/' <profile>/pnpm-workspace.yaml

# ④ 重试：退出码 0，pnpm 真跑完（postinstall 打印了它拷 conpty.dll 的输出）
$ dsh plugin --profile p2 add <tarball>
Done in 1.3s using pnpm v11.19.0

# ⑤ 结果（测出来的）
$ node -p "require('<profile>/package.json').dsh.profile.bundles"
[ '@deepseek-ai/dsh-base' ]          # ← 没有刚装的那个包
$ dsh --profile p2 --dump-config | grep -c "id: <该包的行 id>"
0                                    # ← 组合树里 0 行
```

## 根因

两条路都从同一份 pnpm 调用出发，**失败时的回滚语义不一致**：

- **失败的首装不回滚 manifest。** CLI 路径 `runProfilePnpm`
  （`dsh-plugin-manager/lib/types/operations.js`）只在一处 `restore()`：版本不兼容那条
  分支（`operations.js:428`，「installation rejected: …」）。构建门禁失败走的是普通非零
  退出，**不还原** `package.json` / `pnpm-lock.yaml` ⇒ pnpm 已经把新依赖写进 manifest 了。
- **重试的成功路径只登记「新增」依赖。** `reconcile(before, dir, …)`
  （`operations.js:44`）里：

  ```js
  for (const name of dependencies) {
      if (beforeDeps.has(name)) continue;      // operations.js:55 —— 重试时它已经在 before 里
      … bundles.push(name) 只在 !bundles.includes(name) 时发生（operations.js:64）
  }
  ```

  `before` 是**本次** `add` 开始前的 manifest，而依赖是上一次（失败的那次）写进去的 ⇒
  这个包永远拿不到 `bundles` 登记。

**服务路径为什么没事**：`installBundle`（`dsh-plugin-manager/lib/index.js`）在 pnpm
开跑前读快照（`:1646` `readRestoredFiles()`），失败时在 catch 里整体回滚
（`:1722`–`:1725`，还原清单见 `:1028` `RESTORED_FILES = ["package.json","pnpm-lock.yaml"]`）。
所以插件页 / agent 工具的重试是「干净的第二次首装」，`reconcile` 能看见新增。

## 建议

在 `runProfilePnpm` 的失败分支（`exitCode !== 0`）也回滚 `package.json` 与
`pnpm-lock.yaml`，与服务路径对齐；并保留「下载物留在磁盘上」（`repair` 时可以复用）。

不建议改成「reconcile 时把 dependencies 里、声明了 `dsh.bundle`、但不在 `bundles` 里的
依赖补登记」——「装了但不在 bundles 里」同时是**用户停用某 bundle** 的持久状态
（`setBundleEnabled(name, false)` 就是把它从列表里拿掉、依赖留下），补登记会把它悄悄
重新启用。

## 附：我们的绕行

`tools/itest/boot-desktop-profile.mjs` 的 `addWithBuildApproval()` 按**服务路径语义**
（失败 → 回滚那两个文件 → 放行 → 重试）复现插件页流程，注释里指向这份文档；
CI 的 J2 就是靠它把两个带原生依赖的包真装进临时 profile 并验证组合的。
