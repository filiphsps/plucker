import { describe, it, expect } from 'vitest'
import { parseTitle } from './title-parser'

describe('parseTitle — separators & noise', () => {
  it('splits a plain "Artist - Title"', () => {
    expect(parseTitle('Daft Punk - Around the World')).toMatchObject({
      artist: 'Daft Punk',
      title: 'Around the World'
    })
  })
  it('handles en/em dashes and pipe separators', () => {
    expect(parseTitle('Artist – Song')).toMatchObject({ artist: 'Artist', title: 'Song' })
    expect(parseTitle('Artist — Song')).toMatchObject({ artist: 'Artist', title: 'Song' })
    expect(parseTitle('Artist | Song')).toMatchObject({ artist: 'Artist', title: 'Song' })
  })
  it('strips noise tokens from the title', () => {
    expect(parseTitle('Artist - Song (Official Music Video)')).toMatchObject({ title: 'Song' })
    expect(parseTitle('Artist - Song [Lyric Video] (HD)')).toMatchObject({ title: 'Song' })
  })
  it('strips a leading track index', () => {
    expect(parseTitle('01. Artist - Song')).toMatchObject({ artist: 'Artist', title: 'Song' })
  })
  it('returns null artist for a bare title', () => {
    expect(parseTitle('Just A Title (Lyrics)')).toMatchObject({
      artist: null,
      title: 'Just A Title'
    })
  })
})

describe('parseTitle — featured & version', () => {
  it('extracts featured artists and removes them from the title by default', () => {
    const r = parseTitle('Artist - Song (feat. Guest One & Guest Two)')
    expect(r.title).toBe('Song')
    expect(r.featured).toEqual(['Guest One', 'Guest Two'])
  })
  it('extracts an inline "ft." too', () => {
    const r = parseTitle('Artist - Song ft. Guest')
    expect(r.title).toBe('Song')
    expect(r.featured).toEqual(['Guest'])
  })
  it('keeps the featured tokens in the title when parseFeatured is false', () => {
    const r = parseTitle('Artist - Song (feat. Guest)', { parseFeatured: false })
    expect(r.featured).toBeUndefined()
    expect(r.title).toContain('feat. Guest')
  })
  it('extracts a version descriptor', () => {
    const r = parseTitle('Artist - Song (Acoustic Remix)')
    expect(r.version).toBe('Acoustic Remix')
    expect(r.title).toBe('Song')
  })
})

describe('parseTitle — source kind', () => {
  it('treats a title-only video on an official artist channel as title, artist = channel', () => {
    const r = parseTitle('Blinding Lights', { kind: 'official-artist', channelName: 'The Weeknd' })
    expect(r).toMatchObject({ artist: 'The Weeknd', title: 'Blinding Lights' })
  })
  it('does not invent an artist from the channel for a generic source', () => {
    expect(
      parseTitle('Blinding Lights', { kind: 'generic', channelName: 'Some Uploader' })
    ).toMatchObject({
      artist: null,
      title: 'Blinding Lights'
    })
  })
})
