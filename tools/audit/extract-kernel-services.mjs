// 从已安装的官方内核抽取「真实存在的服务名」与 SettingsForms 的方法名，
// 落成 tools/audit/kernel-services.json 给 settings-api 门禁当判据。
//
// 抽取口径（都是**正向**证据，不是猜名字）：
//   · `super(ctx, "name"` / `super(this.ctx, "name", { namespace: "x" })` —— Service 注册名
//   · `ctx.provide("name"`                                                  —— 显式提供的服务
//   · `namespace: "name"`                                                   —— remote 命名空间
//   · `const *SERVICE* = "name"`                                            —— 服务名常量
//   · 内核自己的 `inject = [...]` / `inject: [...]` 里的每一项              —— 最强信号：
//     官方代码敢声明依赖的名字，必然是真服务（webRuntime 就是靠这条抓到的）
//
// 用法：node tools/audit/extract-kernel-services.mjs [node_modules 路径]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] || 'node_modules/@deepseek-ai';
if (!existsSync(root)) {
  console.error(`找不到内核目录 ${root}（先 npm i @deepseek-ai/dsh）`);
  process.exit(2);
}

const services = new Set();
const settingsMethods = new Set();
const PATTERNS = [
  /super\(\s*(?:this\.)?\w+\s*,\s*["']([a-zA-Z][A-Za-z0-9]*)["']/g,
  /ctx\.provide\(\s*["']([a-zA-Z][A-Za-z0-9]*)["']/g,
  /namespace:\s*["']([a-zA-Z][A-Za-z0-9]*)["']/g,
  /const\s+[A-Z0-9_]*SERVICES?\s*=\s*["']([a-zA-Z][A-Za-z0-9]*)["']/g,
];

let files = 0;
for (const pkg of readdirSync(root)) {
  for (const rel of ['lib/index.js', 'lib/client.js']) {
    const f = join(root, pkg, rel);
    if (!existsSync(f)) continue;
    const src = readFileSync(f, 'utf8');
    files += 1;
    for (const re of PATTERNS) {
      for (const m of src.matchAll(re)) services.add(m[1]);
    }
    // 内核自己的 inject 名单：官方代码声明依赖的名字必然是真服务
    for (const m of src.matchAll(/\binject\s*[:=]\s*(?:\[|\(\s*\[)([^\])]*?)\]/g)) {
      for (const q of m[1].matchAll(/["']([a-zA-Z][A-Za-z0-9]*)["']/g)) services.add(q[1]);
    }
    if (pkg === 'dsh-settings') {
      const cls = src.slice(src.indexOf('SettingsForms = class'));
      for (const m of cls.matchAll(/^\t(?:async )?([a-zA-Z][A-Za-z0-9]*)\(/gm)) settingsMethods.add(m[1]);
    }
  }
}

// 内部实现细节不算可依赖的服务名
for (const junk of ['constructor', 'settingsController', 'write']) services.delete(junk);

const out = {
  note: '由 tools/audit/extract-kernel-services.mjs 从官方内核抽取；settings-api 门禁据此判「服务/方法是否存在」',
  serviceCount: services.size,
  services: [...services].sort(),
  settingsMethods: [...settingsMethods].sort(),
};
writeFileSync(join('tools', 'audit', 'kernel-services.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`扫 ${files} 个内核文件 → 服务名 ${services.size} 个，SettingsForms 方法 ${settingsMethods.size} 个`);
for (const probe of ['settings', 'webServer', 'webRuntime', 'sessionController', 'slots', 'remote']) {
  console.log(`  含 ${probe}: ${services.has(probe)}`);
}
for (const phantom of ['settingsScope', 'apiProxy']) {
  console.log(`  幽灵 ${phantom} 未被误收: ${!services.has(phantom)}`);
}
