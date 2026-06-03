import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { CollectionView } from './collection-view'
import type { CollectionView as CV } from '../../../shared/library'

const col: CV = {
  id: 'c1',
  kind: 'playlist',
  title: 'Road Trip',
  sourceUrl: 'https://youtube.com/x',
  createdAt: '2026-06-01T00:00:00Z',
  tracks: [
    { id: 't1', title: 'Highway Lights', orderIndex: 1, currentVersionId: 'v1' },
    { id: 't2', title: 'Open Road', orderIndex: 2, currentVersionId: 'v2' }
  ]
}
const noop = (): void => {}

describe('CollectionView', () => {
  it('renders the hero title, kind, track count, and each track', () => {
    const html = renderToStaticMarkup(
      <CollectionView
        collection={col}
        onBack={noop}
        onOpenTrack={noop}
        onExportTrack={noop}
        onDeleteTrack={noop}
        onExportAll={noop}
        onDelete={noop}
        onRename={noop}
        onRedownloadTrack={noop}
      />
    )
    expect(html).toContain('Road Trip')
    expect(html).toContain('Playlist')
    expect(html).toContain('2') // track count
    expect(html).toContain('Highway Lights')
    expect(html).toContain('Open Road')
  })
})
