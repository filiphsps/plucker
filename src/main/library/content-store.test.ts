import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createContentStore } from './content-store'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plucker-store-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('content store', () => {
  it('stores a file under a sharded path keyed by its full-file sha256 and returns hash+size', () => {
    const src = join(dir, 'in.mp3')
    writeFileSync(src, 'audio-bytes')
    const store = createContentStore(join(dir, 'blobs'))
    const { hash, path, size } = store.put(src)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(path).toBe(join(dir, 'blobs', hash.slice(0, 2), `${hash}.mp3`))
    expect(size).toBe(Buffer.byteLength('audio-bytes'))
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf8')).toBe('audio-bytes')
  })

  it('is content-addressed: identical bytes produce the same hash/path (idempotent put)', () => {
    const a = join(dir, 'a.mp3')
    const b = join(dir, 'b.mp3')
    writeFileSync(a, 'same')
    writeFileSync(b, 'same')
    const store = createContentStore(join(dir, 'blobs'))
    expect(store.put(a).hash).toBe(store.put(b).hash)
  })

  it('distinguishes files differing only in trailing (tag) bytes', () => {
    const a = join(dir, 'a.mp3')
    const b = join(dir, 'b.mp3')
    writeFileSync(a, 'audioTAGv1')
    writeFileSync(b, 'audioTAGv2')
    const store = createContentStore(join(dir, 'blobs'))
    expect(store.put(a).hash).not.toBe(store.put(b).hash)
  })

  it('removes a blob by hash', () => {
    const src = join(dir, 'in.mp3')
    writeFileSync(src, 'bytes')
    const store = createContentStore(join(dir, 'blobs'))
    const { hash, path } = store.put(src)
    store.remove(hash)
    expect(existsSync(path)).toBe(false)
  })
})
