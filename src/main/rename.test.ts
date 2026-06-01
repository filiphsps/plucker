import { describe, it, expect } from 'vitest'
import { sanitizeFileName, buildFileName } from './rename'

const TEMPLATE = '{artist} - {track}. {title} - {album} ({year})'

describe('sanitizeFileName', () => {
  it('removes filesystem-unsafe characters', () => {
    expect(sanitizeFileName('a/b<c>d:e"f|g?h*i\\j')).toBe('abcdefghij')
  })
  it('trims leading dots/spaces and trailing spaces', () => {
    expect(sanitizeFileName('  . hello ')).toBe('hello')
  })
})

describe('buildFileName', () => {
  it('renders full template and zero-pads track', () => {
    expect(buildFileName(TEMPLATE, {
      artist: 'Daft Punk', title: 'Da Funk', album: 'Homework', year: '1997', trackNumber: '3',
    })).toBe('Daft Punk - 03. Da Funk - Homework (1997)')
  })
  it('drops empty segments cleanly (no album/year)', () => {
    expect(buildFileName(TEMPLATE, {
      artist: 'A', title: 'B', trackNumber: '1',
    })).toBe('A - 01. B')
  })
  it('handles missing track (no leading number)', () => {
    expect(buildFileName(TEMPLATE, { artist: 'A', title: 'B' })).toBe('A - B')
  })
})
