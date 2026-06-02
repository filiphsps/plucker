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

  it('round-trips a waveform without clobbering audio', () => {
    const c = createMetadataCache(dir)
    c.writeAudio(HASH, { durationSec: 100 })
    c.writeWaveform(HASH, { peaks: [0, 0.5, 1], durationSec: 100 })
    const entry = c.read(HASH)
    expect(entry?.waveform).toEqual({ peaks: [0, 0.5, 1], durationSec: 100 })
    expect(entry?.audio?.durationSec).toBe(100)
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

  it('stores a track identity block and stamps updatedAt', () => {
    const c = createMetadataCache(dir)
    c.writeTrack(HASH, { title: 'Avril 14th', file: '/m/a.mp3', videoId: 'v1' })
    const entry = c.read(HASH)
    expect(entry?.track).toEqual({ title: 'Avril 14th', file: '/m/a.mp3', videoId: 'v1' })
    expect(typeof entry?.updatedAt).toBe('string')
  })

  it('update merges new tags into mb', () => {
    const c = createMetadataCache(dir)
    c.writeAutoTag(HASH, { artist: 'Old', album: 'A' })
    c.update(HASH, { artist: 'New', genre: 'IDM' })
    expect(c.read(HASH)?.mb).toEqual({ artist: 'New', album: 'A', genre: 'IDM' })
  })

  it('list returns one record per entry with hash and hasCover', () => {
    const c = createMetadataCache(dir)
    c.writeTrack('h1', { title: 'One' })
    c.writeAutoTag('h2', { artist: 'Two' }, Buffer.from([1, 2]))
    const list = c.list()
    expect(list.map((r) => r.hash).sort()).toEqual(['h1', 'h2'])
    expect(list.find((r) => r.hash === 'h1')?.hasCover).toBe(false)
    expect(list.find((r) => r.hash === 'h2')?.hasCover).toBe(true)
  })

  it('list is empty when the cache directory does not exist', () => {
    expect(createMetadataCache(join(dir, 'missing')).list()).toEqual([])
  })

  it('remove deletes the entry and its cover', () => {
    const c = createMetadataCache(dir)
    c.writeAutoTag(HASH, { artist: 'X' }, Buffer.from([9]))
    c.remove(HASH)
    expect(c.read(HASH)).toBeNull()
    expect(c.readCover(HASH)).toBeNull()
  })

  it('clear removes every entry', () => {
    const c = createMetadataCache(dir)
    c.writeTrack('h1', { title: 'One' })
    c.writeTrack('h2', { title: 'Two' })
    c.clear()
    expect(c.list()).toEqual([])
  })
})
