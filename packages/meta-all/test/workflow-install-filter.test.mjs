// 回归锁：工作流里每一条 `pnpm install` 都必须带 --filter '!@dsh-pack/all'。
//
// 这条是**第二层保险**，主修是 pnpm-workspace.yaml 的 linkWorkspacePackages: true（它让 lock 里
// 不再存在 @dsh-pack 的 registry 条目，见 .github/RELEASE_RUNBOOK.md「CI 的 install」一节）。
// 为什么两层都要钉：@dsh-pack 还没发到 registry，任何「按 registry 取自家成员」的写法都会
// ERR_PNPM_FETCH_404，而这类红落在装依赖阶段，看起来像「CI 又抽风」，不报在任何业务判据上。
//
// 顺带记下这条排查教训：本机第一次验「filter 够用」时 install 是 exit 0，那是假绿 ——
// store 里还留着上一轮从 verdaccio 装进去的成员 tarball，pnpm 压根没发请求。同一命令在 CI
// （空 store）里照样 404。所以判 lock 形状要看 `packages:` 里 @dsh-pack 的条目数（应为 0），
// 不能只看本机 install 的退出码。
//
// 反证跟着判据走：把同一份文本里的 filter 抹掉，必须当场报出那一行。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = resolve(here, '..', '..', '..', '.github', 'workflows');
const REQUIRED = `--filter '!@dsh-pack/all'`;
// 进门先归一行尾：PACK 没有 .gitattributes，工作树是 CRLF，而本仓里带 \n 字面量的
// 变异/匹配一律静默空转（变异体等于原件，用例报绿却什么都没证）。
const toLF = (s) => s.replace(/\r\n/g, '\n');

/** 纯判据：返回缺 filter 的 install **命令行**（行号 + 原文）。
 *  只认 `run:` / `install:` 开头的执行行——散文注释里出现「pnpm install」不算接线，
 *  第一版就是被 CI 那句「不加这个会让 pnpm install 直接以 ERR_PNPM_IGNORED_BUILDS 失败」
 *  的说明行判了两次假红，所以判据必须收紧到命令本身。 */
function installLinesMissingFilter(text) {
  const bad = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!/^\s*(?:-\s*run:|install:)\s*pnpm install/.test(line)) return;
    if (!line.includes(REQUIRED)) bad.push({ line: i + 1, text: line.trim() });
  });
  return bad;
}

function workflowTexts() {
  const out = [];
  for (const name of readdirSync(WORKFLOWS).sort()) {
    if (!/\.ya?ml$/.test(name)) continue;
    out.push({ name, text: toLF(readFileSync(join(WORKFLOWS, name), 'utf8')) });
  }
  return out;
}

test('仓库现状：每条 pnpm install 都带元包 filter，且确实有 install 行在跑', () => {
  const files = workflowTexts();
  assert.ok(files.length >= 2, `只读到 ${files.length} 个工作流，判据可能根本没在跑`);
  let seen = 0;
  for (const f of files) {
    const bad = installLinesMissingFilter(f.text);
    assert.deepEqual(bad, [], `${f.name} 里有 install 行缺 ${REQUIRED}: ${JSON.stringify(bad)}`);
    seen += installLinesWithFilter(f.text).length;
  }
  assert.ok(seen >= 4, `全部工作流里只找到 ${seen} 条带 filter 的 pnpm install，接线疑似被删`);
});

/** 反向集合：带 filter 的 install 命令行（与上面共用「只认命令」这一形状）。 */
function installLinesWithFilter(text) {
  return text.split(/\r?\n/).filter(
    (line) => /^\s*(?:-\s*run:|install:)\s*pnpm install/.test(line) && line.includes(REQUIRED)
  );
}

test('反证：抹掉一处 filter 必须报出那一行（漏接线就是 CI 红）', () => {
  const text = toLF(readFileSync(join(WORKFLOWS, 'ci.yml'), 'utf8'));
  assert.deepEqual(installLinesMissingFilter(text), []);
  // 只改**命令行**上的 filter。第一版这里写的是 text.replace(REQUIRED,'')，
  // 结果被删的是上面那行注释里的字面量，两条命令都还在 ⇒ 变异体等于原件、反证空转。
  const mutated = text.replace(/(^\s*- run: pnpm install[^\n]*?) --filter[^\n]*/m, '$1');
  assert.notEqual(mutated, text, '变异没命中任何 install 命令行，反证是空跑');
  const bad = installLinesMissingFilter(mutated);
  assert.equal(bad.length, 1, `变异后应恰好一条，实得 ${JSON.stringify(bad)}`);
  assert.match(bad[0].text, /^- run: pnpm install/);
});

