# WSL 与 Linux：现在能做到什么

## 结论先说

**自制壳时代的「WSL 后端」在插件包形态下没有了**，这是明确取舍，不是待办。

旧功能是：把整个 dsh 内核跑在 WSL 发行版里，桌面壳仍跑在 Windows 上，
通过 `\\wsl.localhost\<发行版>\...` 这条 UNC 路径跨进程访问内核的家目录。
它需要三样东西同时成立：

1. 一个能决定「内核在哪儿启动」的**宿主进程**（我们有 `wsl-backend` crate + sidecar）；
2. 设置页 `dsh-wsl-settings` 通过 `window.dshDesktop.wsl.{getConfig,saveConfig,recheck}`
   跟那个宿主说话；
3. 用 `wsl.exe -e sh -lc` 安装/更新/回退/启停，并把 `dsh web` 的 pid 落在发行版内自己管。

插件包里这三样都不成立：**插件跑在已经被官方客户端拉起来的那个内核进程里**，
没有任何手段把内核改派到 WSL 里去跑。而且实测官方客户端的 108MB `app.asar` 里
`wsl` / `WSL` 命中数为 **0**——它自己也没有这个概念。

所以：`dsh-wsl-settings` 插件与 `wsl-backend` 一并删除。

## 现在还想要的两条路

### ① 在 WSLg 里跑官方客户端（可行，但不是「WSL 后端」）

Windows 11 的 WSLg 能直接跑 Linux GUI 应用。官方客户端有 Linux 产物，
所以在 WSL 发行版里装它、用它，界面会经由 WSLg 显示到 Windows 桌面上。

注意这**不是**旧功能：旧功能是「壳在 Windows、内核在 WSL」的混合模式；
这条路是「整客户端都在 WSL 里」，Windows 侧只是显示。两者体验和边界都不同。

### ② 纯 CLI 路线：在 WSL 里用 `dsh` + 自定义 profile（推荐做服务器/远程场景）

这条路在插件包形态下**完全可用**，因为 CLI 只锁 `desktop` 这一个 profile 名，
自定义 profile 随便用：

```bash
# 在 WSL 发行版里
npm i -g @deepseek-ai/dsh
export DSH_HOME=/home/me/.dsh

dsh plugin --profile work add @dsh-pack/core
dsh plugin --profile work add @dsh-pack/plus
dsh --profile work web --host 0.0.0.0 --port 0
```

把打印出来的 URL 在 Windows 浏览器里打开即可。
（`--host 0.0.0.0` 是给手机/局域网设备直连 web 端口时才需要的；
日常用桌面客户端或 `@dsh-pack/pocket` 不需要。）

这条路的限制也说清楚：

- profile 名**不能**叫 `desktop`（`rejectElectronProfile` 硬拦，大小写不敏感）；
- `@dsh-pack/knowledge` 需要放行 `@photostructure/sqlite` 的构建脚本——
  纯 CLI 下没有那个「Allow these scripts and retry」按钮，
  要自己在 profile 的 `pnpm-workspace.yaml` 里把
  `allowBuilds` 下面那行 `set this to true or false` 改成 `true`（**就地改，别再新增一个 `allowBuilds:` 键，YAML 重复键会让安装失败**）；
- 原生模块要能在该 Linux 目标上取到预编译，否则 `node-gyp-build` 会退回源码编译，
  需要自带工具链。

## 旧 WSL 实现的命令注入防护（如果将来有人重做，请照抄）

删掉的 `wsl-backend.js` 里有两条不是可有可无的输入校验，留个记录免得被重新发明成漏洞：

- **安装目录必须过字符黑名单**：空白、`$`、反引号、`;`、`&`、`|`、`<`、`>`、引号、
  括号、回车、换行、制表符一律拒绝——因为这些值会被拼进
  `wsl.exe -e sh -lc '<命令>'` 的单引号里，不设黑名单等于命令注入。
- **版本字符串必须匹配 `/^[A-Za-z0-9._-]+$/`** 才能进
  `sh -lc 'npm install <pkg>@<version>'`。

还有一条硬红线值得保留：**永远不要调 `wsl --terminate` / `wsl --shutdown`**。
那会连带杀掉用户在别的发行版里跑的东西，而我们的清理只该按 pid 文件杀自己起的那个进程。
