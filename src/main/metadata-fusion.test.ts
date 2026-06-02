import { describe, it, expect } from 'vitest'
import { fuseMetadata, fusedToTags } from './metadata-fusion'

const empty = {}

describe('fuseMetadata', () => {
  it('prefers structured info.json fields for a Topic source', () => {
    const fused = fuseMetadata(
      { artist: 'Daft Punk', track: 'Da Funk', album: 'Homework', releaseYear: '1997' },
      { artist: 'wrong', title: 'wrong' },
      'topic',
      { useStructuredMetadata: true, channelArtistFallback: 'official-only' }
    )
    expect(fused.artist.value).toBe('Daft Punk')
    expect(fused.artist.source).toBe('structured')
    expect(fused.title.value).toBe('Da Funk')
    expect(fused.year.value).toBe('1997')
  })
  it('falls back to parsed title when no structured fields exist', () => {
    const fused = fuseMetadata(empty, { artist: 'Artist', title: 'Song' }, 'generic', {
      useStructuredMetadata: true,
      channelArtistFallback: 'official-only'
    })
    expect(fused.artist).toMatchObject({ value: 'Artist', source: 'title' })
    expect(fused.title).toMatchObject({ value: 'Song', source: 'title' })
  })
  it('uses the channel as a last-resort artist only when allowed', () => {
    const offc = fuseMetadata(
      { channel: 'The Weeknd' },
      { artist: null, title: 'Blinding Lights' },
      'official-artist',
      { useStructuredMetadata: true, channelArtistFallback: 'official-only' }
    )
    expect(offc.artist).toMatchObject({ value: 'The Weeknd', source: 'channel' })

    const gen = fuseMetadata(
      { channel: 'Some Uploader' },
      { artist: null, title: 'Song' },
      'generic',
      { useStructuredMetadata: true, channelArtistFallback: 'official-only' }
    )
    expect(gen.artist.value).toBeUndefined()
  })
  it('ignores structured fields when useStructuredMetadata is false', () => {
    const fused = fuseMetadata(
      { artist: 'Structured', track: 'StructTrack' },
      { artist: 'Parsed', title: 'ParsedTrack' },
      'topic',
      { useStructuredMetadata: false, channelArtistFallback: 'official-only' }
    )
    expect(fused.artist.value).toBe('Parsed')
  })
})

describe('fusedToTags', () => {
  it('flattens to a plain TrackTags object', () => {
    const fused = fuseMetadata(
      {
        artist: 'A',
        track: 'T',
        album: 'Al',
        releaseYear: '2020',
        genre: 'Pop',
        trackNumber: '3'
      },
      { artist: null, title: 'T', featured: ['G'] },
      'topic',
      { useStructuredMetadata: true, channelArtistFallback: 'never' }
    )
    expect(fusedToTags(fused)).toEqual({
      artist: 'A',
      title: 'T',
      album: 'Al',
      year: '2020',
      genre: 'Pop',
      trackNumber: '3'
    })
  })
})
