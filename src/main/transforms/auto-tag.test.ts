// src/main/transforms/auto-tag.test.ts
import { describe, it, expect, vi } from 'vitest'
import {
  mergeTags,
  enrich,
  resolveAutoTag,
  resolveLocalTags,
  fetchCoverArt,
  type AutoTagConfig
} from './auto-tag'
import { silentTransformLog } from './transform-logger'
import type { MetadataCache } from '@app/app/metadata/metadata-cache'
import type { TrackTags } from '@shared/types'

const baseConfig: AutoTagConfig = {
  primarySource: 'youtube',
  enrichWithMusicBrainz: true,
  fetchCoverArt: false,
  fetchGenre: false,
  fetchTrackNumber: false,
  minMatchScore: 80,
  useStructuredMetadata: true,
  parseFeatured: true,
  featuredHandling: 'keep-in-title',
  parseVersion: true,
  stripNoiseTokens: true,
  channelArtistFallback: 'official-only',
  requireVerifiedMatch: false,
  durationToleranceSec: 5,
  nameSimilarityThreshold: 70
}

function fakeCache(entry: { mb?: TrackTags } | null, cover: Buffer | null = null): MetadataCache {
  return {
    read: vi.fn(() => entry),
    writeAudio: vi.fn(),
    writeWaveform: vi.fn(),
    invalidateWaveform: vi.fn(),
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
      log: silentTransformLog,
      reportProgress: () => {}
    }
    const out = await enrich({ artist: 'Real Artist', title: 'Real Title' }, baseConfig, services)
    expect(out.tags.album).toBe('Real Album')
    expect(out.tags.year).toBe('2001')
  })

  it('embeds cover art even when YouTube is the primary source', async () => {
    const fetchImpl = (async (url: string) => {
      const u = String(url)
      if (u.includes('/release/rel1/front-500')) {
        return new Response(Buffer.from([1, 2, 3]), { status: 200 })
      }
      return new Response(
        JSON.stringify({
          recordings: [
            {
              id: 'rec1',
              score: 100,
              title: 'Real Title',
              'artist-credit': [{ artist: { name: 'Real Artist' } }],
              releases: [
                { id: 'rel1', title: 'Real Album', date: '2001', 'release-group': { id: 'rg1' } }
              ]
            }
          ]
        }),
        { status: 200 }
      )
    }) as unknown as typeof fetch
    const services = {
      bin: {} as never,
      fetch: fetchImpl,
      log: silentTransformLog,
      reportProgress: () => {}
    }
    const out = await enrich(
      { artist: 'Real Artist', title: 'Real Title' },
      { ...baseConfig, primarySource: 'youtube', fetchCoverArt: true },
      services
    )
    expect(out.cover).toEqual(Buffer.from([1, 2, 3]))
  })

  it('falls back to the release-group cover when the release has none', async () => {
    const fetchImpl = (async (url: string) => {
      const u = String(url)
      if (u.includes('/release/rel1/front-500')) return new Response('', { status: 404 })
      if (u.includes('/release-group/rg1/front-500')) {
        return new Response(Buffer.from([7, 8, 9]), { status: 200 })
      }
      return new Response(
        JSON.stringify({
          recordings: [
            {
              id: 'rec1',
              score: 100,
              title: 'Real Title',
              'artist-credit': [{ artist: { name: 'Real Artist' } }],
              releases: [
                { id: 'rel1', title: 'Real Album', date: '2001', 'release-group': { id: 'rg1' } }
              ]
            }
          ]
        }),
        { status: 200 }
      )
    }) as unknown as typeof fetch
    const services = {
      bin: {} as never,
      fetch: fetchImpl,
      log: silentTransformLog,
      reportProgress: () => {}
    }
    const out = await enrich(
      { artist: 'Real Artist', title: 'Real Title' },
      { ...baseConfig, fetchCoverArt: true },
      services
    )
    expect(out.cover).toEqual(Buffer.from([7, 8, 9]))
  })

  it('returns empty tags when enrich disabled', async () => {
    const services = {
      bin: {} as never,
      fetch: (async () => new Response('')) as unknown as typeof fetch,
      log: silentTransformLog,
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

describe('fetchCoverArt', () => {
  it('prefers the release cover and never queries the release group when it succeeds', async () => {
    const calls: string[] = []
    const fetchImpl = (async (url: string) => {
      calls.push(String(url))
      return new Response(Buffer.from([1]), { status: 200 })
    }) as unknown as typeof fetch
    const out = await fetchCoverArt(
      fetchImpl,
      { releaseId: 'rel1', releaseGroupId: 'rg1' },
      silentTransformLog
    )
    expect(out).toEqual(Buffer.from([1]))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('/release/rel1/front-500')
  })

  it('returns undefined when neither release nor release group has a cover', async () => {
    const fetchImpl = (async () => new Response('', { status: 404 })) as unknown as typeof fetch
    const out = await fetchCoverArt(
      fetchImpl,
      { releaseId: 'rel1', releaseGroupId: 'rg1' },
      silentTransformLog
    )
    expect(out).toBeUndefined()
  })
})

describe('resolveAutoTag', () => {
  it('reuses cached MB tags + cover and skips the network on a hit', async () => {
    const cover = Buffer.from([9, 9, 9])
    const cache = fakeCache({ mb: { artist: 'Cached', album: 'Cached Album' } }, cover)
    const services = {
      bin: {} as never,
      fetch: noFetch,
      log: silentTransformLog,
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
      log: silentTransformLog,
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
    const services = {
      bin: {} as never,
      fetch: mbFetch,
      log: silentTransformLog,
      reportProgress: () => {}
    }
    const out = await resolveAutoTag(
      { artist: 'Real Artist', title: 'Real Title' },
      baseConfig,
      services,
      undefined
    )
    expect(out.tags.album).toBe('Real Album')
  })
})

describe('resolveLocalTags (source → classify → parse → fuse)', () => {
  const cfg = {
    useStructuredMetadata: true,
    parseFeatured: true,
    featuredHandling: 'keep-in-title',
    parseVersion: true,
    stripNoiseTokens: true,
    channelArtistFallback: 'official-only'
  } as Pick<
    AutoTagConfig,
    | 'useStructuredMetadata'
    | 'parseFeatured'
    | 'featuredHandling'
    | 'parseVersion'
    | 'stripNoiseTokens'
    | 'channelArtistFallback'
  >

  it('produces clean tags from a Topic source, ignoring the noisy raw title', () => {
    const tags = resolveLocalTags(
      {
        artist: 'Daft Punk',
        track: 'Da Funk',
        album: 'Homework',
        releaseYear: '1997',
        uploader: 'Daft Punk - Topic'
      },
      'Daft Punk - Da Funk (Official Video) [HD]',
      cfg
    )
    expect(tags).toMatchObject({
      artist: 'Daft Punk',
      title: 'Da Funk',
      album: 'Homework',
      year: '1997'
    })
  })

  it('parses a generic "Artist - Title (Official Video)" with no structured fields', () => {
    const tags = resolveLocalTags(
      { channel: 'Some Uploader' },
      'Some Artist - Cool Song (Official Music Video)',
      cfg
    )
    expect(tags).toMatchObject({ artist: 'Some Artist', title: 'Cool Song' })
  })

  it('uses channel as artist for a title-only official-artist video', () => {
    const tags = resolveLocalTags(
      { channel: 'The Weeknd', artist: 'The Weeknd' },
      'Blinding Lights',
      { ...cfg, useStructuredMetadata: false }
    )
    expect(tags).toMatchObject({ artist: 'The Weeknd', title: 'Blinding Lights' })
  })
})
