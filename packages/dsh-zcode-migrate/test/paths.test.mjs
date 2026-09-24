// Path-rule tests.
//
// These pin the dsh storage conventions the migrator must reproduce. The
// fixtures are real directory names taken from a live `~/.dsh/sessions` root,
// so a drift in either direction (ours or dsh's) fails loudly.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'

import { encodeSegment, projectKey, projectDir, sessionLogPath, toDshSessionId, NO_CWD_DIR } from '../core/paths.js'

test('projectKey matches real dsh project directories', () => {
  // Taken verbatim from ~/.dsh/sessions（用户名统一替换成 tester：这是公开仓库，
  // 真实机器用户名不该进测试向量；规则本身与用户名无关）。
  const fixtures = [
    ['C:\\Users\\tester\\Desktop\\music_region', '--C-Users-tester-Desktop-music_region--'],
    ['C:\\Users\\tester\\Desktop\\deepseek_harness', '--C-Users-tester-Desktop-deepseek_harness--'],
    ['C:\\Users\\tester\\Desktop\\dsh-research', '--C-Users-tester-Desktop-dsh-research--'],
    // CJK code units take the ~XXXX escape.
    ['C:\\Users\\tester\\Desktop\\传送门', '--C-Users-tester-Desktop-~4F20~9001~95E8--'],
    ['C:\\Users\\tester\\Desktop\\杂活室', '--C-Users-tester-Desktop-~6742~6D3B~5BA4--'],
  ]
  for (const [cwd, expected] of fixtures) {
    assert.equal(projectKey(cwd), expected, cwd)
  }
})

test('projectKey collapses separator runs and strips leading dashes', () => {
  // A drive colon followed by a separator is one run, not two dashes.
  assert.equal(projectKey('C:\\a'), '--C-a--')
  assert.equal(projectKey('/home/me/project'), '--home-me-project--')
  // A trailing separator is a separator run of its own, so it survives as one
  // dash (dsh only trims *leading* dashes).
  assert.equal(projectKey('/home/me/project/'), '--home-me-project---')
  assert.equal(projectKey('C:\\a\\'), '--C-a---')
})

test('projectKey keeps dots, underscores and dashes literal', () => {
  assert.equal(projectKey('/a/b_c/d-e'), '--a-b_c-d-e--')
})

test('projectKey rejects an empty path', () => {
  assert.throws(() => projectKey(''), /empty project path/)
})

test('projectKey truncates the readable body to 251 chars', () => {
  const long = `/${'x'.repeat(400)}`
  const key = projectKey(long)
  assert.equal(key.length, 255) // 2 + 251 + 2
  assert.ok(key.startsWith('--xxx'))
  assert.ok(key.endsWith('--'))
})

test('encodeSegment escapes unsafe code units injectively', () => {
  assert.equal(encodeSegment('sess_61acfd01-54c9'), 'sess_61acfd01-54c9')
  assert.equal(encodeSegment('a b'), 'a~0020b')
  assert.equal(encodeSegment('a~b'), 'a~007Eb')
  assert.equal(encodeSegment('a/b'), 'a~002Fb')
  assert.equal(encodeSegment('..'), '~002E~002E')
  assert.equal(encodeSegment('.'), '~002E')
})

test('encodeSegment neutralizes traversal and separators', () => {
  for (const hostile of ['../etc/passwd', '..\\..\\win', 'a/b', 'C:\\x']) {
    const encoded = encodeSegment(hostile)
    assert.ok(!encoded.includes('/'), hostile)
    assert.ok(!encoded.includes('\\'), hostile)
    assert.ok(!encoded.includes(':'), hostile)
    assert.notEqual(encoded, '.')
    assert.notEqual(encoded, '..')
  }
})

test('projectDir uses _no-cwd when the session has no directory', () => {
  const root = join('sessions')
  assert.equal(projectDir(root, undefined), join(root, NO_CWD_DIR))
  assert.equal(projectDir(root, ''), join(root, NO_CWD_DIR))
  assert.equal(projectDir(root, 'C:\\proj'), join(root, projectKey('C:\\proj')))
})

test('sessionLogPath builds the full dsh artifact path', () => {
  const path = sessionLogPath('/root', 'C:\\proj', 'zcode-abc')
  assert.ok(!path.includes(NO_CWD_DIR))
  assert.ok(path.includes(projectKey('C:\\proj')))
  assert.ok(path.includes(encodeSegment('zcode-abc')))
  assert.ok(path.endsWith('session.jsonl.zstd'))
  assert.ok(sessionLogPath('/root', 'C:\\proj', 'zcode-abc', { compressed: false }).endsWith('session.jsonl'))
})

test('toDshSessionId is deterministic and namespaced', () => {
  assert.equal(toDshSessionId('sess_61acfd01-54c9'), 'zcode-61acfd01-54c9')
  assert.equal(toDshSessionId('sess_subagent_agent_9640e431'), 'zcode-subagent_agent_9640e431')
  // Same input always maps to the same id, so re-running overwrites one file.
  assert.equal(toDshSessionId('sess_x'), toDshSessionId('sess_x'))
})
