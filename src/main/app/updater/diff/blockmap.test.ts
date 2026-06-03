import { describe, it, expect } from 'vitest'
import { gzipSync } from 'node:zlib'
import { parseBlockmap } from './blockmap'

/** Build a gzip'd blockmap buffer the way electron-builder would. */
const makeBlockmap = (
  files: Array<{ offset: number; checksums: string[]; sizes: number[] }>
): Buffer =>
  gzipSync(
    Buffer.from(JSON.stringify({ version: '2', files: files.map((f) => ({ name: 'file', ...f })) }))
  )

describe('parseBlockmap', () => {
  it('flattens a single-file blockmap into blocks with cumulative offsets', () => {
    const buf = makeBlockmap([{ offset: 0, checksums: ['a', 'b', 'c'], sizes: [100, 50, 25] }])
    const { blocks, totalSize } = parseBlockmap(buf)
    expect(blocks).toEqual([
      { checksum: 'a', offset: 0, size: 100 },
      { checksum: 'b', offset: 100, size: 50 },
      { checksum: 'c', offset: 150, size: 25 }
    ])
    expect(totalSize).toBe(175)
  })

  it('honours a non-zero starting offset', () => {
    const buf = makeBlockmap([{ offset: 512, checksums: ['x', 'y'], sizes: [10, 20] }])
    const { blocks, totalSize } = parseBlockmap(buf)
    expect(blocks[0]).toEqual({ checksum: 'x', offset: 512, size: 10 })
    expect(blocks[1]).toEqual({ checksum: 'y', offset: 522, size: 20 })
    expect(totalSize).toBe(542)
  })

  it('spans multiple file entries', () => {
    const buf = makeBlockmap([
      { offset: 0, checksums: ['a'], sizes: [100] },
      { offset: 100, checksums: ['b', 'c'], sizes: [40, 60] }
    ])
    const { blocks, totalSize } = parseBlockmap(buf)
    expect(blocks.map((b) => b.checksum)).toEqual(['a', 'b', 'c'])
    expect(blocks[2]).toEqual({ checksum: 'c', offset: 140, size: 60 })
    expect(totalSize).toBe(200)
  })

  it('throws when checksums and sizes disagree in length', () => {
    const buf = makeBlockmap([{ offset: 0, checksums: ['a', 'b'], sizes: [100] }])
    expect(() => parseBlockmap(buf)).toThrow(/length mismatch/)
  })

  it('throws on a non-gzip / non-JSON buffer', () => {
    expect(() => parseBlockmap(Buffer.from('not gzip'))).toThrow(/could not decode/)
  })

  it('throws when the files array is missing', () => {
    expect(() => parseBlockmap(gzipSync(Buffer.from('{"version":"2"}')))).toThrow(/missing files/)
  })
})
