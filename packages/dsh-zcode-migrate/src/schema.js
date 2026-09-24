// Config schema factory.
//
// Under a real DeepSeek Harness host, cordis may expose a declarative `Schema`.
// When it does not (the deepseek-harness cordis 4.0.x fork validates plugin
// config through the Standard Schema v1 interface instead), this module
// provides a tiny schema with the same `.default()` / `.description()` /
// `.required()` chaining surface plus that contract, so the plugin's
// `export const Config` works on any host.

let Schema = null

try {
  const cordis = await import('@deepseek-ai/cordis')
  if (cordis && cordis.Schema) Schema = cordis.Schema
} catch {
  /* fall through to the local schema */
}

if (!Schema) {
  const issue = (message, path) => ({ message, path: path || [] })

  const validate = (schema, input, path = []) => {
    if (input === undefined) {
      if (schema.requiredValue) return { issues: [issue('Value is required.', path)] }
      if (schema.defaultValue !== undefined) return { value: schema.defaultValue }
      return { value: undefined }
    }
    switch (schema.kind) {
      case 'string':
        return typeof input === 'string' ? { value: input } : { issues: [issue('Expected a string.', path)] }
      case 'number':
        return typeof input === 'number' && !Number.isNaN(input)
          ? { value: input }
          : { issues: [issue('Expected a number.', path)] }
      case 'boolean':
        return typeof input === 'boolean' ? { value: input } : { issues: [issue('Expected a boolean.', path)] }
      case 'array': {
        if (!Array.isArray(input)) return { issues: [issue('Expected an array.', path)] }
        const value = []
        const issues = []
        for (let i = 0; i < input.length; i++) {
          const result = validate(schema.children, input[i], [...path, i])
          if (result.issues) issues.push(...result.issues)
          else value.push(result.value)
        }
        return issues.length ? { issues } : { value }
      }
      case 'dict': {
        if (input === null || typeof input !== 'object' || Array.isArray(input)) {
          return { issues: [issue('Expected an object.', path)] }
        }
        const value = {}
        const issues = []
        for (const [key, raw] of Object.entries(input)) {
          const result = validate(schema.children, raw, [...path, key])
          if (result.issues) issues.push(...result.issues)
          else value[key] = result.value
        }
        return issues.length ? { issues } : { value }
      }
      case 'object': {
        if (input === null || typeof input !== 'object' || Array.isArray(input)) {
          return { issues: [issue('Expected an object.', path)] }
        }
        const value = {}
        const issues = []
        for (const [key, child] of Object.entries(schema.children || {})) {
          const result = validate(child, input[key], [...path, key])
          if (result.issues) issues.push(...result.issues)
          else if (result.value !== undefined) value[key] = result.value
        }
        // Unknown keys pass through: forward-compatible with newer host config.
        for (const key of Object.keys(input)) if (!(key in value)) value[key] = input[key]
        return issues.length ? { issues } : { value }
      }
      default:
        return { value: input }
    }
  }

  const node = (kind, opts = {}) => {
    const schema = {
      kind,
      desc: opts.description ?? null,
      defaultValue: undefined,
      requiredValue: false,
      children: opts.children ?? null,
    }
    schema.description = (text) => {
      schema.desc = text
      return schema
    }
    schema.default = (value) => {
      schema.defaultValue = value
      return schema
    }
    schema.required = (value = true) => {
      schema.requiredValue = value
      return schema
    }
    schema['~standard'] = {
      version: 1,
      vendor: 'dsh-zcode-migrate',
      validate: (input) => validate(schema, input),
    }
    return schema
  }

  Schema = {
    string: (opts) => node('string', opts),
    number: (opts) => node('number', opts),
    boolean: (opts) => node('boolean', opts),
    array: (item, opts) => node('array', { ...opts, children: item }),
    dict: (item, opts) => node('dict', { ...opts, children: item }),
    object: (fields, opts) => node('object', { ...opts, children: fields }),
  }
}

export { Schema }
