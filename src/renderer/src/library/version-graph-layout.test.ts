import { describe, it, expect } from 'vitest'
import { layoutVersionGraph } from './version-graph-layout'
import type { Version, Branch } from '../../../shared/library'

const v = (id: string, parentId: string | null, extra: Partial<Version> = {}): Version => ({
  id,
  trackId: 't',
  parentId,
  blobHash: 'h',
  recipe: { steps: [] },
  materialized: true,
  createdAt: id,
  ...extra
})

describe('layoutVersionGraph', () => {
  it('places a linear history left→right on one lane, marks current', () => {
    const versions = [
      v('root', null),
      v('a', 'root', { recipe: { steps: [{ type: 'normalize', config: {} }] } })
    ]
    const branches: Branch[] = [{ id: 'b', trackId: 't', name: 'main', tipVersionId: 'a' }]
    const { nodes, edges, cols, lanes } = layoutVersionGraph(versions, branches, 'a')
    const root = nodes.find((n) => n.versionId === 'root')!
    const a = nodes.find((n) => n.versionId === 'a')!
    expect([root.col, root.lane]).toEqual([0, 0])
    expect([a.col, a.lane]).toEqual([1, 0])
    expect(a.isCurrent).toBe(true)
    expect(cols).toBe(2)
    expect(lanes).toBe(1)
    expect(edges).toEqual([{ fromVersionId: 'root', toVersionId: 'a', lane: 0, fork: false }])
  })

  it('puts a fork on its own lane with a fork edge, never overlapping', () => {
    const versions = [v('root', null), v('a', 'root'), v('club', 'root')]
    const branches: Branch[] = [
      { id: 'b1', trackId: 't', name: 'main', tipVersionId: 'a' },
      { id: 'b2', trackId: 't', name: 'club edit', tipVersionId: 'club' }
    ]
    const { nodes, edges, lanes } = layoutVersionGraph(versions, branches, 'a')
    const a = nodes.find((n) => n.versionId === 'a')!
    const club = nodes.find((n) => n.versionId === 'club')!
    expect(a.lane).toBe(0) // main
    expect(club.lane).toBe(1) // forked branch
    expect(a.col).toBe(1)
    expect(club.col).toBe(1)
    expect(lanes).toBe(2)
    // no two nodes share a (col, lane) cell
    const cells = nodes.map((n) => `${n.col}:${n.lane}`)
    expect(new Set(cells).size).toBe(cells.length)
    expect(edges).toContainEqual({
      fromVersionId: 'root',
      toVersionId: 'club',
      lane: 1,
      fork: true
    })
  })

  it('labels the root "Original" and edits by their transform types', () => {
    const versions = [
      v('root', null),
      v('a', 'root', { recipe: { steps: [{ type: 'trim-silence', config: {} }] } })
    ]
    const branches: Branch[] = [{ id: 'b', trackId: 't', name: 'main', tipVersionId: 'a' }]
    const { nodes } = layoutVersionGraph(versions, branches, 'a')
    expect(nodes.find((n) => n.versionId === 'root')!.label).toBe('Original')
    expect(nodes.find((n) => n.versionId === 'a')!.label).toBe('trim-silence')
    expect(nodes.find((n) => n.versionId === 'a')!.branchTip).toBe('main')
  })
})
