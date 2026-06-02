import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import type { Block } from './blockmap'
import {
  planDifferential,
  reconstruct,
  shouldUseDifferential,
  chunkDownloadOps,
  type DiffPlan,
  type Op
} from './differential'

/** Slice a buffer into fixed-size blocks whose checksum is the content hash, so
 *  identical content across two buffers yields identical (reusable) checksums. */
function toBlocks(buf: Buffer, blockSize = 4): Block[] {
  const blocks: Block[] = []
  for (let offset = 0; offset < buf.length; offset += blockSize) {
    const slice = buf.subarray(offset, Math.min(offset + blockSize, buf.length))
    blocks.push({
      checksum: createHash('sha256').update(slice).digest('base64'),
      offset,
      size: slice.length
    })
  }
  return blocks
}

describe('planDifferential', () => {
  it('copies everything when the archives are identical', () => {
    const blocks = toBlocks(Buffer.from('AAAABBBBCCCC'))
    const plan = planDifferential(blocks, blocks)
    expect(plan.downloadBytes).toBe(0)
    expect(plan.copyBytes).toBe(12)
    expect(plan.ops).toEqual([{ kind: 'copy', sourceOffset: 0, size: 12 }])
  })

  it('downloads everything when nothing matches', () => {
    const oldB = toBlocks(Buffer.from('AAAABBBB'))
    const newB = toBlocks(Buffer.from('XXXXYYYY'))
    const plan = planDifferential(oldB, newB)
    expect(plan.copyBytes).toBe(0)
    expect(plan.downloadBytes).toBe(8)
    expect(plan.ops).toEqual([{ kind: 'download', start: 0, end: 8 }])
  })

  it('mixes copy and download for a partial change', () => {
    // old: AAAA BBBB CCCC  /  new: AAAA ZZZZ CCCC → middle block changed
    const oldB = toBlocks(Buffer.from('AAAABBBBCCCC'))
    const newB = toBlocks(Buffer.from('AAAAZZZZCCCC'))
    const plan = planDifferential(oldB, newB)
    expect(plan.ops).toEqual([
      { kind: 'copy', sourceOffset: 0, size: 4 },
      { kind: 'download', start: 4, end: 8 },
      { kind: 'copy', sourceOffset: 8, size: 4 }
    ])
    expect(plan.downloadBytes).toBe(4)
    expect(plan.copyBytes).toBe(8)
    expect(plan.totalBytes).toBe(12)
  })

  it('copies a moved block from its old offset', () => {
    // The "CCCC" block exists in old at offset 0 but is needed at the end in new.
    const oldB = toBlocks(Buffer.from('CCCCAAAA'))
    const newB = toBlocks(Buffer.from('XXXXCCCC'))
    const plan = planDifferential(oldB, newB)
    expect(plan.ops).toEqual([
      { kind: 'download', start: 0, end: 4 },
      { kind: 'copy', sourceOffset: 0, size: 4 } // copied from old offset 0
    ])
  })

  it('splits a copy run when the old source offsets are not contiguous', () => {
    // new = block@old0 then block@old8 (a gap in the old file) → two copy ops
    const oldB = toBlocks(Buffer.from('AAAABBBBCCCC'))
    const newB = toBlocks(Buffer.from('AAAACCCC'))
    const plan = planDifferential(oldB, newB)
    expect(plan.ops).toEqual([
      { kind: 'copy', sourceOffset: 0, size: 4 },
      { kind: 'copy', sourceOffset: 8, size: 4 }
    ])
  })

  describe('mergeGap', () => {
    // new: down(0-4) copy(4-8) down(8-12) — a 4-byte copy gap between two downloads
    const oldB = toBlocks(Buffer.from('AAAAGGGGBBBB'))
    const newB = toBlocks(Buffer.from('XXXXGGGGYYYY'))

    it('folds a short middle copy run into the download', () => {
      const plan = planDifferential(oldB, newB, { mergeGap: 4 })
      expect(plan.ops).toEqual([{ kind: 'download', start: 0, end: 12 }])
      expect(plan.downloadBytes).toBe(12)
    })

    it('keeps the copy when the gap exceeds mergeGap', () => {
      const plan = planDifferential(oldB, newB, { mergeGap: 3 })
      expect(plan.ops).toEqual([
        { kind: 'download', start: 0, end: 4 },
        { kind: 'copy', sourceOffset: 4, size: 4 },
        { kind: 'download', start: 8, end: 12 }
      ])
    })

    it('never folds a leading or trailing copy run', () => {
      // new: copy(0-4) down(4-8) copy(8-12) — gaps are at the edges
      const o = toBlocks(Buffer.from('HHHHaaaaIIII'))
      const nw = toBlocks(Buffer.from('HHHHzzzzIIII'))
      const plan = planDifferential(o, nw, { mergeGap: 1000 })
      expect(plan.ops).toEqual([
        { kind: 'copy', sourceOffset: 0, size: 4 },
        { kind: 'download', start: 4, end: 8 },
        { kind: 'copy', sourceOffset: 8, size: 4 }
      ])
    })
  })
})

