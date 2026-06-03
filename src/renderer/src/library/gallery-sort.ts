import type { CollectionView, CollectionKind } from '../../../shared/library'

export type GallerySort = 'recent' | 'az' | 'kind'

const KIND_ORDER: Record<CollectionKind, number> = { playlist: 0, album: 1, single: 2 }

/** Filter by a title substring (case-insensitive) then sort by the chosen key. Pure. */
export function filterAndSort(
  collections: CollectionView[],
  query: string,
  sort: GallerySort
): CollectionView[] {
  const q = query.trim().toLowerCase()
  const filtered = q
    ? collections.filter((c) => c.title.toLowerCase().includes(q))
    : collections.slice()
  switch (sort) {
    case 'az':
      return filtered.sort((a, b) => a.title.localeCompare(b.title))
    case 'kind':
      return filtered.sort(
        (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.createdAt.localeCompare(a.createdAt)
      )
    case 'recent':
    default:
      return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
}
