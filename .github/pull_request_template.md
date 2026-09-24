<!--
PR 标题 / commit message 规范：`<type>: <简述>（#issue号）`
type ∈ feat / fix / refactor / perf / docs / test / chore / build
示例：fix: 未确认宿主时不再允许插件自重启（#210）
一次提交只做一件事；维护者 squash merge。
-->

## 变更概述

<!-- 背景 / 动机 / 要解决的问题；关联 issue 用 Closes #N -->

## 变更内容

- [ ] 改了什么（包名 + 行为变化）
- [ ] 涉及文件范围

## 测试与验证（必填）

> 不满足以下清单的 PR 不会被 review。合并前逐项完成并勾选，并**贴出实测输出**。

- [ ] 行为变更带测试：`packages/<包>/test/*.test.js`，用 `node --test`；bug 修复必须带回归用例
- [ ] **新守卫必须配反证**：除「正常输入给正确答案」外，还要把判据逐项拆掉，
      证明结论随之改变（否则说明判据根本没起作用）。缺反证的守卫按未完成处理。
- [ ] **断言不许假绿**：批量检查必须先断言样本量非零；上游步骤失败时要短路下游断言。
      「0 个包全部通过」不是通过。
- [ ] 本地静态审计通过：`node tools/audit/index.js`（6 项，error 必须为 0）
- [ ] 单测通过：`node --test "packages/*/test/*.test.js"`
      （附实测 `tests / pass / fail / skipped` 四项计数；**`skipped` 比改动前增加必须说明原因**
      —— 靠 `skip` 遮住的守卫等于关掉的报警器）
- [ ] 改了 `tools/tiers.json` 或任何成员 `cordis.patch.yml` → 重跑
      `node tools/build-meta-patches.mjs`，并确认
      `node tools/build-meta-patches.mjs --check` 字节幂等
- [ ] 涉及发布物（`files` / `exports` / 依赖声明）→ 跑
      `node tools/itest/boot-desktop-profile.mjs --job=j2`
      （**只有 tarball 安装能暴露 `files` 白名单错误**，路径安装会把它掩盖掉）
- [ ] 涉及分层/挂载/补丁层 → 跑 `--job=j1`，确认全部 loader id 组合进最终树、
      且无「同 id 指向不同包」、二次安装字节幂等

## 在官方客户端里的人工验收

本仓库不再产出任何可执行程序，所以「启动应用验证」指的是：
在**官方 DeepSeek Harness 客户端**里装受影响的分层，并确认功能真的生效。

- [ ] 「设置 → 插件」里安装成功，**且重启应用后**生效
      （启用/停用只刷新页面不会有 —— 页内注入清单是宿主启动期快照）
- [ ] 相关功能在真机上可见（截图或简短说明）
- [ ] 若动了 `@dsh-pack/knowledge`：确认 pnpm 构建脚本放行的说明仍然准确
      （`allowBuilds` 里是**就地改写 `set this to true or false` 这一行**，
      不要在文件里另加一个 `allowBuilds:` 键 —— YAML 重复键会让安装失败）

## 影响面与风险

- [ ] 是否改了 loader id？（**默认不许改**：补丁按 id 整行替换、不做字段合并，
      改 id 会让用户家层里的 `disabled` 覆盖变孤儿；唯一历史例外是随插件一起删的
      `plugin-manager`。见 AGENTS.md R2）
- [ ] 是否与官方内核的 199 个 loader id / 277 个包名撞名？
      （`tools/audit/kernel-*.json`；撞 id = 整行顶替内核那一条，
      撞包名 = 两份物理拷贝 → 官方客户端拒绝启动）
- [ ] 是否把 `@deepseek-ai/*` 放进了 `dependencies`？**必须只在 `peerDependencies`**
- [ ] 是否新增了运行期读 `window.dshDesktop` 的代码？**只能经 `@dsh-pack/host-capabilities`**
      （官方也用这个名字挂了只有 3 个键的对象；且 contextBridge 对象冻结，补不回去）
- [ ] 是否引用了官方内核里不存在的包名？（不响亮失败，只表现为页内半边静默消失）

## 许可与出处

- [ ] 新增/改动第三方代码时，同步 `THIRD_PARTY_NOTICES.md`（用
      `node tools/codemod/scan-licenses.mjs --markdown` 生成，别手抄）
- [ ] GPL-2.0 的 `dsh-pocket` 保持「按上游原样依赖」策略；若必须改动，说明改了什麼
      且该包继续以 GPL-2.0 随源码发布
