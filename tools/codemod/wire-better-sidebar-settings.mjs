// 一次性把 dsh-better-sidebar 宿主半边接到真实 settings API。
// 三步：ns 改成 profile 条目 id；幽灵 register 换成 mountSettingsScope；插入宿主适配器。
import { readFileSync, writeFileSync } from 'node:fs';
import { HOST_SNIPPET } from '../snippets/settings-scope-host.mjs';

const file = 'packages/dsh-better-sidebar/lib/index.js';
let src = readFileSync(file, 'utf8');
const log = [];

const OLD_NS = 'const SIDEBAR_PREFS_NS = "dsh-better-sidebar";';
if (src.includes(OLD_NS)) {
  src = src.replace(OLD_NS,
    '// settings.describe()/update() 的 ns 是 **profile 条目 id**（cordis.patch.yml 里的\n'
    + '// `- id: better-sidebar`），不是 npm 包名。原先写成 "dsh-better-sidebar" ⇒ find 永远\n'
    + '// 不命中，viewOf() 恒返回 { value: undefined } ⇒ 侧栏偏好静默丢失。\n'
    + 'const SIDEBAR_PREFS_NS = "better-sidebar";');
  log.push('ns → 条目 id');
} else log.push('⚠ 未找到旧 ns 字面量');

const OLD_REG = 'const scope = sctx.settings.register(ns, PrefsSchema);';
if (src.includes(OLD_REG)) {
  src = src.replace(OLD_REG, 'const scope = mountSettingsScope(sctx, config, ns);');
  log.push('register → mountSettingsScope');
} else log.push('⚠ 未找到 register 调用');

const ANCHOR = src.match(/^function apply\(ctx, config\) \{/m);
if (!ANCHOR) log.push('⚠ 找不到 apply 锚点');
else if (src.includes('<<BEGIN settings-host')) log.push('宿主适配器已存在，跳过');
else {
  src = `${src.slice(0, ANCHOR.index)}${HOST_SNIPPET}\n\n${src.slice(ANCHOR.index)}`;
  log.push('已插入宿主适配器');
}

writeFileSync(file, src);
console.log(log.join('\n'));