describe('chunkDownloadOps', () => {
  it('splits a large download op into bounded chunks', () => {
    const ops: Op[] = [{ kind: 'download', start: 0, end: 25 }]
    expect(chunkDownloadOps(ops, 10)).toEqual([
      { kind: 'download', start: 0, end: 10 },
      { kind: 'download', start: 10, end: 20 },
      { kind: 'download', start: 20, end: 25 }
    ])
  })

  it('leaves small downloads and all copies untouched', () => {
    const ops: Op[] = [
      { kind: 'copy', sourceOffset: 0, size: 1000 },
      { kind: 'download', start: 0, end: 5 }
    ]
    expect(chunkDownloadOps(ops, 10)).toEqual(ops)
  })

  it('is a no-op when maxChunk is non-positive', () => {
    const ops: Op[] = [{ kind: 'download', start: 0, end: 100 }]
    expect(chunkDownloadOps(ops, 0)).toBe(ops)
  })
})

describe('shouldUseDifferential', () => {
  const plan = (downloadBytes: number, totalBytes: number): DiffPlan => ({
    ops: [],
    downloadBytes,
    copyBytes: totalBytes - downloadBytes,
    totalBytes
  })

  it('is true when little needs downloading', () => {
    expect(shouldUseDifferential(plan(50, 1000))).toBe(true)
  })

  it('is false when almost everything changed', () => {
    expect(shouldUseDifferential(plan(900, 1000))).toBe(false)
  })

  it('is false for an empty plan', () => {
    expect(shouldUseDifferential(plan(0, 0))).toBe(false)
  })

  it('honours a custom fraction', () => {
    expect(shouldUseDifferential(plan(400, 1000), 0.3)).toBe(false)
    expect(shouldUseDifferential(plan(200, 1000), 0.3)).toBe(true)
  })
})

describe('reconstruct', () => {
  // Rebuild the new buffer from the old buffer + plan, fetching only changed ranges.
  async function rebuild(
    oldStr: string,
    newStr: string
  ): Promise<{ out: Buffer; fetched: number }> {
    const oldBuf = Buffer.from(oldStr)
    const newBuf = Buffer.from(newStr)
    const plan = planDifferential(toBlocks(oldBuf), toBlocks(newBuf))
    const chunks: Buffer[] = []
    let fetched = 0
    await reconstruct(
      plan,
      async (offset, size) => oldBuf.subarray(offset, offset + size),
      async (start, end) => {
        fetched += end - start
        return newBuf.subarray(start, end)
      },
      async (chunk) => {
        chunks.push(chunk)
      }
    )
    return { out: Buffer.concat(chunks), fetched }
  }

  it('reproduces the new archive exactly from a partial change', async () => {
    const { out, fetched } = await rebuild('AAAABBBBCCCC', 'AAAAZZZZCCCC')
    expect(out.toString()).toBe('AAAAZZZZCCCC')
    expect(fetched).toBe(4) // only the changed middle block
  })

  it('reproduces an identical archive with zero downloads', async () => {
    const { out, fetched } = await rebuild('AAAABBBB', 'AAAABBBB')
    expect(out.toString()).toBe('AAAABBBB')
    expect(fetched).toBe(0)
  })

  it('reproduces a fully-changed archive', async () => {
    const { out, fetched } = await rebuild('AAAABBBB', 'XXXXYYYY')
    expect(out.toString()).toBe('XXXXYYYY')
    expect(fetched).toBe(8)
  })

  it('reports cumulative download progress', async () => {
    const oldBuf = Buffer.from('AAAABBBBCCCCDDDD')
    const newBuf = Buffer.from('XXXXBBBBYYYYDDDD')
    const plan = planDifferential(toBlocks(oldBuf), toBlocks(newBuf))
    const progress: number[] = []
    await reconstruct(
      plan,
      async (o, s) => oldBuf.subarray(o, o + s),
      async (s, e) => newBuf.subarray(s, e),
      async () => {},
      (n) => progress.push(n)
    )
    expect(progress).toEqual([4, 8]) // two changed blocks, cumulative
  })
})
