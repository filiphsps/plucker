import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { Gallery } from './gallery'
import type { CollectionView } from '../../../shared/library'

const cols: CollectionView[] = [
  { id: 'c1', kind: 'playlist', title: 'Road Trip', createdAt: 't', tracks: [] }
]
const noop = (): void => {}

describe('Gallery', () => {
  it('renders a tile per collection and the count', () => {
    const html = renderToStaticMarkup(
      <Gallery
        collections={cols}
        onOpenCollection={noop}
        onExportCollection={noop}
        onDeleteCollection={noop}
        onRedownloadCollection={noop}
      />
    )
    expect(html).toContain('Road Trip')
    expect(html).toContain('1') // 1 collection
  })
  it('shows the empty state when there are no collections', () => {
    const html = renderToStaticMarkup(
      <Gallery
        collections={[]}
        onOpenCollection={noop}
        onExportCollection={noop}
        onDeleteCollection={noop}
        onRedownloadCollection={noop}
      />
    )
    expect(html.toLowerCase()).toContain('empty')
  })
})
