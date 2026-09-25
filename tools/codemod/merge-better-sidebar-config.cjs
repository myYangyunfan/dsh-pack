// 把 dsh-better-sidebar 的 PrefsSchema 并进导出的 Config（CRLF 安全版）。
//
// 为什么必须并：只有导出的 `Config` 会被 cordis 的 resolveConfig() 校验、被
// `settings.describe()` 收录。原先界面偏好走的是**不存在的** `settings.register(PrefsSchema)`，
// 那份偏好从来没进过设置页；而读它用的 ns 还写成包名（describe 的 ns 是 profile 条目 id）。
//
// ⚠ 本文件是纯 CRLF。上一版脚本用 split('\n') + join('\n') 重建，把整文件转成 LF，
//   造成 3900 行伪 diff。这里全程按 \r\n 切、按 \r\n 拼。
const fs = require('node:fs');

const file = 'packages/dsh-better-sidebar/lib/index.js';
const raw = fs.readFileSync(file, 'utf8');
if (!raw.includes('\r\n')) throw new Error('预期 CRLF 文件，实际没有 CR —— 中止以免改坏行尾');
const L = raw.split('\r\n');

const cfgS = L.findIndex((l) => /^const Config = z\.object\(\{/.test(l));
const prfS = L.findIndex((l) => /^const PrefsSchema = z\.object\(\{/.test(l));
if (cfgS < 0 || prfS < 0) throw new Error('找不到两个 schema 声明');
const closeOf = (s) => {
  for (let i = s + 1; i < L.length; i += 1) if (/^\}\);/.test(L[i])) return i;
  throw new Error('找不到对象字面量结尾');
};
const cfgE = closeOf(cfgS);
const prfE = closeOf(prfS);

const cfgBody = L.slice(cfgS + 1, cfgE);
const prfBody = L.slice(prfS + 1, prfE).map((l) =>
  (/^\t[A-Za-z_]+: z\./.test(l) && !/\.volatile\(\)/.test(l) ? l.replace(/\.default\(/, '.volatile().default(') : l));
// 末字段没有尾逗号，追加任何字段前必须补上，否则断句
if (prfBody.length && !/[,{}]$/.test(prfBody[prfBody.length - 1].trim())) {
  prfBody[prfBody.length - 1] = `${prfBody[prfBody.length - 1]},`;
}

const out = [
  ...L.slice(0, cfgS),
  'const Config = z.object({',
  '\t// ---- 界面偏好（原 PrefsSchema 已并入：只有导出的 Config 会被 resolveConfig 校验、',
  '\t//      被 settings.describe() 收录；字段必须 volatile，否则既进不了设置页也写不回）----',
  ...prfBody,
  '\t// ---- 运行期限额（原 Config 字段）----',
  ...cfgBody,
  '});',
  '// 旧引用名保留为别名；偏好与运行期参数现在是同一份声明式 Config。',
  'const PrefsSchema = Config;',
  ...L.slice(cfgE + 1, prfS),
  ...L.slice(prfE + 1),
];

fs.writeFileSync(file, out.join('\r\n'));
console.log(`已并入（保持 CRLF）：偏好字段 ${prfBody.length} 行，原 Config ${cfgBody.length} 行`);
