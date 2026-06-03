import type { Version, Branch } from '../../../shared/library'

export interface GraphNode {
  versionId: string
  col: number // = depth from root
  lane: number // = branch lane (0 = main)
  label: string
  isCurrent: boolean
  isCold: boolean
  /** Branch name if this version is a branch tip (rendered as a ref). */
  branchTip?: string
}
export interface GraphEdge {
  fromVersionId: string
  toVersionId: string
  lane: number // child's lane (drives edge colour)
  fork: boolean // true when child changes lane (a branch fork)
}
export interface GraphLayout {
  nodes: GraphNode[]
  edges: GraphEdge[]
  cols: number
  lanes: number
}

function nodeLabel(v: Version): string {
  if (v.label) return v.label
  if (v.parentId === null) return 'Original'
  return v.recipe.steps.map((s) => s.type).join(' + ') || 'Edit'
}

/**
 * Lay a version DAG onto a strict grid: column = depth (distance from root), lane =
 * the branch a version belongs to. Because every version sits on exactly one root→tip
 * path and depths along a path are unique, no two nodes ever share a (col, lane) cell —
 * overlap is impossible. Shared ancestors fall on the earliest branch's lane (main).
 */
export function layoutVersionGraph(
  versions: Version[],
  branches: Branch[],
  currentVersionId: string
): GraphLayout {
  const byId = new Map(versions.map((v) => [v.id, v]))

  // depth (column) via the parent chain
  const depth = (id: string): number => {
    let d = 0
    let cur = byId.get(id)
    while (cur && cur.parentId) {
      d++
      cur = byId.get(cur.parentId) ?? undefined
    }
    return d
  }

  // branch order: main first, then alphabetical (stable)
  const ordered = [...branches].sort((a, b) =>
    a.name === 'main' ? -1 : b.name === 'main' ? 1 : a.name.localeCompare(b.name)
  )
  const laneOf = new Map(ordered.map((b, i) => [b.id, i]))

  // each branch's path (tip → root) as a set
  const pathOf = (tipId: string): Set<string> => {
    const s = new Set<string>()
    let cur = byId.get(tipId)
    while (cur) {
      s.add(cur.id)
      cur = cur.parentId ? (byId.get(cur.parentId) ?? undefined) : undefined
    }
    return s
  }
  const branchPaths = ordered.map((b) => ({ branch: b, path: pathOf(b.tipVersionId) }))

  // a version's lane = the first (main-first) branch whose path contains it
  const versionLane = (id: string): number => {
    for (const { branch, path } of branchPaths) if (path.has(id)) return laneOf.get(branch.id)!
    return 0
  }

  const tipName = new Map(ordered.map((b) => [b.tipVersionId, b.name]))

  const nodes: GraphNode[] = versions.map((v) => ({
    versionId: v.id,
    col: depth(v.id),
    lane: versionLane(v.id),
    label: nodeLabel(v),
    isCurrent: v.id === currentVersionId,
    isCold: !v.materialized,
    branchTip: tipName.get(v.id)
  }))

  const laneById = new Map(nodes.map((n) => [n.versionId, n.lane]))
  const edges: GraphEdge[] = versions
    .filter((v) => v.parentId)
    .map((v) => {
      const lane = laneById.get(v.id)!
      return {
        fromVersionId: v.parentId as string,
        toVersionId: v.id,
        lane,
        fork: laneById.get(v.parentId as string) !== lane
      }
    })

  const cols = nodes.reduce((m, n) => Math.max(m, n.col + 1), 0)
  const lanes = ordered.length || 1
  return { nodes, edges, cols, lanes }
}
