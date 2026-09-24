# dsh-file-drop — 选中上传 + 拖入文件到对话

DSH Desktop 配套插件：让 DeepSeek 直接看到你的文件。四条入口汇入同一管道：

- **📎 附件按钮**（composer 工具行，`conversation.input.left` 槽位）：点击弹出
  多选文件选择器。
  - **图片**（内核白名单 PNG / JPEG / WebP / GIF）→ 经内核官方附件管道
    （`conversation.createDraftImages` + `inputActions.addImages`）进入**原生
    附件栏**（缩略图预览 / 单张移除 / 随消息发送），模型直接看到图片内容；
  - **文本 / 代码文件**（.md/.js/.py/.json 等常见文本扩展名与无扩展名文件）→
    内容自动注入输入框（上限 256 KB），带 `<!-- 拖入文件：<名> -->` 文件头；
  - **其余类型**（PDF / 压缩包 / 位图外的图片格式等）→ 就地红字提示原因
    （内核附件仅支持图片），并建议改用拖入或工作区路径。
- **前置校验**（对齐内核 `@deepseek-ai/dsh-attachment-local` 默认限额）：单图
  3.5 MB、单条消息 20 张、合计 100 MB、单边 2000 px；超限立即红字拒绝，
  不让用户白选。
- **页面拖入**（HTML5 drop）：内核 ui-attachment 已接管的白名单图片让位
  （防重复进附件栏）；文本注入内容；其余注入路径提示。
- **壳层拖入**（Tauri：Rust 侧 drag-drop → 垫片 `client-file-drop` 事件，载荷
  `{files:[{path,name,size}]}`）：WebView2 下 HTML5 drop 不达页面，这是桌面
  拖入主通道。**拖拽 = 粘贴 = 选择**（M3 统一）：内核白名单图片经宿主半边
  同源路由 `POST /dsh-file-drop/read-image` 读成 dataUrl 后，与「直接粘贴图
  片」「📎 选择图片」走完全相同的官方附件管道（`conversation
  .createDraftImages` + `inputActions.addImages`——内核粘贴处理器
  `intakeImages` 的同一落点）与同一限额裁决；载荷自带内容
  （`dataUrl`/`base64`）时免读直进。读失败 / 超限 / 非白名单 / 文本 / 二进制
  → 维持合并路径提示块（既有语义零回归）。与 HTML5 drop 双报自动去重。
- **粘贴**：由 dsh-image-paste 处理（rc.8 内核原生接管时让位，见该插件）。

浏览器半边纯客户端；宿主半边在 webServer 上注册上述回环限定读图路由
（白名单扩展名 + 3.5 MB 上限 + 魔数嗅探，载荷不可信全量复核）。纯逻辑挂在
`window.__dshFileDropCore` 供 node 测试套件验证。在「设置 → 插件 → 管理」
可随时关闭。

Electron 桌面端下通过 preload 暴露的 `getPathForFile`（webUtils）获取拖入
文件的完整路径；纯浏览器打开 WebUI 时自动降级为可读提示。

License: MIT。Deepseek Harness EAC 配套插件。
