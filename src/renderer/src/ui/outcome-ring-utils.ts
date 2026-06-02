import type { HistoryTrack, HistoryTrackStatus } from '../../../shared/types'

/** Donut segment color per terminal track status, from the shared theme tokens. */
export const SEGMENT_COLOR: Record<HistoryTrackStatus, string> = {
  done: 'var(--color-ok)',
  failed: 'var(--color-bad)',
  skipped: 'var(--color-warn)',
  cancelled: 'var(--color-ink-faint)'
}

/** Order segments are drawn clockwise from 12 o'clock. */
export const SEGMENT_ORDER: HistoryTrackStatus[] = ['done', 'failed', 'skipped', 'cancelled']

/** Tally terminal outcomes across an entry's tracks. */
export function countByStatus(tracks: HistoryTrack[]): Record<HistoryTrackStatus, number> {
  const counts: Record<HistoryTrackStatus, number> = {
    done: 0,
    failed: 0,
    skipped: 0,
    cancelled: 0
  }
  for (const tk of tracks) counts[tk.status]++
  return counts
}

/** A donut arc: its share of the ring (0..100) and where it begins clockwise. */
export interface OutcomeSegment {
  status: HistoryTrackStatus
  /** Percentage of the ring this status occupies (drives `stroke-dasharray`). */
  pct: number
  /** Cumulative start offset of preceding arcs (drives `stroke-dashoffset`). */
  offset: number
  color: string
}

/**
 * Resolve an entry's tracks into the non-empty arcs of the outcome donut, each
 * with its proportional length and cumulative start offset — so the component
 * can render without mutating an accumulator mid-render.
 */
export function outcomeSegments(tracks: HistoryTrack[]): {
  total: number
  segments: OutcomeSegment[]
} {
  const total = tracks.length
  const counts = countByStatus(tracks)
  const segments: OutcomeSegment[] = []
  let offset = 0
  for (const status of SEGMENT_ORDER) {
    if (counts[status] === 0) continue
    const pct = total > 0 ? (counts[status] / total) * 100 : 0
    segments.push({ status, pct, offset, color: SEGMENT_COLOR[status] })
    offset += pct
  }
  return { total, segments }
}
