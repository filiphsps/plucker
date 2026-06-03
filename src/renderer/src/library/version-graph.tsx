import React from 'react'
import type { Version, Branch } from '../../../shared/library'
import { layoutVersionGraph, type GraphNode } from './version-graph-layout'

const COL_W = 176
const ROW_H = 90
const X = (col: number): number => col * COL_W + 62
const Y = (lane: number): number => lane * ROW_H + 54
const LANE_COLORS = ['#0a84ff', '#3fc97f', '#e8a23a', '#c678dd', '#4aa3ff']

function VersionCard({
  node,
  selected,
  onSelect
}: {
  node: GraphNode
  selected: boolean
  onSelect: (id: string) => void
}): React.JSX.Element {
  return (
    <button
      onClick={() => onSelect(node.versionId)}
      className={
        'version-node absolute z-[2] w-[120px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[9px] border bg-panel2 text-left ' +
        (node.isCurrent ? 'is-current border-accent shadow-[0_0_0_1px_var(--color-accent)] ' : 'border-line ') +
        (node.isCold ? 'opacity-60 ' : '') +
        (selected && !node.isCurrent ? 'border-accent ' : '')
      }
      style={{ left: X(node.col), top: Y(node.lane) }}
    >
      <div className="flex h-[26px] items-center gap-px overflow-hidden bg-[#0c0e12] px-1.5">
        {Array.from({ length: 28 }, (_, i) => (
          <span
            key={i}
            data-version-wave-bar
            className="min-w-0 flex-1 rounded-[1px] bg-gradient-to-b from-[rgba(74,163,255,.45)] via-accent to-[rgba(74,163,255,.45)]"
            style={{ height: `${20 + Math.abs(Math.sin(i * 0.7)) * 70}%` }}
          />
        ))}
      </div>
      <div className="px-2 py-1.5">
        <div className="truncate text-[11px] font-medium text-ink">{node.label}</div>
        <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[.4px] text-ink-faint">
          {node.isCurrent ? '● current' : node.isCold ? 'cold' : 'edit'}
        </div>
      </div>
    </button>
  )
}

/** The git-graph-of-waveform-cards version graph on a collision-proof grid. */
export function VersionGraph({
  versions,
  branches,
  currentVersionId,
  selectedVersionId,
  onSelect
}: {
  versions: Version[]
  branches: Branch[]
  currentVersionId: string
  /** The peeked version (defaults to none — only the current node is ringed). */
  selectedVersionId?: string | null
  onSelect: (versionId: string) => void
}): React.JSX.Element {
  const { nodes, edges, cols, lanes } = layoutVersionGraph(versions, branches, currentVersionId)
  const width = cols * COL_W + 120
  const height = lanes * ROW_H + 24
  const pos = new Map(nodes.map((n) => [n.versionId, n]))

  return (
    <div className="overflow-auto p-[18px]">
      <div className="relative" style={{ width, height }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className="pointer-events-none absolute inset-0 z-[1]"
        >
          {edges.map((e) => {
            const a = pos.get(e.fromVersionId)!
            const b = pos.get(e.toVersionId)!
            const x1 = X(a.col) + 60
            const y1 = Y(a.lane)
            const x2 = X(b.col) - 60
            const y2 = Y(b.lane)
            const color = LANE_COLORS[e.lane % LANE_COLORS.length]
            const d = e.fork
              ? `M${x1},${y1} C${x1 + 32},${y1} ${x2 - 18},${y2} ${x2},${y2}`
              : `M${x1},${y1} L${x2},${y2}`
            return (
              <path
                key={e.toVersionId}
                d={d}
                stroke={color}
                strokeWidth={2.5}
                fill="none"
                opacity={e.fork ? 0.5 : 0.8}
              />
            )
          })}
        </svg>

        {nodes.map((n) => (
          <VersionCard
            key={n.versionId}
            node={n}
            selected={selectedVersionId === n.versionId}
            onSelect={onSelect}
          />
        ))}

        {nodes
          .filter((n) => n.branchTip)
          .map((n) => (
            <span
              key={`ref-${n.versionId}`}
              className="absolute z-[3] -translate-y-1/2 whitespace-nowrap rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] tracking-[.6px]"
              style={{
                left: X(n.col) + 70,
                top: Y(n.lane),
                color: LANE_COLORS[n.lane % LANE_COLORS.length],
                background: `${LANE_COLORS[n.lane % LANE_COLORS.length]}22`,
                border: `1px solid ${LANE_COLORS[n.lane % LANE_COLORS.length]}55`
              }}
            >
              {n.branchTip}
            </span>
          ))}
      </div>
    </div>
  )
}
