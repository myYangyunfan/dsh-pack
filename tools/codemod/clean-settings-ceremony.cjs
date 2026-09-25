// 清掉 settings.register 迁移后剩下的仪式代码与降级外壳。
// 每条替换都要求**精确命中一次**，命中不到就报错退出 —— 免得静默漏改。
const fs = require('node:fs');

const edits = [
  {
    file: 'packages/dsh-quest-ui/lib/index.js',
    from: `function apply(ctx, config) {
  // 与 conversation-tweaks 相同的降级策略：register 抛异常时只告警，
  // 绝不阻断 dsh 启动（fail-loud 语义下插件 fiber 失败会崩启动）。
  try {
    const scope = void 0;
    return () => { void scope; };
  } catch (error) {
    console.warn("[dsh-quest-ui] settings section unavailable: " + ((error && error.message) || error));
  }
}`,
    to: `function apply(ctx) {
  // 设置读写全在页内半边（ctx.remote.settings）；宿主只需导出带 volatile 的 Config。
  // 开关由本包在「设置-通用」自己投一行，关掉内核自动生成页免得出现两处。
  ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber));
}`,
  },
  {
    file: 'packages/dsh-quest-ui/lib/index.js',
    from: '  questMode: z.boolean().default(false)',
    to: '  // 必须 volatile：非 volatile 字段不进 describe() 的表单，页内既读不到也写不回。\n  questMode: z.boolean().volatile().default(false)',
  },
  {
    file: 'packages/dsh-subagent-lens/lib/index.js',
    from: `const NS = 'dsh-subagent-lens';

export function apply(ctx, config) {
    try {
        void 0;
    } catch (error) {
        // 存储的配置节非法（或 settings 面不可用）时降级为组合配置，不阻断启动。
        console.warn('[dsh-subagent-lens] settings section unavailable (invalid stored config); lens falls back to defaults: ' + ((error && error.message) || error));
    }
}`,
    to: `export function apply() {
    // 设置读写全在页内半边（ctx.remote.settings）；宿主只需导出带 volatile 的 Config。
}`,
  },
  {
    file: 'packages/dsh-easyrewrite/lib/index.js',
    from: `  try {
    if (ctx.settings && typeof ctx.settings.register === 'function') {
      const dummySchema = (x) => x ?? {};
      dummySchema.toJSON = () => ({ type: 'object' });
      ctx.settings.register(settingsNamespace('dsh-easyrewrite'), dummySchema);
      writeLog('info', 'host', 'settings namespace 已注册（插件配置卡片可用）');
    }
  } catch (err) {
    writeLog('warn', 'host', 'settings namespace 注册失败（不影响核心功能）', { err: String(err?.message ?? err) });
  }
`,
    to: `  // 这里原先用 \`typeof ctx.settings.register === 'function'\` 守卫着调一个内核根本
  // 不存在的 API（SettingsForms 没有 register），所以整个 if 恒假 —— 既没注册上
  // 任何东西，也不报错，是最难查的静默失效。本插件没有需要持久化的设置项
  // （dummySchema 只为让设置页出现一张空卡片），要真加设置项就按声明式导出
  // 带 .volatile() 字段的 Config。
`,
  },
];

for (const e of edits) {
  const src = fs.readFileSync(e.file, 'utf8');
  // 这些包里有的是 CRLF。匹配串按 LF 写，比对前先按文件实际行尾归一，
  // 否则会像上一版那样「命中 0 次」而误判成代码没写对。
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const adapt = (s) => (eol === '\r\n' ? s.replace(/\r?\n/g, '\r\n') : s);
  const from = adapt(e.from);
  const to = adapt(e.to);
  const hits = src.split(from).length - 1;
  if (hits !== 1) {
    console.error(`✗ ${e.file}: 目标片段命中 ${hits} 次（要求恰好 1 次），中止`);
    process.exit(1);
  }
  fs.writeFileSync(e.file, src.replace(from, to));
  console.log(`✓ ${e.file}（${eol === '\r\n' ? 'CRLF' : 'LF'}）`);
}
