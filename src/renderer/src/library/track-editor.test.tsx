import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { TrackEditor } from './track-editor'
import type { TrackDetail } from '../../../shared/library'

const detail: TrackDetail = {
  instance: {
    id: 't1',
    collectionId: 'c1',
    orderIndex: 1,
    title: 'Neon Tide',
    activeBranchId: 'b1'
  },
  versions: [
    {
      id: 'root',
      trackId: 't1',
      parentId: null,
      blobHash: 'h1',
      recipe: { steps: [] },
      materialized: true,
      createdAt: '1'
    },
    {
      id: 'v1',
      trackId: 't1',
      parentId: 'root',
      blobHash: 'h2',
      recipe: { steps: [{ type: 'normalize', config: {} }] },
      materialized: true,
      createdAt: '2'
    }
  ],
  branches: [
    { id: 'b1', trackId: 't1', name: 'main', tipVersionId: 'v1' },
    { id: 'b2', trackId: 't1', name: 'club edit', tipVersionId: 'root' }
  ]
}
const noop = (): void => {}
const render = (): string =>
  renderToStaticMarkup(
    <TrackEditor
      detail={detail}
      collectionTitle="Road Trip"
      onClose={noop}
      onEdit={noop}
      onExport={noop}
      onSwitchBranch={noop}
      onCreateBranch={noop}
      onDeleteVersion={noop}
      onRenameVersion={noop}
    />
  )

describe('TrackEditor', () => {
  it('renders the title, the graph, the recipe, and the action bar', () => {
    const html = render()
    expect(html).toContain('Neon Tide')
    expect(html).toContain('Original') // root node label in the graph
    expect(html).toContain('Apply transforms') // action bar
    expect(html).toContain('normalize') // recipe of the current version
  })

  it('renders the branch picker with the active branch selected', () => {
    const html = render()
    expect(html).toContain('main')
    expect(html).toContain('club edit')
    expect(html).toMatch(/<option[^>]*value="b1"[^>]*selected/)
  })
})
