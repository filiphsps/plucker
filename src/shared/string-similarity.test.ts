import { describe, it, expect } from 'vitest'
import { normalizeName, tokenSetSimilarity } from './string-similarity'

describe('normalizeName', () => {
  it('lowercases, strips diacritics and punctuation to single-spaced tokens', () => {
    expect(normalizeName('Beyoncé feat. Jay-Z!!')).toBe('beyonce feat jay z')
    expect(normalizeName('  The   Weeknd  ')).toBe('the weeknd')
  })
})

describe('tokenSetSimilarity', () => {
  it('is 1 for identical token sets regardless of order/case/punctuation', () => {
    expect(tokenSetSimilarity('Daft Punk', 'daft, punk')).toBe(1)
    expect(tokenSetSimilarity('Around the World', 'world the around')).toBe(1)
  })
  it('is 0 for fully disjoint strings', () => {
    expect(tokenSetSimilarity('abc', 'xyz')).toBe(0)
  })
  it('is a Jaccard ratio for partial overlap', () => {
    // sets {a,b} vs {b,c}: intersection 1, union 3
    expect(tokenSetSimilarity('a b', 'b c')).toBeCloseTo(1 / 3, 5)
  })
  it('treats empty inputs as 0 similarity', () => {
    expect(tokenSetSimilarity('', 'anything')).toBe(0)
    expect(tokenSetSimilarity('', '')).toBe(0)
  })
})
