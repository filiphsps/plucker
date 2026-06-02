import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pause, Play, X } from 'lucide-react'
import type { JobProgress } from '../../shared/types'
import { formatSpeed } from './ui/meta/format'

const SEGMENTS = 32

/** Segmented horizontal meter: `filled` of `SEGMENTS` cells lit with the accent. */
function Meter({ value }: { value: number }): React.JSX.Element {
  const filled = Math.round(value * SEGMENTS)
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={'h-3.5 flex-1 rounded-[1px] ' + (i < filled ? 'bg-accent' : 'bg-[#16191e]')}
        />
      ))}
    </div>
  )
}

/**
 * Bottom status deck for the active job. Render only while a job is running
 * (the caller decides visibility).
 */
export function TransportDeck({
  progress,
  paused,
  onTogglePause,
  onCancel
}: {
  progress: JobProgress
  paused: boolean
  onTogglePause: () => void
  onCancel: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  // Count every terminal track (done, failed or skipped) toward the total so the
  // counter reaches the total even when some tracks fail, instead of stalling.
  const processed = progress.tracks.filter(
    (x) => x.status === 'done' || x.status === 'failed' || x.status === 'skipped'
  ).length
  const failed = progress.tracks.filter((x) => x.status === 'failed').length
  // Aggregate live download speed across all concurrently-downloading tracks.
  const totalSpeed = progress.tracks.reduce(
    (sum, x) => sum + (x.status === 'downloading' ? (x.speedBytesPerSec ?? 0) : 0),
    0
  )

  return (
    <div className="flex h-12 items-center gap-4 border-t border-line bg-panel px-[18px]">
      {/* left: counter + progress bar + sublabels, all left-aligned */}
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span className="shrink-0 font-mono text-sm font-semibold leading-none tnum text-accent">
          {processed}/{progress.total}
          {failed > 0 && <span className="ml-1.5 text-bad">·&nbsp;{failed}</span>}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Meter value={progress.overall} />
          <div className="flex gap-3 font-mono text-[9px] tracking-[0.5px] text-ink-faint">
            <span>{Math.round(progress.overall * 100)}%</span>
            {totalSpeed > 0 && <span className="text-accent">{formatSpeed(totalSpeed)}</span>}
          </div>
        </div>
      </div>
      {/* right: transport actions */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={onTogglePause}
          aria-label={paused ? t('download.resume') : t('download.pause')}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-raise text-accent"
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
        <button
          onClick={onCancel}
          aria-label={t('download.cancel')}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-raise text-bad"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
