import { describe, it, expect } from 'vitest'
import { extractSourceMetadata } from './source-metadata'

describe('extractSourceMetadata', () => {
  it('maps yt-dlp snake_case fields into a typed SourceMetadata', () => {
    const info = {
      id: 'abc',
      title: 'Some Title',
      artist: 'Daft Punk',
      track: 'Around the World',
      album: 'Homework',
      release_year: 1997,
      creator: 'Daft Punk',
      genre: 'House',
      track_number: 5,
      uploader: 'Daft Punk - Topic',
      channel: 'Daft Punk',
      description: 'Provided to YouTube by ...',
      categories: ['Music'],
      duration: 429.1
    }
    expect(extractSourceMetadata(info)).toEqual({
      artist: 'Daft Punk',
      track: 'Around the World',
      album: 'Homework',
      releaseYear: '1997',
      creator: 'Daft Punk',
      genre: 'House',
      trackNumber: '5',
      uploader: 'Daft Punk - Topic',
      channel: 'Daft Punk',
      description: 'Provided to YouTube by ...',
      categories: ['Music'],
      durationSec: 429
    })
  })
  it('tolerates a sparse/garbage object, returning only present fields', () => {
    expect(extractSourceMetadata({ title: 'x' })).toEqual({})
    expect(extractSourceMetadata(null)).toEqual({})
    expect(extractSourceMetadata({ artist: 42 })).toEqual({ artist: '42' })
  })
})
