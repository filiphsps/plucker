import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { LibraryTrackRow } from './library-track-row'
import type { TrackSummary } from '../../../shared/library'

const tr: TrackSummary = {
  id: 't1',
  title: 'Neon Tide',
  orderIndex: 3,
  currentVersionId: 'v9',
  versionCount: 3,
  branchCount: 1
}

describe('LibraryTrackRow', () => {
  it('renders the 1-based padded index, title and a vN chip when there is edit history', () => {
    const html = renderToStaticMarkup(
      <LibraryTrackRow index={2} track={tr} onOpen={() => {}} onExport={() => {}} onDelete={() => {}} />
    )
    expect(html).toContain('Neon Tide')
    expect(html).toContain('03') // 1-based padded index (index 2 → 03)
    expect(html).toContain('v3') // versionCount chip
  })
  it('renders a branch chip when the track has more than one branch', () => {
    const html = renderToStaticMarkup(
      <LibraryTrackRow
        index={0}
        track={{ ...tr, versionCount: 2, branchCount: 2 }}
        onOpen={() => {}}
        onExport={() => {}}
        onDelete={() => {}}
      />
    )
    expect(html).toContain('⑂')
  })
})
