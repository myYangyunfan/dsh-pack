# dsh-prompt-optimizer（DSH Desktop 内置版）

DSH Desktop 随包内置的提示词优化插件：在会话输入框旁提供「优化」按钮（✨），
一键分析并润色当前草稿，结果经 SSE 流式上屏，可直接替换输入框。

- **上游**：<https://github.com/Y1X1n/dsh-prompt-optimizer>（MIT，作者 Y1X1n）
- **随包版本线**：`3.0.0`，源码取自上游 `0.6.1`（适配 dsh `0.2.1-rc.2`）
- **包名**：本仓沿用 `dsh-prompt-optimizer` / loader id `prompt-optimizer`，
  以便老 profile 原地升级；上游 npm 包名为 `@y1x1n/dsh-prompt-optimizer`
- **宿主半边**：注册 `POST /dsh-prompt-optimizer/optimize`（SSE 流式）与
  `POST /dsh-prompt-optimizer/test-model`（连通性探活），调用 `ctx.llm`
- **客户端半边**：输入框右侧按钮、输入卡上方的结果面板、设置页插件配置卡片
- **依赖**：仅 `@deepseek-ai/schemastery`（由桌面端按既有 `VENDOR_DEPS` 链同步进 profile）

## 本仓内的重建方式

```bash
# 在 dsh-desktop 目录下（借用仓库的 esbuild）：
cd .tmp-po-build && node scripts/build.mjs
```

构建脚本与 `src/` 随源目录保留，产物为 `lib/{index,client,prompt,controller}.js`。
上游自带的行为测试保留在 `test/`（先构建，再 `node test/prompt.test.mjs` 等）。

完整功能说明、配置项与故障排查见上游 README。

## License

MIT，版权归 Y1X1n；原始许可证全文见本目录 `LICENSE`。
