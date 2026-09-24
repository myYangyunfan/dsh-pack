# dsh-synapse（DSH Desktop 内置版）

> 上游：[liangmianya/dsh-synapse](https://github.com/liangmianya/dsh-synapse) ｜ MIT License ｜ v0.3.0（上游 a323f76）

把同一工作区里的会话、追问与分支变成一张**可浏览、可拖拽、可缩放的对话地图**。
不替代 DSH 的模型、工具、会话或权限逻辑——只在原生对话界面之上增加一个可视化工作台。

![Synapse UI](docs/images/synapse-ui.png)

## 在 DSH Desktop 中使用

**本插件已内置，无需安装。** 启动 DSH Desktop 后：

1. 选择工作目录，或打开一个已有会话；
2. 点击顶部 **「会话地图」** 进入画布（与「对话」并列的顶部切换入口）；
3. 在画布上：点击卡片或侧边栏会话即可切换当前会话（原生对话页同步跟随高亮）；「分支」操作保留一条替代路径；
4. 点卡片底部 **「详情」** 查看完整对话记录；点顶部 **「对话」** 或卡片「在 DSH 中打开」回到原生对话。

### 功能一览

| | 功能 | 说明 |
| --- | --- | --- |
| 🗺️ | 会话地图 | 在 DSH 原生对话与可视化画布之间一键切换 |
| 🌿 | 分支可见 | 通过 DSH 原生 session fork 创建分支，按真实分叉点连接节点（卡片右缘分支图标） |
| 📁 | 工作区映射 | 读取 DSH 工作区与目录归属，在正确的项目上下文中创建会话 |
| 📥 | 持续投影 | 用户消息与助手回复实时投影为卡片，流式回复就地更新卡片 |
| 🔧 | 工具过程折叠 | 工具调用/结果按 callId 配对折叠进助手回复卡 |
| 🌲 | 子树折叠 | 画布卡片可折叠/展开后续对话子树（状态本地记忆） |
| 🌙 | 跟随深色主题 | 跟随 DSH 客户端的 `data-ds-dark-theme` 切换明暗主题 |
| ⚡ | 会话同步 | 原生对话 ↔ 画布双向同步当前会话 |
| 🎨 | 画布交互 | 拖动、缩放（最高 4×）、移动卡片（位置自动保存）、一键定位当前会话 |
| 🔒 | 原生会话不变 | 打开、追问、创建、归档仍由 DSH 会话系统完成 |

## 配置

通过 profile 的 `cordis.patch.yml`（`%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`）按行 id `synapse` 覆盖（整体替换 config，需重述全部键）：

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `dataFile` | `$DSH_HOME/synapse/workspaces.json` | 画布元数据持久化路径 |
| `autoProjection` | `true` | 自动把已提交的 DSH 会话事件投影为画布卡片 |
| `projectionWorkspaceTitle` | `DSH 任务` | 投影工作区标题 |
| `trustedHosts` | `[]` | 额外放行的 Host（主机名或 主机:端口）；localhost / 127.0.0.1 始终放行 |

```yaml
# 覆盖示例（追加到 cordis.patch.yml）
- id: synapse
  config:
    dataFile: !!js dshHomePath('synapse/my-workspaces.json')
    autoProjection: true
    projectionWorkspaceTitle: 我的任务
    trustedHosts: []
```

## 数据与边界

- 画布元数据保存在 `$DSH_HOME\synapse\workspaces.json`（schema v4，旧数据自动迁移）；
- 会话内容仍由 DSH session log 保存与管理——删除画布数据不会丢失会话；
- 投影是**有界副本**：每个会话线程只保留最近 400 条投影消息、工具参数/结果文本截断到
  4000 字符（详情页可在 DSH 原生会话中查看全文），`workspaces.json` 不会随会话事件无限增长；
- 重放按会话水位线（`lastProjectedSeq`）增量续放：重启后只投影上次落盘之后的新事件，
  不再从事件 0 全量重放（大会话重启 CPU 满载数分钟的问题已修复）；
- DSH 确认删除的会话会同步清理其归档标记，避免 `hiddenSessionIds` 无限累积；
- 不启动第二个 Web 服务、不创建第二套 Agent，不改变模型与工具执行行为；
- 对模型无影响：不向任何请求添加系统提示、工具 schema 或上下文，不影响 KV 缓存复用。

## 已知限制

- 仅支持 web profile；
- 两个 dsh web 实例共享同一 profile 时会写同一个 `workspaces.json`（已加跨进程写锁，但仍建议单实例运行）；
- 画布投影只保留有界尾部：被截断的早期消息卡片不再出现在画布/详情投影中（完整记录以 DSH 会话为准）。

## 与上游的差异

DSH Desktop 内置版以上游 `a323f76`（v0.3.0）为基底，叠加了以下本地性能与增长治理补丁（计划回馈上游）：

1. **增量重放水位线**：每会话持久化 `lastProjectedSeq`，重启后从水位线续放而非事件 0
   全量重放（大会话重启后 CPU 近满载数分钟的根因）；旧数据线程从已投影的 `sourceSeq`
   自愈水位线；去重由 O(n) 线性扫描改为 O(1) 集合判定，工具折叠目标按 turn/step 缓存，
   首次投影长会话也不再是平方级；
2. **写入治理**：已投影完且无变化的会话重放零写盘（不再每会话整文件重写一次）；
3. **增长上限**：投影消息每线程保留最近 400 条、工具参数/结果截断 4000 字符、
   已删除会话的归档标记随同步清理。

其余文件与上游同源原样分发：

- 上游经 `dsh plugin --profile web add github:liangmianya/dsh-synapse` 安装；
- 内置版随 DSH Desktop 分发并自动装配（本目录为 vendored 副本，升级时以版本号比较，用户手动更新的更高版本不会被覆盖回退）。

## License

MIT（见 [LICENSE](LICENSE)，版权归属上游作者 liangmianya）。
