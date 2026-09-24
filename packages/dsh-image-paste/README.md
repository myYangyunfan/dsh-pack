# dsh-image-paste — 图片粘贴发送

DSH Desktop 配套插件：在对话输入框按 **Ctrl/Cmd+V** 粘贴剪贴板里的图片
（截图、复制网页图片等）时，自动把图片保存到临时目录（`%TEMP%\dsh-paste`），
并把完整路径提示注入输入框，配合 `inspect_image` 视觉工具发送给 agent 分析。

- 支持 PNG / JPEG / WebP / GIF / BMP / AVIF / ICO / TIFF，单张上限 15MB。
- 纯文本粘贴完全不干预（交给上游输入框）；同时粘贴「文本 + 图片」时文本
  照常粘贴，图片提示追加在末尾。
- 多张图片一起粘贴时合并为一条提示，agent 逐一分析。
- 保存经宿主半边的受控路由（`POST /api/dsh-image-paste/save`）：只接受白名单
  image/* 的 base64 data URL、解码后单张上限 15MB、文件名由服务端自造
  （调用方传的 name 只校验不参与拼接）、落点必须仍在规定临时目录内。
- 临时目录 `%TEMP%\dsh-paste` 以 0700 / 文件 0600 创建（POSIX），截图一类的
  隐私内容不对同机其他用户可读；文件随系统临时目录清理。
- 保存或注入失败都会给可见提示（不再静默吞——图已落盘却拿不到路径等于丢图）。
- 客户端 + 宿主两个半边；在「设置 → 插件 → 管理」可随时关闭。

与拖入图片（dsh-file-drop）的路径提示格式一致，agent 用同一套
`inspect_image` 流程处理。

License: MIT。Deepseek Harness EAC 配套插件。