import React from 'react'
import { useTranslation } from 'react-i18next'
import { Music, X } from 'lucide-react'
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
  onCancel
}: {
  progress: JobProgress
  onCancel: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const active =
    progress.tracks.find((x) => x.status === 'downloading' || x.status === 'transforming') ??
    progress.tracks.find((x) => x.status === 'queued')
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
  const subtitle = [active?.artist, active?.album].filter(Boolean).join(' · ')

  return (
    <div className="flex h-[92px] items-center gap-4 border-t border-line bg-panel px-[18px]">
      <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[7px] border border-line bg-[#23272e] text-ink-faint">
        <Music size={20} />
      </div>
      <div className="w-[220px]">
        <div className="font-mono text-[9px] tracking-[1.5px] text-ink-faint">
          {t('deck.nowPlucking')}
        </div>
        <div className="mt-0.5 truncate text-[15px] font-semibold text-[#e7ebef]">
          {active?.title ?? '—'}
        </div>
        <div className="truncate font-mono text-[11px] text-accent">{subtitle}</div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Meter value={progress.overall} />
        <div className="flex justify-between font-mono text-[9px] tracking-[0.5px] text-ink-faint">
          <span>{t('deck.jobProgress')}</span>
          {totalSpeed > 0 && <span className="text-accent">{formatSpeed(totalSpeed)}</span>}
          <span>{Math.round(progress.overall * 100)}%</span>
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-2xl font-semibold leading-none tnum text-accent">
          {processed}/{progress.total}
        </div>
        <div className="mt-1 font-mono text-[9px] tracking-[1.5px] text-ink-faint">
          {t('deck.tracks')}
        </div>
        {failed > 0 && (
          <div className="mt-1 font-mono text-[9px] tracking-[1.5px] text-bad">
            {t('deck.failed', { count: failed })}
          </div>
        )}
      </div>
      <button
        onClick={onCancel}
        aria-label={t('download.cancel')}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-raise text-bad"
      >
        <X size={15} />
      </button>
    </div>
  )
}
