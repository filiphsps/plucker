import { describe, it, expect } from 'vitest'
import { addEntry, removeEntry, removeTrack, HISTORY_CAP } from './history'
import type { HistoryEntry } from '../shared/types'

function entry(id: string, files: string[] = ['a.mp3']): HistoryEntry {
  return {
    id,
    url: `https://yt/${id}`,
    title: id,
    folder: `/music/${id}`,
    kind: 'playlist',
    completedAt: '2026-01-01T00:00:00Z',
    tracks: files.map((f) => ({ file: f, title: f }))
  }
}

describe('addEntry', () => {
  it('prepends most-recent-first', () => {
    const h = addEntry(addEntry([], entry('a')), entry('b'))
    expect(h.map((e) => e.id)).toEqual(['b', 'a'])
  })
  it('caps at HISTORY_CAP', () => {
    let h: HistoryEntry[] = []
    for (let i = 0; i < HISTORY_CAP + 10; i++) h = addEntry(h, entry(`e${i}`))
    expect(h.length).toBe(HISTORY_CAP)
    expect(h[0].id).toBe(`e${HISTORY_CAP + 9}`) // newest kept
  })

  it('updates the existing entry in place when url+folder match (redownload)', () => {
    const original = entry('a', ['old.mp3'])
    const redownload: HistoryEntry = {
      ...entry('fresh-uuid', ['new.mp3']),
      url: original.url,
      folder: original.folder,
      title: 'Updated Title',
      completedAt: '2026-02-02T00:00:00Z'
    }
    const h = addEntry([original, entry('b')], redownload)

    // No duplicate, original entry's id is preserved, but content is refreshed.
    expect(h.map((e) => e.id)).toEqual(['a', 'b'])
    expect(h[0]).toMatchObject({
      id: 'a',
      title: 'Updated Title',
      completedAt: '2026-02-02T00:00:00Z'
    })
    expect(h[0].tracks.map((t) => t.file)).toEqual(['new.mp3'])
  })

  it('keeps entries with the same url but a different folder distinct', () => {
    const first = { ...entry('a'), url: 'https://yt/same', folder: '/music/one' }
    const second = { ...entry('b'), url: 'https://yt/same', folder: '/music/two' }
    const h = addEntry([first], second)
    expect(h.map((e) => e.id)).toEqual(['b', 'a'])
  })
})

describe('removeEntry', () => {
  it('removes by id', () => {
    const h = [entry('a'), entry('b')]
    expect(removeEntry(h, 'a').map((e) => e.id)).toEqual(['b'])
  })
})

describe('removeTrack', () => {
  it('removes a track from the matching entry', () => {
    const h = [entry('a', ['x.mp3', 'y.mp3'])]
    const r = removeTrack(h, 'a', 'x.mp3')
    expect(r[0].tracks.map((t) => t.file)).toEqual(['y.mp3'])
  })
  it('drops the entry when its last track is removed', () => {
    const h = [entry('a', ['only.mp3']), entry('b')]
    const r = removeTrack(h, 'a', 'only.mp3')
    expect(r.map((e) => e.id)).toEqual(['b'])
  })
})
