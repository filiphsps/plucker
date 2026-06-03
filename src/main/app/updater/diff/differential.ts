// Differential update planner + reconstructor.
//
// Given the block lists of an OLD archive (already on disk, cached) and a NEW
// archive (described by its freshly-downloaded blockmap), we work out how to
// rebuild the new archive while downloading as little as possible: blocks whose
// checksum already exists in the old archive are copied from the local file;
// everything else is fetched from the remote new archive over HTTP range
// requests. Because Plucker's update zip is *stored* (uncompressed), the bundled
// binaries — the bulk of the ~750 MB — are byte-identical across releases and
// reuse maximally.
//
// This module is deliberately IO-free: `planDifferential` is pure, and
// `reconstruct` takes read/fetch/write callbacks so the assembly logic can be
// unit-tested with in-memory buffers. The real fs + net wiring lives in
// github-download.ts.
import type { Block } from './blockmap'

/** A single reconstruction step, emitted in new-archive order. */
export type Op =
  | { kind: 'copy'; sourceOffset: number; size: number } // copy `size` bytes from the OLD archive at `sourceOffset`
  | { kind: 'download'; start: number; end: number } // fetch bytes [start, end) from the NEW archive

export interface DiffPlan {
  /** Steps in new-archive order; concatenating their bytes reproduces the new archive. */
  ops: Op[]
  /** Bytes that must be downloaded from the new archive. */
  downloadBytes: number
  /** Bytes copied locally from the old archive. */
  copyBytes: number
  /** Total size of the reconstructed archive (downloadBytes + copyBytes). */
  totalBytes: number
}

export interface PlanOptions {
  /**
   * Fold a run of copyable blocks that sits *between* two download regions into
   * the download when it's no larger than this many bytes. Re-downloading a tiny
   * gap is cheaper than paying for an extra HTTP request. Defaults to 0 (off).
   */
  mergeGap?: number
}

/** Build a reconstruction plan for the new blocks, reusing the old blocks where possible. */
export function planDifferential(
  oldBlocks: Block[],
  newBlocks: Block[],
  opts: PlanOptions = {}
): DiffPlan {
  const mergeGap = opts.mergeGap ?? 0
  const n = newBlocks.length

  // First matching old block per checksum — identical checksum ⇒ identical bytes.
  const oldByChecksum = new Map<string, Block>()
  for (const b of oldBlocks) {
    if (!oldByChecksum.has(b.checksum)) oldByChecksum.set(b.checksum, b)
  }

  const download = new Array<boolean>(n)
  const source = new Array<number>(n) // old-archive offset for copyable blocks
  for (let i = 0; i < n; i++) {
    const old = oldByChecksum.get(newBlocks[i].checksum)
    if (old) {
      download[i] = false
      source[i] = old.offset
    } else {
      download[i] = true
    }
  }

  // Gap-merge: flip short copy runs bounded on both sides by downloads. Leading
  // and trailing copy runs are never flipped — there's no request to save there.
  if (mergeGap > 0) {
    const firstDl = download.indexOf(true)
    const lastDl = download.lastIndexOf(true)
    let j = firstDl
    while (firstDl !== -1 && j <= lastDl) {
      if (download[j]) {
        j++
        continue
      }
      let k = j
      let bytes = 0
      while (k <= lastDl && !download[k]) {
        bytes += newBlocks[k].size
        k++
      }
      if (bytes <= mergeGap) for (let m = j; m < k; m++) download[m] = true
      j = k
    }
  }

  const ops: Op[] = []
  let downloadBytes = 0
  let copyBytes = 0
  let i = 0
  while (i < n) {
    if (download[i]) {
      const start = newBlocks[i].offset
      let end = start
      while (i < n && download[i]) {
        end = newBlocks[i].offset + newBlocks[i].size
        i++
      }
      ops.push({ kind: 'download', start, end })
      downloadBytes += end - start
    } else {
      const sourceOffset = source[i]
      let size = 0
      let expected = sourceOffset
      while (i < n && !download[i] && source[i] === expected) {
        size += newBlocks[i].size
        expected += newBlocks[i].size
        i++
      }
      ops.push({ kind: 'copy', sourceOffset, size })
      copyBytes += size
    }
  }

  return { ops, downloadBytes, copyBytes, totalBytes: downloadBytes + copyBytes }
}

/**
 * Split any `download` op larger than `maxChunk` into consecutive smaller ops so
 * the assembler fetches (and buffers) bounded ranges rather than one huge one.
 * `copy` ops are untouched. Pure; total bytes are unchanged.
 */
export function chunkDownloadOps(ops: Op[], maxChunk: number): Op[] {
  if (maxChunk <= 0) return ops
  const out: Op[] = []
  for (const op of ops) {
    if (op.kind !== 'download' || op.end - op.start <= maxChunk) {
      out.push(op)
      continue
    }
    for (let start = op.start; start < op.end; start += maxChunk) {
      out.push({ kind: 'download', start, end: Math.min(start + maxChunk, op.end) })
    }
  }
  return out
}

/**
 * Whether a differential download is worth it: only when we'd fetch less than
 * `maxDownloadFraction` of the archive. If almost everything changed, a single
 * full download is simpler and avoids many range requests.
 */
export function shouldUseDifferential(plan: DiffPlan, maxDownloadFraction = 0.85): boolean {
  return plan.totalBytes > 0 && plan.downloadBytes < plan.totalBytes * maxDownloadFraction
}

/**
 * Execute a plan, streaming the reconstructed archive to `writeOut` in order.
 * `readOld(offset, size)` returns bytes from the local old archive; `fetchNewRange
 * (start, end)` returns bytes [start, end) from the remote new archive. `onProgress`
 * reports cumulative downloaded bytes.
 */
export async function reconstruct(
  plan: DiffPlan,
  readOld: (offset: number, size: number) => Promise<Buffer>,
  fetchNewRange: (start: number, end: number) => Promise<Buffer>,
  writeOut: (chunk: Buffer) => Promise<void>,
  onProgress?: (downloadedBytes: number) => void
): Promise<void> {
  let downloaded = 0
  for (const op of plan.ops) {
    if (op.kind === 'copy') {
      await writeOut(await readOld(op.sourceOffset, op.size))
    } else {
      await writeOut(await fetchNewRange(op.start, op.end))
      downloaded += op.end - op.start
      onProgress?.(downloaded)
    }
  }
}
