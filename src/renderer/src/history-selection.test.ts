import { describe, expect, it } from 'vitest'
import {
  groupForDelete,
  isDeletable,
  parseTrackKey,
  rangeBetween,
  selectOnClick,
  targetsFor,
  trackKey
} from './history-selection'

describe('trackKey / parseTrackKey', () => {
  it('round-trips an entry id and index', () => {
    const key = trackKey('abc-123', 4)
    expect(key).toBe('abc-123#4')
    expect(parseTrackKey(key)).toEqual({ entryId: 'abc-123', index: 4 })
  })

  it('keeps a # inside the entry id intact', () => {
    // Split on the last # so ids containing one still parse correctly.
    const key = trackKey('a#b', 2)
    expect(parseTrackKey(key)).toEqual({ entryId: 'a#b', index: 2 })
  })
})

describe('rangeBetween', () => {
  const ordered = ['a', 'b', 'c', 'd']

  it('returns the inclusive range regardless of direction', () => {
    expect(rangeBetween(ordered, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(rangeBetween(ordered, 'd', 'b')).toEqual(['b', 'c', 'd'])
  })

  it('falls back to just the key when there is no anchor', () => {
    expect(rangeBetween(ordered, null, 'c')).toEqual(['c'])
  })

  it('falls back to just the key when anchor is gone', () => {
    expect(rangeBetween(ordered, 'x', 'c')).toEqual(['c'])
  })
})

describe('selectOnClick', () => {
  const ordered = ['a', 'b', 'c', 'd']

  it('plain click replaces the selection and sets the anchor', () => {
    const r = selectOnClick(new Set(['a', 'b']), 'a', ordered, 'c', { shift: false, meta: false })
    expect([...r.selected]).toEqual(['c'])
    expect(r.anchor).toBe('c')
  })

  it('meta click toggles membership and moves the anchor', () => {
    const add = selectOnClick(new Set(['a']), 'a', ordered, 'c', { shift: false, meta: true })
    expect([...add.selected].sort()).toEqual(['a', 'c'])
    expect(add.anchor).toBe('c')

    const remove = selectOnClick(new Set(['a', 'c']), 'a', ordered, 'c', {
      shift: false,
      meta: true
    })
    expect([...remove.selected]).toEqual(['a'])
  })

  it('shift click selects the range from the anchor and keeps the anchor', () => {
    const r = selectOnClick(new Set(['b']), 'b', ordered, 'd', { shift: true, meta: false })
    expect([...r.selected]).toEqual(['b', 'c', 'd'])
    expect(r.anchor).toBe('b')
  })
})

describe('targetsFor', () => {
  it('returns the whole selection when the key is part of a multi-selection', () => {
    expect(targetsFor(new Set(['a', 'b', 'c']), 'b').sort()).toEqual(['a', 'b', 'c'])
  })

  it('returns just the key when it is not selected', () => {
    expect(targetsFor(new Set(['a', 'b']), 'z')).toEqual(['z'])
  })

  it('returns just the key for a single selection', () => {
    expect(targetsFor(new Set(['a']), 'a')).toEqual(['a'])
  })
})

describe('groupForDelete', () => {
  it('groups by entry with indices sorted descending', () => {
    const grouped = groupForDelete(['e1#0', 'e1#2', 'e2#1', 'e1#1'])
    expect(grouped.get('e1')).toEqual([2, 1, 0])
    expect(grouped.get('e2')).toEqual([1])
  })
})

describe('isDeletable', () => {
  it('is true only for a present file that is not missing', () => {
    expect(isDeletable('/x.mp3', false)).toBe(true)
    expect(isDeletable('/x.mp3', true)).toBe(false)
    expect(isDeletable(undefined, false)).toBe(false)
  })
})
