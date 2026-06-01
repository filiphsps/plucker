import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMetadataCache } from './metadata-cache'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plucker-cache-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const HASH = 'abc123'

describe('metadata cache', () => {
  it('returns null for an unknown hash', () => {
    expect(createMetadataCache(dir).read(HASH)).toBeNull()
  })

  it('round-trips an audio block', () => {
    const c = createMetadataCache(dir)
    c.writeAudio(HASH, { codec: 'mp3', bitrateKbps: 320, durationSec: 200 })
    expect(c.read(HASH)?.audio).toEqual({ codec: 'mp3', bitrateKbps: 320, durationSec: 200 })
  })

  it('merges audio and auto-tag writes for the same hash without clobbering', () => {
    const c = createMetadataCache(dir)
    c.writeAutoTag(HASH, { artist: 'M83', title: 'Midnight City' })
    c.writeAudio(HASH, { codec: 'mp3' })
    const entry = c.read(HASH)
    expect(entry?.mb).toEqual({ artist: 'M83', title: 'Midnight City' })
    expect(entry?.audio).toEqual({ codec: 'mp3' })
  })

  it('persists cover bytes and reads them back', () => {
    const c = createMetadataCache(dir)
    const cover = Buffer.from([1, 2, 3, 4])
    c.writeAutoTag(HASH, { artist: 'M83' }, cover)
    expect(c.readCover(HASH)).toEqual(cover)
  })

  it('returns null cover when none was stored', () => {
    const c = createMetadataCache(dir)
    c.writeAutoTag(HASH, { artist: 'M83' })
    expect(c.readCover(HASH)).toBeNull()
  })

  it('creates the cache directory lazily', () => {
    const nested = join(dir, 'sub', 'cache')
    expect(existsSync(nested)).toBe(false)
    createMetadataCache(nested).writeAudio(HASH, { codec: 'mp3' })
    expect(existsSync(nested)).toBe(true)
  })
})
