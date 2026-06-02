import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { VersionGraph } from './version-graph'
import type { Version, Branch } from '../../../shared/library'

const versions: Version[] = [
  {
    id: 'v1',
    trackId: 't1',
    parentId: null,
    blobHash: 'h1',
    recipe: { steps: [] },
    materialized: true,
    createdAt: 't1',
    label: 'Original'
  },
  {
    id: 'v2',
    trackId: 't1',
    parentId: 'v1',
    blobHash: 'h2',
    recipe: { steps: [{ type: 'trim-silence', config: {} }] },
    materialized: true,
    createdAt: 't2'
  }
]
const branches: Branch[] = [{ id: 'b1', trackId: 't1', name: 'main', tipVersionId: 'v2' }]

describe('VersionGraph', () => {
  it('renders a node per version and marks the current (tip) one', () => {
    const html = renderToStaticMarkup(
      <VersionGraph
        versions={versions}
        branches={branches}
        currentVersionId="v2"
        onSelect={() => {}}
      />
    )
    expect(html).toContain('Original')
    expect(html).toContain('trim-silence')
    expect(html).toContain('is-current') // class on the current node
  })
})