test('反证：判据认的是行，不是整篇文本——注释里提到 filter 不算接线', () => {
  const sample = [
    '# 别忘了 --filter \'!@dsh-pack/all\'',
    '      - run: pnpm install --frozen-lockfile=false',
  ].join('\n');
  const bad = installLinesMissingFilter(sample);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].line, 2);
});

// 第二件事：跑 boot-desktop-profile（J1/J2/J3）的 job 必须先装 pnpm。
// 起因（2026-10-19 CI 实测）：itest / itest-builds 两个 job 只有 actions/setup-node，
// 而内核的 `dsh plugin add` 是 shell 出去调 pnpm 的，J1 第一步就报
// 'pnpm' is not recognized as an internal or external command。这两个 job 此前从没跑到过
// （install 阶段先红），所以这个洞一直藏着 —— 靠人记「哪个 job 需要 pnpm」是靠不住的。
//
// 判据为什么盯 boot-desktop-profile.mjs 而不是「body 里出现 pnpm」：itest 那个 job 的步骤里
// 除了 pnpm/action-setup 本身，根本没有第二个字面量 pnpm（YAML 注释会被解析器剥掉）。
// 写成「提到 pnpm 就得装 pnpm」的话，删掉 setup 之后那个 job 直接掉出名单，断言拿到空数组、
// 以为一切正常 —— 这条规则的成因恰恰是它自己会漏掉的那个洞，所以按「跑什么脚本」判定。
const YAML = await import('yaml');

function itestJobs(ymlText) {
  const doc = YAML.parse(ymlText);
  const jobs = doc && doc.jobs ? doc.jobs : {};
  return Object.entries(jobs)
    .map(([id, job]) => {
      const steps = Array.isArray(job && job.steps) ? job.steps : [];
      const runsHarness = steps.some((s) => /tools\/itest\/boot-desktop-profile\.mjs/.test(s.run || ''));
      return { id, runsHarness, hasSetup: steps.some((s) => /^pnpm\/action-setup@/.test(s.uses || '')) };
    })
    .filter((j) => j.runsHarness);
}

test('仓库现状：每个跑 boot-desktop-profile 的 job 都装了 pnpm/action-setup', () => {
  for (const file of ['ci.yml', 'release.yml']) {
    const list = itestJobs(toLF(readFileSync(join(WORKFLOWS, file), 'utf8')));
    if (file === 'ci.yml') assert.ok(list.length >= 2, `ci.yml 里只认出 ${list.length} 个跑集成校验的 job，判据疑似失效`);
    const missing = list.filter((j) => !j.hasSetup).map((j) => j.id);
    assert.deepEqual(missing, [], `${file} 里这些 job 要调 pnpm 却没装 pnpm/action-setup: ${missing.join(', ')}`);
  }
});

test('反证：删掉某个 job 的 pnpm/action-setup 必须被点名（否则又是「跑不到就看不见」）', () => {
  const text = toLF(readFileSync(join(WORKFLOWS, 'ci.yml'), 'utf8'));
  assert.deepEqual(itestJobs(text).filter((j) => !j.hasSetup), []);
  const mutated = text.replace('      - uses: pnpm/action-setup@v4\n        with:\n          version: 11.7.0\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 24\n      - name: 缓存官方内核', '      - uses: actions/setup-node@v4\n        with:\n          node-version: 24\n      - name: 缓存官方内核');
  assert.notEqual(mutated, text, '变异没命中 itest job 的 pnpm 安装步骤，反证是空跑');
  const missing = itestJobs(mutated).filter((j) => !j.hasSetup).map((j) => j.id);
  assert.deepEqual(missing, ['itest'], `变异后应恰好点名 itest，实得 ${JSON.stringify(missing)}`);
});
