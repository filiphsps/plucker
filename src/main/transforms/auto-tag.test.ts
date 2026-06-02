// src/main/transforms/auto-tag.test.ts
import { describe, it, expect, vi } from 'vitest'
import { mergeTags, enrich, resolveAutoTag, type AutoTagConfig } from './auto-tag'
import type { MetadataCache } from '../metadata-cache'
import type { TrackTags } from '../../shared/types'

const baseConfig: AutoTagConfig = {
  primarySource: 'youtube',
  enrichWithMusicBrainz: true,
  fetchCoverArt: false,
  fetchGenre: false,
  fetchTrackNumber: false,
  minMatchScore: 80
}

function fakeCache(entry: { mb?: TrackTags } | null, cover: Buffer | null = null): MetadataCache {
  return {
    read: vi.fn(() => entry),
    writeAudio: vi.fn(),
    writeWaveform: vi.fn(),
    writeAutoTag: vi.fn(),
    writeTrack: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    list: vi.fn(() => []),
    readCover: vi.fn(() => cover)
  }
}

/** A fetch that fails the test if it is ever called. */
const noFetch = (() => {
  throw new Error('network should not be called on a cache hit')
}) as unknown as typeof fetch

const mbFetch = (async () =>
  new Response(
    JSON.stringify({
      recordings: [
        {
          id: 'rec1',
          score: 100,
          title: 'Real Title',
          'artist-credit': [{ artist: { name: 'Real Artist' } }],
          releases: [{ id: 'rel1', title: 'Real Album', date: '2001-05-01' }]
        }
      ]
    }),
    { status: 200 }
  )) as unknown as typeof fetch

describe('mergeTags', () => {
  const yt = { artist: 'YT Artist', title: 'YT Title' }
  const mb = {
    artist: 'MB Artist',
    title: 'MB Title',
    album: 'MB Album',
    year: '1999',
    genre: 'Rock'
  }
  it('youtube primary keeps YT, fills gaps from MB', () => {
    const m = mergeTags(yt, mb, 'youtube')
    expect(m.artist).toBe('YT Artist')
    expect(m.album).toBe('MB Album')
    expect(m.year).toBe('1999')
  })
  it('musicbrainz primary inverts precedence', () => {
    expect(mergeTags(yt, mb, 'musicbrainz').artist).toBe('MB Artist')
  })
})

describe('enrich', () => {
  it('returns MB tags from a search result', async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          recordings: [
            {
              id: 'rec1',
              score: 100,
              title: 'Real Title',
              'artist-credit': [{ artist: { name: 'Real Artist' } }],
              releases: [{ id: 'rel1', title: 'Real Album', date: '2001-05-01' }]
            }
          ]
        }),
        { status: 200 }
      )) as unknown as typeof fetch
    const services = {
      bin: {} as never,
      fetch: fakeFetch,
      log: () => {},
      reportProgress: () => {}
    }
    const out = await enrich({ artist: 'Real Artist', title: 'Real Title' }, baseConfig, services)
    expect(out.tags.album).toBe('Real Album')
    expect(out.tags.year).toBe('2001')
  })

  it('returns empty tags when enrich disabled', async () => {
    const services = {
      bin: {} as never,
      fetch: (async () => new Response('')) as unknown as typeof fetch,
      log: () => {},
      reportProgress: () => {}
    }
    const out = await enrich(
      { artist: 'a', title: 't' },
      { ...baseConfig, enrichWithMusicBrainz: false },
      services
    )
    expect(out.tags).toEqual({})
  })
})

describe('resolveAutoTag', () => {
  it('reuses cached MB tags + cover and skips the network on a hit', async () => {
    const cover = Buffer.from([9, 9, 9])
    const cache = fakeCache({ mb: { artist: 'Cached', album: 'Cached Album' } }, cover)
    const services = {
      bin: {} as never,
      fetch: noFetch,
      log: () => {},
      reportProgress: () => {},
      cache
    }

    const out = await resolveAutoTag({ artist: 'a', title: 't' }, baseConfig, services, 'hash1')

    expect(out.tags).toEqual({ artist: 'Cached', album: 'Cached Album' })
    expect(out.cover).toEqual(cover)
    expect(cache.read).toHaveBeenCalledWith('hash1')
    expect(cache.writeAutoTag).not.toHaveBeenCalled()
  })

  it('runs enrich and writes the result to cache on a miss', async () => {
    const cache = fakeCache(null)
    const services = {
      bin: {} as never,
      fetch: mbFetch,
      log: () => {},
      reportProgress: () => {},
      cache
    }

    const out = await resolveAutoTag(
      { artist: 'Real Artist', title: 'Real Title' },
      baseConfig,
      services,
      'hash2'
    )

    expect(out.tags.album).toBe('Real Album')
    expect(cache.writeAutoTag).toHaveBeenCalledWith('hash2', out.tags, out.cover)
  })

  it('falls back to enrich when there is no hash or cache', async () => {
    const services = { bin: {} as never, fetch: mbFetch, log: () => {}, reportProgress: () => {} }
    const out = await resolveAutoTag(
      { artist: 'Real Artist', title: 'Real Title' },
      baseConfig,
      services,
      undefined
    )
    expect(out.tags.album).toBe('Real Album')
  })
})
