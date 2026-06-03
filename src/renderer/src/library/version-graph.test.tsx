import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VersionGraph } from './version-graph'
import type { Version, Branch } from '../../../shared/library'

const versions: Version[] = [
  { id: 'root', trackId: 't', parentId: null, blobHash: 'h1', recipe: { steps: [] }, materialized: true, createdAt: '1', label: 'Original' },
  { id: 'a', trackId: 't', parentId: 'root', blobHash: 'h2', recipe: { steps: [{ type: 'trim-silence', config: {} }] }, materialized: true, createdAt: '2' }
]
const branches: Branch[] = [{ id: 'b', trackId: 't', name: 'main', tipVersionId: 'a' }]

describe('VersionGraph', () => {
  it('renders a card per version, the current marker, and the branch ref', () => {
    const html = renderToStaticMarkup(
      <VersionGraph
        versions={versions}
        branches={branches}
        currentVersionId="a"
        selectedVersionId="a"
        onSelect={() => {}}
      />
    )
    expect(html).toContain('Original')
    expect(html).toContain('trim-silence')
    expect(html).toContain('is-current') // class on the current card
    expect(html).toContain('main') // branch ref
  })
})
