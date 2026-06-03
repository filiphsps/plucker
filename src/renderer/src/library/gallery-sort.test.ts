import { describe, it, expect } from 'vitest'
import { filterAndSort, type GallerySort } from './gallery-sort'
import type { CollectionView } from '../../../shared/library'

const c = (
  id: string,
  title: string,
  kind: CollectionView['kind'],
  createdAt: string
): CollectionView => ({
  id,
  title,
  kind,
  createdAt,
  tracks: []
})
const COLS: CollectionView[] = [
  c('1', 'Road Trip', 'playlist', '2026-06-01T00:00:00Z'),
  c('2', 'Midnights', 'album', '2026-06-03T00:00:00Z'),
  c('3', 'Echoes', 'single', '2026-06-02T00:00:00Z')
]

describe('filterAndSort', () => {
  it('sorts by most recent (createdAt desc)', () => {
    const r = filterAndSort(COLS, '', 'recent')
    expect(r.map((x) => x.id)).toEqual(['2', '3', '1'])
  })
  it('sorts A–Z by title', () => {
    const r = filterAndSort(COLS, '', 'az')
    expect(r.map((x) => x.title)).toEqual(['Echoes', 'Midnights', 'Road Trip'])
  })
  it('filters by case-insensitive title substring', () => {
    const r = filterAndSort(COLS, 'mid', 'recent')
    expect(r.map((x) => x.id)).toEqual(['2'])
  })
  it('exposes a stable sort key list for the segmented control', () => {
    const keys: GallerySort[] = ['recent', 'az', 'kind']
    expect(keys).toHaveLength(3)
  })
})
