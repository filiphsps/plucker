import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { LibraryView } from './library-view'
import type { CollectionView } from '../../../shared/library'

const collections: CollectionView[] = [
  { id: 'c1', kind: 'playlist', title: 'Road Trip', createdAt: 't',
    tracks: [{ id: 't1', title: 'Song A', orderIndex: 1, currentVersionId: 'v1' }] }
]

describe('LibraryView', () => {
  it('renders each collection title and its track count', () => {
    const html = renderToStaticMarkup(
      <LibraryView collections={collections} onOpenTrack={() => {}} onDeleteCollection={() => {}} />
    )
    expect(html).toContain('Road Trip')
    expect(html).toContain('Song A')
  })

  it('shows an empty state when there are no collections', () => {
    const html = renderToStaticMarkup(
      <LibraryView collections={[]} onOpenTrack={() => {}} onDeleteCollection={() => {}} />
    )
    expect(html.toLowerCase()).toContain('empty')
  })
})
