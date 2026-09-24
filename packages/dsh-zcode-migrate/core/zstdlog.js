// Physical encoding for dsh session logs.
//
// dsh's shipped JSONL backend writes one *checksummed Zstandard frame* per
// storage record (or per packed chunk run), appended to a single file. The
// first record of the first frame is the private v0 session header. Readers
// walk the file structurally — they locate frame boundaries from each frame's
// own header/block structure rather than trusting an index — so a writer only
// has to emit well-formed frames in order.
//
// This module owns both directions:
//   * `encodeRecordFrame` — the exact framing dsh writes (checksum on,
//     content size omitted, hence `singleSegment = false`).
//   * `readSessionLog` — a structural scanner ported from dsh's own reader,
//     used to verify a migrated artifact without launching dsh.

import { constants, zstdCompressSync, zstdDecompressSync } from 'node:zlib'

const ZSTD_MAGIC = 0xfd2fb528
const MAGIC_BYTES = Buffer.alloc(4)
MAGIC_BYTES.writeUInt32LE(ZSTD_MAGIC, 0)

/** zstd parameter ids used to match dsh's framing. */
const ZSTD_c_checksumFlag = constants.ZSTD_c_checksumFlag
const ZSTD_c_contentSizeFlag = constants.ZSTD_c_contentSizeFlag

/**
 * Whether this Node runtime exposes built-in zstd. dsh itself needs it, so a
 * host running dsh always has it; the check keeps the core usable standalone.
 * @returns {boolean}
 */
export function hasZstd() {
  return typeof zstdCompressSync === 'function' && typeof zstdDecompressSync === 'function'
}

/** Compression options matching dsh's on-disk frames. */
const FRAME_PARAMS = Object.freeze({
  [ZSTD_c_checksumFlag]: 1,
  [ZSTD_c_contentSizeFlag]: 0,
})

/**
 * Encode one JSON record as a single dsh-compatible zstd frame.
 * @param {unknown} record - any lossless-JSON value.
 * @returns {Buffer} the frame bytes.
 */
export function encodeRecordFrame(record) {
  const line = JSON.stringify(record) + '\n'
  return zstdCompressSync(Buffer.from(line, 'utf8'), { params: FRAME_PARAMS })
}

/**
 * Encode a whole session log.
 *
 * `compressed: false` produces the `session.jsonl` variant dsh writes when its
 * backend runs with `compression: 'none'` — newline-delimited UTF-8, one
 * record per line, no framing. This is the fallback when the runtime has no
 * built-in zstd.
 *
 * @param {object} header - the v0 physical session header (first record).
 * @param {object[]} events - the ordered event records.
 * @param {{ compressed?: boolean }} [options] - physical encoding selection.
 * @returns {Buffer} the complete log file contents.
 */
export function encodeSessionLog(header, events, { compressed = true } = {}) {
  if (!compressed) {
    const lines = [header, ...events].map((record) => JSON.stringify(record))
    return Buffer.from(lines.join('\n') + '\n', 'utf8')
  }
  const frames = [encodeRecordFrame(header), ...events.map(encodeRecordFrame)]
  return Buffer.concat(frames)
}

/**
 * Structurally scan a dsh session log into frame byte ranges.
 *
 * Ported from dsh's own reader: a non-magic byte or a torn frame is skipped by
 * searching forward for the next frame magic, so frames appended after a
 * corrupt region are still recovered instead of being silently dropped.
 *
 * @param {Buffer} buffer - raw file contents.
 * @returns {{ frames: {start: number, end: number}[], tornStart: number|null }}
 */
export function scanZstdFrames(buffer) {
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
    if (offset === buffer.length) return { frames, tornStart: start }
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    // Reserved bits set: not a frame this decoder understands; resync.
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
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start }
    offset += remainingHeaderBytes

    let torn = false
    for (;;) {
      if (buffer.length - offset < 3) return { frames, tornStart: start }
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 3
      const blockSize = blockHeader >>> 3
      if (blockType === 3) {
        torn = true
        break
      }
      const payloadBytes = blockType === 1 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) {
        torn = true
        break
      }
      offset += payloadBytes
      if (lastBlock) break
    }
    if (torn) {
      const next = buffer.indexOf(MAGIC_BYTES, offset)
      if (next === -1) return { frames, tornStart: start }
      offset = next
      continue
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start }
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return { frames, tornStart: null }
}

/**
 * Expand one stored row into the logical events it carries.
 *
 * dsh packs eligible delta runs into `text-chunks` / `reasoning-chunks` /
 * `tool-call-chunks` storage rows; the logical events are the individual
 * deltas. Anything else is a one-to-one row.
 *
 * @param {string} line - one JSONL line.
 * @returns {object[]} zero or more logical records.
 */
export function expandRow(line) {
  let row
  try {
    row = JSON.parse(line)
  } catch {
    return []
  }
  if (!row || typeof row !== 'object') return []
  switch (row.type) {
    case 'text-chunks':
    case 'reasoning-chunks':
      return Array.isArray(row.data && row.data.texts) ? row.data.texts : []
    case 'tool-call-chunks':
      return Array.isArray(row.data && row.data.args) ? row.data.args : []
    default:
      return [row]
  }
}

/**
 * Read a dsh session log back into records.
 *
 * Used by the migrator's verification path and its tests: it proves a written
 * artifact is decodable by the same framing rules dsh applies.
 *
 * @param {Buffer} buffer - raw log contents.
 * @param {{ compressed?: boolean }} [options] - physical encoding selection.
 * @returns {{ header: object|null, records: object[], tornStart: number|null, frameCount: number }}
 */
export function readSessionLog(buffer, { compressed = true } = {}) {
  const raw = []
  let tornStart = null
  let frameCount = 0

  if (!compressed) {
    for (const line of buffer.toString('utf8').split('\n')) {
      if (line.trim()) raw.push(line)
    }
  } else {
    const scanned = scanZstdFrames(buffer)
    tornStart = scanned.tornStart
    frameCount = scanned.frames.length
    for (const frame of scanned.frames) {
      let text
      try {
        text = zstdDecompressSync(buffer.subarray(frame.start, frame.end)).toString('utf8')
      } catch {
        continue
      }
      for (const line of text.split('\n')) {
        if (line.trim()) raw.push(line)
      }
    }
  }

  const records = []
  for (const line of raw) {
    for (const record of expandRow(line)) records.push(record)
  }

  const header = records.length && records[0] && records[0].type === 'session' ? records[0] : null
  return { header, records, tornStart, frameCount }
}
