import { describe, it, expect } from 'vitest'
import { removeEntry, moveEntry } from './staging-list'
import type { PlaylistEntry } from '../../shared/types'

const list: PlaylistEntry[] = [
  { videoId: 'a', title: 'A', index: 1 },
  { videoId: 'b', title: 'B', index: 2 },
  { videoId: 'c', title: 'C', index: 3 }
]

describe('removeEntry', () => {
  it('drops the entry at the given array position', () => {
    expect(removeEntry(list, 1).map((e) => e.videoId)).toEqual(['a', 'c'])
  })
  it('never mutates the input', () => {
    const copy = [...list]
    removeEntry(list, 0)
    expect(list).toEqual(copy)
  })
})

describe('moveEntry', () => {
  it('moves an item from one position to another', () => {
    expect(moveEntry(list, 0, 2).map((e) => e.videoId)).toEqual(['b', 'c', 'a'])
  })
  it('is a no-op when from === to', () => {
    expect(moveEntry(list, 1, 1)).toEqual(list)
  })
  it('clamps out-of-range targets', () => {
    expect(moveEntry(list, 0, 9).map((e) => e.videoId)).toEqual(['b', 'c', 'a'])
  })
  it('moves an item up', () => {
    expect(moveEntry(list, 2, 0).map((e) => e.videoId)).toEqual(['c', 'a', 'b'])
  })
})
