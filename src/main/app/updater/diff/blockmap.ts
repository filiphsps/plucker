// Parser for electron-builder's `.blockmap` files — the index that powers
// differential updates (see differential.ts).
//
// electron-builder emits a `<artifact>.blockmap` next to each macOS update zip:
// a gzip-compressed JSON document (format "version 2") that splits the archive
// into ~32 KB content-defined blocks. For each block it stores a short checksum
// and the block's byte length — but NOT the bytes themselves. Two builds that
// share a block produce the same checksum, so comparing an old and a new
// blockmap tells us exactly which byte ranges changed without downloading
// either archive in full.
//
// Shape (one entry per file; the mac zip has a single entry named "file"):
//   { version: "2", files: [{ name, offset, checksums: string[], sizes: number[] }] }
// `checksums[i]` and `sizes[i]` describe the i-th block; blocks tile the archive
// contiguously starting at `offset`.
import { gunzipSync } from 'node:zlib'

/** One block of an archive: its checksum and where its bytes live in the file. */
export interface Block {
  /** electron-builder's per-block checksum (base64). Compared, never recomputed. */
  checksum: string
  /** Byte offset of this block within the archive. */
  offset: number
  /** Byte length of this block. */
  size: number
}

export interface ParsedBlockmap {
  /** Every block across every file entry, in archive order. */
  blocks: Block[]
  /** Total byte length the blockmap describes (the end of the last block). */
  totalSize: number
}

interface RawBlockmapFile {
  name: string
  offset: number
  checksums: string[]
  sizes: number[]
}

interface RawBlockmap {
  version: string
  files: RawBlockmapFile[]
}

/**
 * Decode a gzip-compressed `.blockmap` buffer into an ordered list of blocks with
 * absolute offsets. Throws when the document is malformed (bad gzip/JSON, or a
 * file whose `checksums` and `sizes` arrays disagree in length).
 */
export function parseBlockmap(gzipped: Buffer): ParsedBlockmap {
  let raw: RawBlockmap
  try {
    raw = JSON.parse(gunzipSync(gzipped).toString('utf8')) as RawBlockmap
  } catch (err) {
    throw new Error(`blockmap: could not decode (${err instanceof Error ? err.message : err})`)
  }
  if (!raw || !Array.isArray(raw.files)) {
    throw new Error('blockmap: missing files array')
  }

  const blocks: Block[] = []
  let totalSize = 0
  for (const file of raw.files) {
    if (file.checksums.length !== file.sizes.length) {
      throw new Error('blockmap: checksums/sizes length mismatch')
    }
    let offset = file.offset
    for (let i = 0; i < file.sizes.length; i++) {
      const size = file.sizes[i]
      blocks.push({ checksum: file.checksums[i], offset, size })
      offset += size
    }
    if (offset > totalSize) totalSize = offset
  }
  return { blocks, totalSize }
}
