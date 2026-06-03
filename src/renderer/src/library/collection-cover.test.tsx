import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CollectionCover } from './collection-cover'
import type { TrackSummary } from '../../../shared/library'

const tracks = (n: number): TrackSummary[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    title: `T${i}`,
    orderIndex: i,
    currentVersionId: `v${i}`
  }))

describe('CollectionCover', () => {
  it('renders a 2x2 mosaic grid for a playlist with 4+ tracks', () => {
    const html = renderToStaticMarkup(<CollectionCover kind="playlist" tracks={tracks(5)} />)
    expect(html).toContain('grid-cols-2') // mosaic uses a 2-col grid
  })
  it('renders a single cover frame (no mosaic grid) for a single', () => {
    const html = renderToStaticMarkup(<CollectionCover kind="single" tracks={tracks(1)} />)
    expect(html).not.toContain('grid-cols-2')
  })
  it('falls back to a music glyph when there are no tracks', () => {
    const html = renderToStaticMarkup(<CollectionCover kind="album" tracks={[]} />)
    expect(html).toContain('text-ink-faint') // the Music-glyph fallback
  })
})
