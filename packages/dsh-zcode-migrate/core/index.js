// Framework-agnostic entry point for the zcode → dsh session migrator.
//
// `core/` knows nothing about dsh's plugin runtime — it is plain Node with no
// third-party dependencies (built-in `node:sqlite` + `node:zlib` only). The dsh
// adapter in `src/` is a thin layer over this, mirroring the "core vs binding"
// split so the migrator stays usable from a CLI, a test harness, or another
// host without change.

export { migrate, inspect, readArtifact, verifyArtifact, resolveOptions, DEFAULT_DSH_ROOT } from './migrate.js'
export { convertSession, usageFromTokens, turnEndReason, DEFAULT_TOOL_NAME_MAP, SESSION_FORMAT_VERSION } from './convert.js'
export {
  connect,
  openDatabase,
  snapshotDatabase,
  defaultSnapshotPath,
  listSessions,
  readMessages,
  stats as databaseStats,
  expandPath,
  assertSchema,
  DEFAULT_DB_PATH,
} from './zcode.js'
export {
  projectKey,
  projectDir,
  sessionDir,
  sessionLogPath,
  encodeSegment,
  toDshSessionId,
  COMPRESSED_LOG_BASENAME,
  PLAIN_LOG_BASENAME,
  NO_CWD_DIR,
} from './paths.js'
export { encodeSessionLog, encodeRecordFrame, readSessionLog, scanZstdFrames, expandRow, hasZstd } from './zstdlog.js'
export { MigrateError, ConfigError, ZcodeDbError, ConvertError, RuntimeError, toErrorPayload } from './errors.js'
