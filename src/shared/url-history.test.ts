import { describe, it, expect } from 'vitest'
import { addUrl, removeUrl } from './url-history'

describe('addUrl', () => {
  it('prepends a new url (most-recent-first)', () => {
    expect(addUrl(['a'], 'b')).toEqual(['b', 'a'])
  })

  it('dedupes by moving an existing url to the top', () => {
    expect(addUrl(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
  })

  it('trims surrounding whitespace before storing', () => {
    expect(addUrl([], '  https://x  ')).toEqual(['https://x'])
  })

  it('ignores empty / whitespace-only urls', () => {
    expect(addUrl(['a'], '')).toEqual(['a'])
    expect(addUrl(['a'], '   ')).toEqual(['a'])
  })

  it('does not cap the list', () => {
    const many = Array.from({ length: 200 }, (_, i) => `u${i}`)
    expect(addUrl(many, 'new')).toHaveLength(201)
  })

  it('does not mutate the input array', () => {
    const list = ['a', 'b']
    addUrl(list, 'c')
    expect(list).toEqual(['a', 'b'])
  })
})

describe('removeUrl', () => {
  it('removes a matching url', () => {
    expect(removeUrl(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })

  it('trims before matching', () => {
    expect(removeUrl(['a', 'b'], '  b  ')).toEqual(['a'])
  })

  it('returns the list unchanged when the url is absent', () => {
    expect(removeUrl(['a', 'b'], 'z')).toEqual(['a', 'b'])
  })

  it('does not mutate the input array', () => {
    const list = ['a', 'b']
    removeUrl(list, 'a')
    expect(list).toEqual(['a', 'b'])
  })
})
