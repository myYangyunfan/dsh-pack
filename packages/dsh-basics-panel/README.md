# dsh-basics-panel

DSH Web 插件「基础能力面板」：在 DSH 设置中可视化并管理 **MCP 服务器**、**技能** 与 **规则**。采用模块化 feature 注册表，后续的 DSH 可视化功能只需新增一个 feature 目录并在注册表加一行即可，无需改动面板骨架。

A DSH web plugin: a native Settings panel for visualizing and managing **MCP servers**, **skills** and **rules**, built on a modular feature registry so future visualizations slot in without touching the shell.

## 功能

- **MCP 服务器**：按作用域（用户 profile / 预设 preset）分组列出所有 MCP 服务器，展示脱敏后的配置（env / 请求头 / 密码参数 / URL 密码均打码），显示运行时状态（已连接 · N 工具 / 已启用 / 已禁用 / 未生效），并支持逐台开关（写入配置文件的 `disabled` 字段，profile 热重载、preset 新会话生效）。
- **技能**：按作用域（项目级 / 自定义 / 用户级 / 内置 / 运行时）分组展示全部技能，支持搜索与过滤；可编辑技能的 description / whenToUse / metadata / 调用权限与正文，保存后经 filesystem watcher 热刷新生效。
- **规则**：展示全局规则（`~/.dsh/AGENTS.md`）与项目链规则（项目根至当前目录的 `AGENTS.md` / `CLAUDE.md` / `.local` 覆盖），支持新建（全局 / 项目根 / 当前目录）与整文件编辑，保存后新会话生效。

## 作用域说明

| 能力 | 全局 | 项目级 | 用户级 | 预设级 | 内置 |
|---|---|---|---|---|---|
| 技能 | — | `<项目>/.dsh/skills`、`<项目>/.agents/skills` | `~/.dsh/skills`、`~/.agents/skills` | — | 随发行版内置 |
| MCP | — | DSH 暂无项目级组合文件 | `~/.dsh/cordis.patch.yml`、`~/.dsh/profiles/*/cordis.patch.yml` | `~/.dsh/.agent-presets/*/agent.cordis.yml` | — |
| 规则 | `~/.dsh/AGENTS.md` | 项目根至 cwd 链上的 `AGENTS.md` / `CLAUDE.md` / `.local` | — | — | — |

同名技能按注册表优先级显示生效版本（项目级 > 自定义 > 用户级 > 内置）。

## 安装

开发完成后，用官方通道安装（或手动挂载）：

```bash
dsh plugin --profile web add @dsh-pack/dsh-basics-panel@<version>
```

手动挂载：将本包放入 profile 解析范围，并在 `~/.dsh/profiles/web/cordis.patch.yml` 写入：

```yaml
- insert:
    - id: basics-panel
      name: '@dsh-pack/dsh-basics-panel'
```

首次安装需重启 DSH（客户端 bundle 启动图在启动时构建）；之后 Host 侧改动经 patch 热重载、客户端改动重建后刷新页面即可。

## 开发

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
pnpm build       # tsc 声明 + tsdown（lib/index.js + lib/client.js + lib/client-registry.js）
```

## 目录结构

- `src/index.ts` — Host 半边：fenced `/basics/api` 路由 + feature 合并
- `src/features/<id>/` — Host 侧 feature 后端（MCP / skills / rules）
- `src/client/index.tsx` — 客户端半边：注册 `settings.section`
- `src/client/feature-registry.tsx` — 客户端 feature 注册表（扩展点）
- `docs/` — 使用文档与设计文档

## 安全

- 所有路由过浏览器信任围栏（loopback / `webRuntime.trustedHosts`）
- 敏感值只脱敏展示、绝不回传明文
- 写文件严格白名单：MCP 仅可改写扫描发现且非 system 的组合文件；技能仅可改写注册表返回且非内置/运行时的文件；规则仅可读写 DSH 规则发现机制认可的路径（全局 `AGENTS.md` 与项目链候选文件）
- 所有写操作原子写（临时文件 + rename）+ mtime 冲突拒绝

## License

MIT
