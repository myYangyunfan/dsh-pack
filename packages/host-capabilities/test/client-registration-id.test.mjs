// 回归锁：页内 bundle 的注册名必须等于包名。
//
// 起因（真机实测，官方客户端一次报 20 条）：
//   @dsh-pack/dsh-input-fold: Error: client-modules: could not load
//   "@dsh-pack/dsh-input-fold": plugins/??@dsh-pack/dsh-input-fold/client.js&rev=…:
//   loaded without registering "@dsh-pack/dsh-input-fold" via __ModuleLoader__.load
//
// 机制：内核 @deepseek-ai/dsh-client-modules 的 boot graph 行以**包名**为 id
// （client.js:625 arrive(row) 载完 bundle 后查 factories.has(row.id)），而 register()
// 的键是 stripClientSuffix(registration.id)（client.js:569-579）。bundle 里写裸名
// 'dsh-input-fold' 或旧 scope 名 '@dsh-external/dsh-vision' 时， factories 里的键和
// 行键对不上，那一行永远等不到 —— 回落 URL 也救不回来，因为它注册的还是同一个错名。
// 失败形态是**静默不挂载**（宿主照常起来、插件没反应），不是崩溃，所以必须静态拦住。
//
// 判据直接取 tools/audit/publish-readiness.js 导出的同一份实现（只读引用，不改门禁），
// 避免测试与门禁各写一套判据而漂移。
//
// 反证要求（仓库纪律）：下面把判据一项项拆掉，看结论是否随之翻转。
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const gate = require(resolve(here, "..", "..", "..", "tools", "audit", "publish-readiness.js"));
const { detectPackRoot, clientBlock } = require(resolve(here, "..", "..", "..", "tools", "audit", "shared.js"));

const NAME = "@dsh-pack/dsh-demo";

/** 门禁判据 + 用例里反复出现的两种形态，包一层少写点字面量。 */
function ok(id) {
  return gate.registrationIdMatches(NAME, gate.clientRegistrationId(id));
}
function src(idLine) {
  return `window.__ModuleLoader__.load({\n${idLine}\n\tfactory: (require) => {\n\t\treturn {};\n\t},\n});\n`;
}

test("包名本身命中", () => {
  assert.equal(gate.clientRegistrationId(src(`id: "${NAME}",`)), NAME);
  assert.ok(ok(src(`id: "${NAME}",`)));
});

test('<name>/client 也命中（register 走 stripClientSuffix）', () => {
  // 内核 stripClientSuffix 会把尾部 "/client" 剥掉，所以这一种写法同样对得上行键。
  assert.equal(gate.clientRegistrationId(src(`id: "${NAME}/client",`)), `${NAME}/client`);
  assert.ok(ok(src(`id: "${NAME}/client",`)));
});

test("裸名（不带 scope）必须判为不符 —— 这就是真机那 20 条", () => {
  assert.equal(gate.clientRegistrationId(src(`id: "dsh-demo",`)), "dsh-demo");
  assert.ok(!ok(src(`id: "dsh-demo",`)));
});

test("旧 scope 名必须判为不符", () => {
  assert.ok(!ok(src(`id: "@dsh-external/dsh-demo",`)));
  assert.ok(!ok(src(`id: "@dsh-pack/demo",`))); // scope 对但目录名不对，同样不放过
});

test("没有注册点必须判为不符（而不是悄悄放过）", () => {
  assert.equal(gate.clientRegistrationId(`export const name = "dsh-demo";\n`), undefined);
  assert.ok(!ok(`export const name = "dsh-demo";\n`));
});

test("取的是 load 之后第一个 id，factory 体内的 id 不算", () => {
  const text = src(`id: "${NAME}",`) + `\nconst cfg = { id: "some-row" };\n`;
  assert.equal(gate.clientRegistrationId(text), NAME);
  // 反证：把真正的注册名换掉，即便 factory 体内另有正确写法的名字，也必须判为不符。
  assert.equal(gate.clientRegistrationId(src(`id: "dsh-demo",`) + `\nconst cfg = { id: "${NAME}" };\n`), "dsh-demo");
});

test("单引号 / 制表符 / 冒号两侧留白都得认", () => {
  assert.equal(gate.clientRegistrationId(src(`\tid:'${NAME}',`)), NAME);
  assert.equal(gate.clientRegistrationId(src(`  id : '${NAME}' ,`)), NAME);
});

test("注释里提到 __ModuleLoader__.load 不能被当成注册点", () => {
  // 真实文件形状：dsh-input-fold/lib/client.js 第 3 行就有这么一句注释，
  // 后面第 294 行才是真正的 load。若判据被注释带偏，取到的会是错的那一处。
  const text = `// 浏览器半边（classic-script bundle，经 __ModuleLoader__.load 注册）：\n` + src(`  id: '${NAME}',`);
  assert.equal(gate.clientRegistrationId(text), NAME);
});

test("仓库现状：每个声明 dsh.client 的包都必须注册为包名", () => {
  const pack = detectPackRoot();
  assert.ok(pack.exists, "未找到插件包根");
  const offenders = [];
  let checked = 0;
  for (const pkg of pack.packages) {
    const m = pkg.manifest;
    if (!m || !m.exports) continue;
    // 声明口径与门禁共用 shared.clientBlock，不另写一套判据。
    if (!clientBlock(m)) continue;
    const target = typeof m.exports["./client"] === "string"
      ? m.exports["./client"]
      : m.exports["./client"] && (m.exports["./client"].default || m.exports["./client"].browser);
    if (!target) continue;
    checked += 1;
    const id = gate.clientRegistrationId(readFileSync(join(pkg.dir, target.replace(/^\.\//, "")), "utf8"));
    if (!gate.registrationIdMatches(m.name, id)) offenders.push(`${m.name} → ${JSON.stringify(id)}`);
  }
  // 反证的一部分：样本量必须非零，否则这条锁等于没锁（历史上假绿踩过）。
  assert.ok(checked >= 20, `只检查到 ${checked} 个 client bundle，样本量可疑`);
  assert.deepEqual(offenders, []);
});
