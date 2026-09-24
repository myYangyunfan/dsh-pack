// dsh session-storage path rules.
//
// These are byte-for-byte ports of the algorithms in
// `@deepseek-ai/dsh-session-persistence-jsonl` (`projectKey`, `encodeSegment`)
// and the fixed log basename. They MUST stay in sync with the installed dsh:
// a migrated session is only discoverable when its directory lands exactly
// where dsh looks for it.
//
//   <root>/--<projectKey(cwd)>--/<encodeSegment(id)>/session.jsonl.zstd

import { join } from 'node:path'

/** Log basename for the default (zstd-compressed) physical encoding. */
export const COMPRESSED_LOG_BASENAME = 'session.jsonl.zstd'

/** Log basename for `compression: 'none'`. */
export const PLAIN_LOG_BASENAME = 'session.jsonl'

/** Directory name used when a session has no working directory. */
export const NO_CWD_DIR = '_no-cwd'

/**
 * Encode an arbitrary string as one safe path segment, injectively over all
 * UTF-16 strings. Safe code units stay literal; everything else (including
 * `~`) becomes `~XXXX`. `.` and `..` are special-cased so an otherwise-safe
 * segment cannot traverse.
 *
 * @param {string} raw - non-empty string to encode.
 * @returns {string} a single filesystem-safe path segment.
 */
export function encodeSegment(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('cannot encode an empty path segment')
  }
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) out += ch
    else out += '~' + code.toString(16).toUpperCase().padStart(4, '0')
  }
  return out
}

/**
 * Build dsh's readable project-directory key for a working directory.
 *
 * Separator runs collapse to a single `-`, unsafe code units use the same
 * `~XXXX` escape as session ids, leading dashes are trimmed, and the result is
 * wrapped in `--`. Truncation to 251 chars is intentional and lossy, matching
 * the human-navigable convention dsh ships.
 *
 * @param {string} cwd - the session's project directory.
 * @returns {string} the project directory name under the sessions root.
 */
export function projectKey(cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw new Error('cannot encode an empty project path')
  }
  let readable = ''
  let separatorRun = false
  for (let i = 0; i < cwd.length; i++) {
    const code = cwd.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += '~' + code.toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`
}

/**
 * Resolve dsh's project directory under a sessions root.
 * @param {string} root - the sessions root (dsh's `root` config value).
 * @param {string|undefined} cwd - the session's working directory.
 * @returns {string} absolute project directory.
 */
export function projectDir(root, cwd) {
  if (cwd === undefined || cwd === null || cwd === '') return join(root, NO_CWD_DIR)
  return join(root, projectKey(cwd))
}

/**
 * Resolve the directory owned by one session.
 * @param {string} root - the sessions root.
 * @param {string|undefined} cwd - the session's working directory.
 * @param {string} id - the dsh session id.
 * @returns {string} absolute session directory.
 */
export function sessionDir(root, cwd, id) {
  return join(projectDir(root, cwd), encodeSegment(id))
}

/**
 * Resolve the append-only event-log path for one session.
 * @param {string} root - the sessions root.
 * @param {string|undefined} cwd - the session's working directory.
 * @param {string} id - the dsh session id.
 * @param {{ compressed?: boolean }} [options] - physical encoding selection.
 * @returns {string} absolute log path.
 */
export function sessionLogPath(root, cwd, id, { compressed = true } = {}) {
  return join(sessionDir(root, cwd, id), compressed ? COMPRESSED_LOG_BASENAME : PLAIN_LOG_BASENAME)
}

/**
 * Derive a stable dsh session id from a zcode session id.
 *
 * The mapping is deterministic and injective enough for our purpose: the same
 * zcode session always yields the same dsh id, so re-running a migration
 * overwrites the same artifact instead of accumulating duplicates. The
 * `zcode-` prefix keeps migrated sessions recognizable and avoids colliding
 * with ids dsh itself generated.
 *
 * @param {string} zcodeId - e.g. `sess_61acfd01-…` or `sess_subagent_agent_…`.
 * @returns {string} the dsh session id.
 */
export function toDshSessionId(zcodeId) {
  const bare = String(zcodeId).replace(/^sess_/, '')
  return `zcode-${bare}`
}
