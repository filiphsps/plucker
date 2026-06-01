import { describe, it, expect } from 'vitest'
import { parseTitle } from './title-parser'

describe('parseTitle', () => {
  it('splits "Artist - Title"', () => {
    expect(parseTitle('Daft Punk - Around the World')).toEqual({
      artist: 'Daft Punk',
      title: 'Around the World'
    })
  })
  it('strips trailing parenthetical/bracket noise from title', () => {
    expect(parseTitle('Artist - Song (Official Video)')).toEqual({
      artist: 'Artist',
      title: 'Song'
    })
    expect(parseTitle('Artist - Song [HD Remaster]')).toEqual({
      artist: 'Artist',
      title: 'Song'
    })
  })
  it('returns null artist when there is no separator', () => {
    expect(parseTitle('Just A Title (Lyrics)')).toEqual({
      artist: null,
      title: 'Just A Title'
    })
  })
  it('only splits on the first " - "', () => {
    expect(parseTitle('A - B - C')).toEqual({ artist: 'A', title: 'B - C' })
  })
  it('trims whitespace', () => {
    expect(parseTitle('  X  -  Y  ')).toEqual({ artist: 'X', title: 'Y' })
  })
})
