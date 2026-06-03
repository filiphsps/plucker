import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { CollectionTracklist } from './collection-tracklist'
import type { CollectionView } from '../../../shared/library'

const col: CollectionView = {
  id: 'c1',
  kind: 'playlist',
  title: 'Road Trip',
  createdAt: 't',
  tracks: [
    { id: 't1', title: 'Highway Lights', orderIndex: 1, currentVersionId: 'v1' },
    { id: 't2', title: 'Open Road', orderIndex: 2, currentVersionId: 'v2' }
  ]
}
const noop = (): void => {}

describe('CollectionTracklist', () => {
  it('renders the collection title and each track', () => {
    const html = renderToStaticMarkup(
      <CollectionTracklist
        collection={col}
        onBack={noop}
        onOpenTrack={noop}
        onExportAll={noop}
        onDelete={noop}
      />
    )
    expect(html).toContain('Road Trip')
    expect(html).toContain('Highway Lights')
    expect(html).toContain('Open Road')
  })
})
