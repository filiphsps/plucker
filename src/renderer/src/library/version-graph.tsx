import React from 'react'
import type { Version, Branch } from '../../../shared/library'
import { layoutVersionGraph, type GraphNode } from './version-graph-layout'
import { useVersionWaveform } from './use-version-waveform'

const COL_W = 176
const ROW_H = 90
const X = (col: number): number => col * COL_W + 62
const Y = (lane: number): number => lane * ROW_H + 54
const LANE_COLORS = ['#0a84ff', '#3fc97f', '#e8a23a', '#c678dd', '#4aa3ff']
const CARD_WAVE_BARS = 28

function VersionCard({
  node,
  selected,
  composing,
  onSelect
}: {
  node: GraphNode
  selected: boolean
  /** Composer is open: fade every card except the selected source so the anchor reads. */
  composing: boolean
  onSelect: (id: string) => void
}): React.JSX.Element {
  // The card's own waveform: the real peaks of this version's blob, downsampled
  // to fit the chip. `null` (cold version / still loading) → a flat baseline.
  const peaks = useVersionWaveform(node.versionId, CARD_WAVE_BARS)
  const bars = peaks ?? new Array<number>(CARD_WAVE_BARS).fill(0)

  // Two distinct, composable states. `current` is the active branch tip (cool accent
  // ring); `selected` is the node the actions/composer act on (warm amber focus ring).
  // They layer when a node is both, so the two roles never read as one.
  const rings: string[] = []
  if (node.isCurrent) rings.push('0 0 0 1px var(--color-accent)')
  if (selected) rings.push('0 0 0 2px var(--color-warn)', '0 0 0 5px rgba(232,162,58,.20)')
  const dimmed = composing && !selected

  return (
    <button
      onClick={() => onSelect(node.versionId)}
      className={
        'version-node absolute w-[120px] -translate-x-1/2 -translate-y-1/2 rounded-[9px] border bg-panel2 text-left transition-[opacity,box-shadow] duration-200 ' +
        (node.isCurrent ? 'is-current border-accent ' : 'border-line ') +
        (selected ? 'z-[3] border-warn ' : 'z-[2] ') +
        (node.isCold && !selected ? 'opacity-60 ' : '') +
        (dimmed ? 'opacity-40 ' : '')
      }
      // The card never moves on selection — the amber ring + chip carry the state, so
      // there's no jarring scale/reposition. Position is fixed by the grid (left/top)
      // and the class-based translate centring.
      style={{
        left: X(node.col),
        top: Y(node.lane),
        boxShadow: rings.length ? rings.join(', ') : undefined
      }}
    >
      {selected && (
        <span className="absolute -left-1.5 -top-2.5 z-[4] rounded-[4px] border border-warn/60 bg-warn/15 px-1 py-px font-mono text-[7.5px] uppercase tracking-[.6px] text-warn">
          ◆ from
        </span>
      )}
      <div className="overflow-hidden rounded-[8px]">
        <div className="flex h-[26px] items-center gap-px bg-[#0c0e12] px-1.5">
          {bars.map((p, i) => (
            <span
              key={i}
              data-version-wave-bar
              className={
                'min-w-0 flex-1 rounded-[1px] ' +
                (selected
                  ? 'bg-gradient-to-b from-[rgba(232,162,58,.4)] via-warn to-[rgba(232,162,58,.4)]'
                  : 'bg-gradient-to-b from-[rgba(74,163,255,.45)] via-accent to-[rgba(74,163,255,.45)]')
              }
              style={{ height: `${Math.max(16, p * 100)}%` }}
            />
          ))}
        </div>
        <div className="px-2 py-1.5">
          <div className="truncate text-[11px] font-medium text-ink">{node.label}</div>
          <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[.4px] text-ink-faint">
            {node.isCurrent ? '● current' : node.isCold ? 'cold' : 'edit'}
            {selected ? <span className="ml-1 text-warn">· from</span> : null}
          </div>
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
  composing = false,
  onSelect
}: {
  versions: Version[]
  branches: Branch[]
  currentVersionId: string
  /** The peeked version (defaults to none — only the current node is ringed). */
  selectedVersionId?: string | null
  /** Composer is open: dim every card except the selected source. */
  composing?: boolean
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
            composing={composing}
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
