import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { CollectionTile } from './collection-tile'
import type { CollectionView } from '../../../shared/library'

const col: CollectionView = {
  id: 'c1',
  kind: 'playlist',
  title: 'Road Trip',
  createdAt: 't',
  tracks: [{ id: 't1', title: 'A', orderIndex: 1, currentVersionId: 'v1' }]
}

describe('CollectionTile', () => {
  it('renders the title and a mono kind · count caption', () => {
    const html = renderToStaticMarkup(
      <CollectionTile
        collection={col}
        onOpen={() => {}}
        onBeginRename={() => {}}
        onExport={() => {}}
        onDelete={() => {}}
        onRedownload={() => {}}
      />
    )
    expect(html).toContain('Road Trip')
    expect(html).toContain('Playlist') // localized kind
    expect(html).toContain('1') // track count
  })
})
