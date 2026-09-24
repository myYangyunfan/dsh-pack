// Error taxonomy for the zcode → dsh migrator.
//
// Every failure carries a stable `code` plus an actionable `suggestion`, so the
// dsh tool layer can hand the model a structured payload (12-factor Factor 9)
// instead of a stack trace. `core/` stays framework-agnostic — nothing here
// imports dsh.

export class MigrateError extends Error {
  constructor(message, { code = 'MIGRATE_ERROR', suggestion = null, cause = null } = {}) {
    super(message)
    this.name = 'MigrateError'
    this.code = code
    this.suggestion = suggestion
    if (cause) this.cause = cause
  }
}

/** The plugin config is missing or internally inconsistent. */
export class ConfigError extends MigrateError {
  constructor(message, options = {}) {
    super(message, { code: 'CONFIG_ERROR', ...options })
    this.name = 'ConfigError'
  }
}

/** The zcode sqlite database is missing, locked, or has an unexpected schema. */
export class ZcodeDbError extends MigrateError {
  constructor(message, options = {}) {
    super(message, { code: 'ZCODE_DB_ERROR', ...options })
    this.name = 'ZcodeDbError'
  }
}

/** A session row exists but cannot be turned into a dsh event log. */
export class ConvertError extends MigrateError {
  constructor(message, options = {}) {
    super(message, { code: 'CONVERT_ERROR', ...options })
    this.name = 'ConvertError'
  }
}

/** The runtime lacks a built-in this migrator depends on. */
export class RuntimeError extends MigrateError {
  constructor(message, options = {}) {
    super(message, { code: 'RUNTIME_ERROR', ...options })
    this.name = 'RuntimeError'
  }
}

/** Normalize any thrown value into the compact payload tools return. */
export function toErrorPayload(err) {
  if (err instanceof MigrateError) {
    return {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.suggestion ? { suggestion: err.suggestion } : {}),
      },
    }
  }
  return {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: err && err.message ? String(err.message) : String(err),
    },
  }
}
