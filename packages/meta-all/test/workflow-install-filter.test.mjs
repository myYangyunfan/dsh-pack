// 回归锁：工作流里每一条 `pnpm install` 都必须带 --filter '!@dsh-pack/all'。
//
// 为什么这条要锁死：元包那 24 个依赖就是本仓成员自己，而 @dsh-pack 还没发到 registry。
// 只要哪条 install 漏掉这个 filter，pnpm 就会去 npmjs 取成员 tarball，当场
// ERR_PNPM_FETCH_404，整个 job 在装依赖阶段红掉（2026-10-19 实测：CI 的
// 「静态审计」与「单测」两个 job 就是这么红的）。这类红不报在业务判据上，
// 看起来像「CI 又抽风」，所以把它钉成一条会自己变的测试，而不是靠人记五处接线。
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
    out.push({ name, text: readFileSync(join(WORKFLOWS, name), 'utf8') });
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
  const text = readFileSync(join(WORKFLOWS, 'ci.yml'), 'utf8');
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
