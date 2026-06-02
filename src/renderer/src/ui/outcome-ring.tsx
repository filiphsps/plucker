import React from 'react'
import type { HistoryTrack } from '../../../shared/types'
import { outcomeSegments } from './outcome-ring-utils'

/**
 * Compact outcome donut for a history entry: each terminal status contributes a
 * proportional arc (green done · red failed · amber skipped · faint cancelled)
 * around a faint track, with the total track count centered. Replaces the old
 * cover-art placeholder, which never showed real art for a multi-track playlist
 * — surfacing the exact success/failure split where the eye already lands.
 */
export function OutcomeRing({ tracks }: { tracks: HistoryTrack[] }): React.JSX.Element {
  const { total, segments } = outcomeSegments(tracks)
  // A single status fills the whole ring — round caps read nicer than the butt
  // caps needed to keep adjacent segments from overlapping.
  const single = segments.length === 1

  return (
    <div className="relative flex h-[42px] w-[42px] shrink-0 items-center justify-center">
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
        <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--color-line)" strokeWidth="3" />
        {segments.map((seg) => (
          <circle
            key={seg.status}
            cx="18"
            cy="18"
            r="15.915"
            fill="none"
            stroke={seg.color}
            strokeWidth="3"
            strokeLinecap={single ? 'round' : 'butt'}
            pathLength={100}
            strokeDasharray={`${seg.pct} ${100 - seg.pct}`}
            strokeDashoffset={-seg.offset}
          />
        ))}
      </svg>
      <span className="absolute font-mono text-[12px] font-medium text-ink tnum">{total}</span>
    </div>
  )
}
