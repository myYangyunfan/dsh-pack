// @deepseek-ai/dsh-workspace-anchor
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

const WORKSPACE_ANCHOR = `Workspace: {{cwd}}.

Default working location:
- Keep file edits, builds, and deliverables under {{cwd}}.
- Prefer relative paths; they resolve against {{cwd}}.
- You may read or search anywhere. A search hit outside {{cwd}} is reference material, not a new project root.
- Work outside {{cwd}} only when the user explicitly named that path or it is genuinely unavoidable; then return to {{cwd}}.`;

function apply(ctx) {
  ctx.on("agent/created", ({ agent }) => {
    agent.ctx.systemPrompt.section({
      name: "dsh:workspace-anchor",
      order: 1,
      text: WORKSPACE_ANCHOR,
    });
  });
}

export { apply, inject, name };
