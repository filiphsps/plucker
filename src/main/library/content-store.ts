import { createHash } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  rmSync,
  existsSync,
  statSync
} from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface StoredBlob {
  hash: string
  path: string
  size: number
}

export interface ContentStore {
  root: string
  pathFor: (hash: string) => string
  has: (hash: string) => boolean
  read: (hash: string) => Buffer
  put: (sourceFile: string) => StoredBlob
  remove: (hash: string) => void
  sizeOf: (hash: string) => number
}

/**
 * Content-addressed blob store. Blobs are keyed by the **full-file** SHA-256 (so two
 * versions differing only in ID3 tags are distinct files) and sharded by the first two
 * hex chars. `put` is atomic: it stages a copy in a sibling tmp dir, fsync-free rename
 * into place (same filesystem), and is idempotent for identical content.
 */
export function createContentStore(root: string): ContentStore {
  mkdirSync(root, { recursive: true })
  const tmp = join(root, '.tmp')
  mkdirSync(tmp, { recursive: true })

  const pathFor = (hash: string): string => join(root, hash.slice(0, 2), `${hash}.mp3`)

  return {
    root,
    pathFor,
    has: (hash: string): boolean => existsSync(pathFor(hash)),
    read: (hash: string): Buffer => readFileSync(pathFor(hash)),
    /** Ingest a source file by content; returns its hash, final path and size. Idempotent. */
    put(sourceFile: string): StoredBlob {
      const bytes = readFileSync(sourceFile)
      const hash = createHash('sha256').update(bytes).digest('hex')
      const dest = pathFor(hash)
      const size = bytes.length
      if (existsSync(dest)) return { hash, path: dest, size }
      mkdirSync(join(root, hash.slice(0, 2)), { recursive: true })
      const staging = join(tmp, `${randomUUID()}.mp3`)
      writeFileSync(staging, bytes)
      renameSync(staging, dest) // atomic on same filesystem
      return { hash, path: dest, size }
    },
    remove(hash: string): void {
      rmSync(pathFor(hash), { force: true })
    },
    sizeOf(hash: string): number {
      return existsSync(pathFor(hash)) ? statSync(pathFor(hash)).size : 0
    }
  }
}
