import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { TrackEditor } from './track-editor'
import type { TrackDetail } from '../../../shared/library'

const detail: TrackDetail = {
  instance: { id: 't1', collectionId: 'c1', orderIndex: 1, title: 'Song A', activeBranchId: 'b1' },
  versions: [
    { id: 'v1', trackId: 't1', parentId: null, blobHash: 'h1', recipe: { steps: [] }, materialized: true, createdAt: 't1' }
  ],
  branches: [
    { id: 'b1', trackId: 't1', name: 'main', tipVersionId: 'v1' },
    { id: 'b2', trackId: 't1', name: 'club edit', tipVersionId: 'v1' }
  ]
}

describe('TrackEditor', () => {
  it('renders the track title and both footer actions', () => {
    const html = renderToStaticMarkup(
      <TrackEditor detail={detail} onEdit={() => {}} onExport={() => {}} onClose={() => {}} />
    )
    expect(html).toContain('Song A')
    expect(html).toContain('Apply transforms')
    expect(html).toContain('Export')
  })

  it('renders the branch picker with all branches and the active one selected', () => {
    const html = renderToStaticMarkup(
      <TrackEditor detail={detail} onEdit={() => {}} onExport={() => {}} onClose={() => {}} />
    )
    expect(html).toContain('main')
    expect(html).toContain('club edit')
    // the active branch option is selected
    expect(html).toMatch(/<option[^>]*value="b1"[^>]*selected/)
  })
})
