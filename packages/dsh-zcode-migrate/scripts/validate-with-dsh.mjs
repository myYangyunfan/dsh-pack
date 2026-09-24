#!/usr/bin/env node
// Verify migrated artifacts with dsh's OWN session code.
//
// This is the strongest check available without booting dsh: it loads each
// artifact through the same packages dsh uses on read — the structural zstd
// frame decoder plus `@deepseek-ai/dsh-session-format-catalog`, which runs the
// released format migrations and current-format validation. An artifact that
// passes here is indistinguishable from a natively written log as far as dsh's
// reader is concerned.
//
// It deliberately lives outside `core/` and is never imported by the plugin:
// it depends on dsh's internal package layout, which is not a stable API.
//
//   node scripts/validate-with-dsh.mjs <sessions-root>
//   node scripts/validate-with-dsh.mjs <sessions-root> --dsh-modules <path>
//
// `--dsh-modules` defaults to `$DSH_HOME/profiles/node_modules` (then
// `~/.dsh/profiles/node_modules`).

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { zstdDecompressSync } from 'node:zlib'

const ZSTD_MAGIC = 0xfd2fb528
const MAGIC_BYTES = Buffer.alloc(4)
MAGIC_BYTES.writeUInt32LE(ZSTD_MAGIC, 0)

/** Structural zstd frame scan, mirroring dsh's own reader. */
function scanFrames(buffer) {
  const frames = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) return { frames, tornStart: start }
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      const next = buffer.indexOf(MAGIC_BYTES, offset + 1)
      if (next === -1) return { frames, tornStart: start }
      offset = next
      continue
    }
    offset += 4
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 24) !== 0) {
      const next = buffer.indexOf(MAGIC_BYTES, offset)
      if (next === -1) return { frames, tornStart: start }
      offset = next
      continue
    }
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 32) !== 0
    const checksum = (descriptor & 4) !== 0
    const dictionaryFlag = descriptor & 3
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    offset += (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    for (;;) {
      if (buffer.length - offset < 3) return { frames, tornStart: start }
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 3
      const blockSize = blockHeader >>> 3
      if (blockType === 3) return { frames, tornStart: start }
      const payloadBytes = blockType === 1 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start }
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) offset += 4
    frames.push({ start, end: offset })
  }
  return { frames, tornStart: null }
}

function decodeRecords(path) {
  const buffer = readFileSync(path)
  if (!path.endsWith('.zstd')) {
    return buffer.toString('utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
  }
  const { frames, tornStart } = scanFrames(buffer)
  const lines = []
  for (const frame of frames) {
    const text = zstdDecompressSync(buffer.subarray(frame.start, frame.end)).toString('utf8')
    for (const line of text.split('\n')) if (line.trim()) lines.push(line)
  }
  return { records: lines.map((line) => JSON.parse(line)), tornStart }
}

function findArtifacts(root) {
  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name === 'session.jsonl.zstd' || entry.name === 'session.jsonl') found.push(path)
    }
  }
  walk(root)
  return found
}

function resolveModules(explicit) {
  if (explicit) return resolve(explicit)
  const home = process.env.DSH_HOME ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh')
  return join(home, 'profiles', 'node_modules')
}

async function main() {
  const args = process.argv.slice(2)
  const root = args.find((arg) => !arg.startsWith('--'))
  const modulesFlag = args.indexOf('--dsh-modules')
  const modulesPath = resolveModules(modulesFlag >= 0 ? args[modulesFlag + 1] : null)

  if (!root) {
    console.error('用法: node scripts/validate-with-dsh.mjs <sessions-root> [--dsh-modules <path>]')
    return 2
  }

  const { sessionFormatCatalog } = await import(
    pathToFileURL(join(modulesPath, '@deepseek-ai', 'dsh-session-format-catalog', 'lib', 'index.js')).href
  )

  const artifacts = findArtifacts(resolve(root))
  if (!artifacts.length) {
    console.error(`没有找到会话产物: ${resolve(root)}`)
    return 1
  }

  let passed = 0
  let events = 0
  const failures = []
  for (const path of artifacts) {
    try {
      const decoded = decodeRecords(path)
      const records = Array.isArray(decoded) ? decoded : decoded.records
      if (!records.length || records[0].type !== 'session') throw new Error('首条记录不是会话头')
      const restore = sessionFormatCatalog.createRestore(records[0], {
        recovery: 'recoverable',
        validation: 'current',
      })
      for (const record of records.slice(1)) restore.decodeRow(record)
      const restored = restore.finish()
      events += restored.events.length
      passed += 1
    } catch (err) {
      failures.push([path, err.message])
    }
  }

  console.log(`dsh 校验: ${passed}/${artifacts.length} 通过 · ${events} 事件`)
  for (const [path, message] of failures) {
    console.log(`  失败 ${path.replace(resolve(root), '')} :: ${message}`)
  }
  return failures.length ? 1 : 0
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
