// src/main/transforms/auto-tag.test.ts
import { describe, it, expect } from 'vitest'
import { mergeTags, enrich, type AutoTagConfig } from './auto-tag'

const baseConfig: AutoTagConfig = {
  primarySource: 'youtube',
  enrichWithMusicBrainz: true,
  fetchCoverArt: false,
  fetchGenre: false,
  fetchTrackNumber: false,
  minMatchScore: 80
}

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
