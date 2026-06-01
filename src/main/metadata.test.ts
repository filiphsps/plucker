import { describe, it, expect, vi } from 'vitest'
import { getTrackMetadata, type MetaDeps } from './metadata'
import type { MetadataCache } from './metadata-cache'
import type { AudioInfo } from './audio-meta'

function deps(over: Partial<MetaDeps> & { cache: MetadataCache }): MetaDeps {
  return {
    probe: vi.fn(() => ({ codec: 'mp3', bitrateKbps: 320 }) as AudioInfo),
    readTags: () => ({ artist: 'M83', title: 'Midnight City' }),
    fileSize: () => 1234,
    hashFile: () => 'derived-hash',
    ...over
  }
}

function cacheWith(audio: AudioInfo | undefined): MetadataCache {
  return {
    read: vi.fn(() => (audio ? { audio } : null)),
    writeAudio: vi.fn(),
    writeAutoTag: vi.fn(),
    readCover: vi.fn(() => null)
  }
}

describe('getTrackMetadata', () => {
  it('reads tags and attaches file size to the audio block', () => {
    const cache = cacheWith({ codec: 'mp3' })
    const r = getTrackMetadata('a.mp3', 'h1', deps({ cache }))
    expect(r.tags).toEqual({ artist: 'M83', title: 'Midnight City' })
    expect(r.audio.sizeBytes).toBe(1234)
  })

  it('uses cached audio and does not re-probe on a hit', () => {
    const cache = cacheWith({ codec: 'mp3', sampleRateHz: 44100 })
    const d = deps({ cache })
    const r = getTrackMetadata('a.mp3', 'h1', d)
    expect(r.audio.sampleRateHz).toBe(44100)
    expect(d.probe).not.toHaveBeenCalled()
  })

  it('probes and writes cache on a miss', () => {
    const cache = cacheWith(undefined)
    const d = deps({ cache })
    const r = getTrackMetadata('a.mp3', 'h1', d)
    expect(d.probe).toHaveBeenCalledWith('a.mp3')
    expect(cache.writeAudio).toHaveBeenCalledWith('h1', { codec: 'mp3', bitrateKbps: 320 })
    expect(r.audio.codec).toBe('mp3')
  })

  it('probes without caching when no hash is available at all', () => {
    const cache = cacheWith(undefined)
    const d = deps({ cache, hashFile: () => undefined })
    getTrackMetadata('a.mp3', undefined, d)
    expect(d.probe).toHaveBeenCalled()
    expect(cache.writeAudio).not.toHaveBeenCalled()
  })

  it('backfills the cache by deriving the hash from the file when none is given', () => {
    const cache = cacheWith(undefined)
    const d = deps({ cache })
    getTrackMetadata('a.mp3', undefined, d)
    expect(cache.read).toHaveBeenCalledWith('derived-hash')
    expect(cache.writeAudio).toHaveBeenCalledWith('derived-hash', {
      codec: 'mp3',
      bitrateKbps: 320
    })
  })
})
