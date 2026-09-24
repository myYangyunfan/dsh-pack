// Physical-encoding tests: the framing must be what dsh's own reader expects.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { constants } from 'node:zlib'

import {
  encodeRecordFrame,
  encodeSessionLog,
  expandRow,
  hasZstd,
  readSessionLog,
  scanZstdFrames,
} from '../core/zstdlog.js'

const ZSTD_MAGIC = '28b52ffd'

test('frames carry the zstd magic and a checksummed, non-single-segment descriptor', { skip: !hasZstd() }, () => {
  const frame = encodeRecordFrame({ type: 'session', version: 0, id: 'x' })
  assert.equal(frame.subarray(0, 4).toString('hex'), ZSTD_MAGIC)
  const descriptor = frame.readUInt8(4)
  // dsh writes checksummed frames with the content size omitted, which forces
  // singleSegment = false. Matching this keeps our output byte-compatible.
  assert.equal((descriptor & 4) !== 0, true, 'checksum flag set')
  assert.equal((descriptor & 32) !== 0, false, 'singleSegment flag clear')
  assert.equal(descriptor >>> 6, 0, 'content size flag clear')
  assert.equal(descriptor & 3, 0, 'no dictionary')
})

test('zstd parameter constants exist as expected', { skip: !hasZstd() }, () => {
  // Guards against a runtime renaming the params we depend on.
  assert.equal(typeof constants.ZSTD_c_checksumFlag, 'number')
  assert.equal(typeof constants.ZSTD_c_contentSizeFlag, 'number')
})

test('one frame per record, decodable back to the same records', { skip: !hasZstd() }, () => {
  const header = { type: 'session', version: 0, id: 'zcode-x', createdAt: 1, delegationDepth: 0 }
  const events = [
    { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
    { type: 'user/message', seq: 1, time: 2, data: { id: 'm', role: 'user', content: [], source: { kind: 'user' } }, surfaceOp: 'append' },
  ]
  const buffer = encodeSessionLog(header, events)
  const scanned = scanZstdFrames(buffer)
  assert.equal(scanned.frames.length, 3, 'header frame + one frame per event')
  assert.equal(scanned.tornStart, null)

  const decoded = readSessionLog(buffer)
  assert.deepEqual(decoded.header, header)
  assert.equal(decoded.records.length, 3)
  assert.deepEqual(decoded.records[1], events[0])
  assert.deepEqual(decoded.records[2], events[1])
})

test('multi-frame files decode across frame boundaries', { skip: !hasZstd() }, () => {
  const header = { type: 'session', version: 0, id: 'z', createdAt: 0, delegationDepth: 0 }
  const events = Array.from({ length: 50 }, (_, i) => ({ type: 'turn/start', seq: i, time: i, data: { turn: i } }))
  const decoded = readSessionLog(encodeSessionLog(header, events))
  assert.equal(decoded.records.length, 51)
  assert.equal(decoded.frameCount, 51)
})

test('plain encoding is newline-delimited JSON with no framing', () => {
  const header = { type: 'session', version: 0, id: 'z', createdAt: 0, delegationDepth: 0 }
  const events = [{ type: 'turn/start', seq: 0, time: 0, data: { turn: 1 } }]
  const buffer = encodeSessionLog(header, events, { compressed: false })
  const text = buffer.toString('utf8')
  assert.equal(text.split('\n').filter(Boolean).length, 2)
  assert.equal(text.includes(ZSTD_MAGIC), false)
  const decoded = readSessionLog(buffer, { compressed: false })
  assert.deepEqual(decoded.header, header)
  assert.deepEqual(decoded.records[1], events[0])
})

test('the frame scanner skips garbage and recovers later frames', { skip: !hasZstd() }, () => {
  const good = encodeRecordFrame({ type: 'turn/start', seq: 0, time: 0, data: { turn: 1 } })
  const garbage = Buffer.from('not a zstd frame at all')
  const buffer = Buffer.concat([garbage, good])
  const scanned = scanZstdFrames(buffer)
  assert.equal(scanned.frames.length, 1)
  assert.equal(scanned.frames[0].start, garbage.length)
})

test('a torn trailing frame is reported rather than silently dropped', { skip: !hasZstd() }, () => {
  const good = encodeRecordFrame({ type: 'turn/start', seq: 0, time: 0, data: { turn: 1 } })
  const torn = encodeRecordFrame({ type: 'turn/end', seq: 1, time: 0, data: { turn: 1, reason: { kind: 'completed' } } })
  const buffer = Buffer.concat([good, torn.subarray(0, Math.floor(torn.length / 2))])
  const scanned = scanZstdFrames(buffer)
  assert.equal(scanned.frames.length, 1)
  assert.equal(typeof scanned.tornStart, 'number')
})

test('expandRow unpacks packed chunk rows into logical events', () => {
  const row = JSON.stringify({ type: 'text-chunks', seq0: 3, time0: 1, data: { turn: 1, step: 1, index: 0, dt: [1], texts: ['a', 'b'] } })
  assert.deepEqual(expandRow(row), ['a', 'b'])
  const toolRow = JSON.stringify({ type: 'tool-call-chunks', data: { args: ['{', '}'] } })
  assert.deepEqual(expandRow(toolRow), ['{', '}'])
  const plain = JSON.stringify({ type: 'turn/start', seq: 0 })
  assert.deepEqual(expandRow(plain), [{ type: 'turn/start', seq: 0 }])
  assert.deepEqual(expandRow('{not json'), [])
})
