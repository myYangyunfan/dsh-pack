// @dsh-pack/dsh-workspace-anchor
//
// 提示词级工作区偏好（不修改任何权限/沙箱行为）：
// 每个 agent 创建时，在其作用域注册一个 order=1 的 system-prompt 节，
// 位于 persona 之后、工具指引之前，每次请求都会随稳定 system prompt 重复，
// 因此不会被会话滚动或 compaction 吞掉。
//
// complete: true 的预设（minimal-win / anchored / zero / warmup / whoami）
// 会丢弃本插件注册的节；这些预设已在 bundled agent.cordis.yml 的 persona
// 文本内直接写入同样的锚点。
//
// 文本保持短小，只表达「默认留在 cwd，读/搜不受限，出去要显式理由并回来」。

const name = "@dsh-pack/dsh-workspace-anchor";
const inject = ["systemPrompt"];

const workspaceAnchor = (cwd) => `Workspace: ${cwd}.

Default working location:
- Keep file edits, builds, and deliverables under ${cwd}.
- Prefer relative paths; they resolve against ${cwd}.
- You may read or search anywhere. A search hit outside ${cwd} is reference material, not a new project root.
- Work outside ${cwd} only when the user explicitly named that path or it is genuinely unavoidable; then return to ${cwd}.}`;

function apply(ctx) {
  // 内核 0.2.1-rc.1 把 `{{cwd}}` 这个提示词变量的注册撤掉了（rc.2 的
  // dsh-agent-loop 有 `variable("cwd", …)` 那一行，新版只剩 provider / model），
  // 于是带 `{{cwd}}` 的节在装配期直接抛 `unknown prompt variable`——表现是
  // 「每一条消息都处理失败」，而不是任何插件加载报错。两处各自兜住：
  //   · 本插件的锚点文本自己填成真实路径 + `interpolate: false`，装配期不再扫描它；
  //   · 顺手把 `cwd` 变量按 rc.2 的原形状重新注册上，让别的节（和用户自写的
  //     prompt-custom 文本）里的 `{{cwd}}` 继续有值可解析。
  ctx.systemPrompt.variable("cwd", (context) => context.agent?.session?.header?.cwd);
  ctx.on("agent/created", ({ agent }) => {
    const cwd = agent?.session?.header?.cwd;
    if (typeof cwd !== "string" || cwd === "") return;
    agent.ctx.systemPrompt.section({
      name: "dsh:workspace-anchor",
      order: 1,
      interpolate: false,
      text: workspaceAnchor(cwd),
    });
  });
}

export { apply, inject, name };
