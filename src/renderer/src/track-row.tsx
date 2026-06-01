import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Music, ChevronRight, ChevronDown, Check, X, AlertTriangle } from 'lucide-react'
import type { TrackStatus, TrackMetadata } from '../../shared/types'
import { TrackDetail, type TrackSource } from './ui/meta/track-detail'

export interface TrackRowData {
  title: string
  artist?: string
  album?: string
  year?: string
  status?: TrackStatus
  percent?: number
  transformPercent?: number
  file?: string
  /** Mono duration string for the history variant, e.g. "3:32". */
  duration?: string
  reason?: string
  videoId?: string
  /** Audio-content hash; cache key for the expanded metadata panel. */
  hash?: string
}

const METER_CELLS = 14

function Meter({ value, done }: { value: number; done?: boolean }): React.JSX.Element {
  const filled = Math.round((value / 100) * METER_CELLS)
  return (
    <div className="flex w-[188px] items-center gap-0.5">
      {Array.from({ length: METER_CELLS }, (_, i) => (
        <span
          key={i}
          className={
            'h-2 flex-1 rounded-[1px] ' +
            (done ? 'bg-ok/50' : i < filled ? 'bg-accent' : 'bg-[#1c2026]')
          }
        />
      ))}
    </div>
  )
}

/** Shared, expandable track line used by both Download and History. */
export function TrackRow({
  variant,
  index,
  track,
  source,
  actions,
  active = false,
  missing = false
}: {
  variant: 'download' | 'history'
  index: number
  track: TrackRowData
  /** Source info (video id, url, download date) for the expanded detail panel. */
  source?: TrackSource
  /** Trailing hover actions (history variant). */
  actions?: React.ReactNode
  /** Highlight this as the single active ("now plucking") row (download variant). */
  active?: boolean
  /** The track's file is no longer on disk (history variant). */
  missing?: boolean
}): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [cover, setCover] = useState<{ file: string; url: string | null } | null>(null)
  const [meta, setMeta] = useState<{ file: string; data: TrackMetadata } | null>(null)

  useEffect(() => {
    const file = track.file
    if (!file || missing) return
    let live = true
    window.plucker.getCover(file).then((url) => live && setCover({ file, url }))
    return () => {
      live = false
    }
  }, [track.file, missing])

  // Lazily read metadata the first time the row is expanded (per file).
  useEffect(() => {
    const file = track.file
    if (!open || missing || !file || meta?.file === file) return
    let live = true
    window.plucker.getTrackMetadata(file, track.hash).then((data) => {
      if (live) setMeta({ file, data })
    })
    return () => {
      live = false
    }
  }, [open, track.file, track.hash, missing, meta?.file])

  const coverUrl = cover && cover.file === track.file ? cover.url : null
  const failed = track.status === 'failed'
  const subtitle = missing
    ? t('history.missing')
    : failed
      ? (track.reason ?? t('status.failed'))
      : [track.artist, track.album, track.year].filter(Boolean).join(' · ')

  const statusEl = (): React.JSX.Element => {
    if (track.status === 'done')
      return (
        <span className="flex w-16 items-center justify-end gap-1.5 font-mono text-[11px] text-ok">
          <Check size={13} strokeWidth={3} />
          {t('status.done').toUpperCase()}
        </span>
      )
    if (track.status === 'downloading')
      return (
        <span className="w-16 text-right font-mono text-[11px] text-accent">
          {Math.round(track.percent ?? 0)}%
        </span>
      )
    if (track.status === 'transforming')
      return (
        <span className="w-16 text-right font-mono text-[11px] text-accent">
          {Math.round(track.transformPercent ?? 0)}%
        </span>
      )
    return (
      <span className="w-16 text-right font-mono text-[11px] text-ink-faint">
        {t(`status.${track.status ?? 'queued'}`).toUpperCase()}
      </span>
    )
  }

  const activeRow = variant === 'download' && active
  // No file yet (download in progress) → show source + dashes; file present but
  // metadata not loaded for it yet → loading; otherwise ready.
  const detailState = missing
    ? 'unavailable'
    : track.file && meta?.file !== track.file
      ? 'loading'
      : 'ready'

  return (
    <div
      className={
        'border-b border-line2 ' +
        (activeRow
          ? 'bg-accent-dim shadow-[inset_2px_0_0_var(--color-accent)]'
          : 'hover:bg-white/[0.018]')
      }
    >
      <div className="group flex h-12 items-center gap-3 pl-1.5 pr-4">
        <button
          aria-label="expand"
          onClick={() => setOpen((v) => !v)}
          className="flex h-12 w-[30px] items-center justify-center text-ink-faint hover:text-ink"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="w-[22px] text-center font-mono text-[11px] text-ink-faint">
          {String(index).padStart(2, '0')}
        </span>
        <div
          className={
            'flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-[5px] border bg-[#23272e] ' +
            (failed || missing ? 'border-warn/30' : 'border-line')
          }
        >
          {coverUrl ? (
            <img src={coverUrl} alt={t('track.coverAlt')} className="h-full w-full object-cover" />
          ) : missing ? (
            <AlertTriangle size={15} className="text-warn" />
          ) : failed ? (
            <X size={15} className="text-bad" />
          ) : (
            <Music size={15} className="text-ink-faint" />
          )}
        </div>
        <button
          type="button"
          disabled={!track.file || missing}
          onClick={() => track.file && window.plucker.revealFile(track.file)}
          className="min-w-0 flex-1 text-left disabled:cursor-default"
        >
          <div
            className={
              'truncate text-[13px] font-medium ' +
              (failed || missing ? 'text-ink-dim' : 'text-ink')
            }
          >
            {track.title}
          </div>
          {subtitle && (
            <div
              className={
                'truncate text-[11px] ' +
                (failed ? 'text-bad' : missing ? 'text-warn' : 'text-ink-dim')
              }
            >
              {subtitle}
            </div>
          )}
        </button>

        {variant === 'download' ? (
          <>
            <Meter
              value={track.percent ?? (track.status === 'done' ? 100 : 0)}
              done={track.status === 'done'}
            />
            {statusEl()}
          </>
        ) : (
          <>
            {missing && (
              <span className="rounded-md border border-warn/30 bg-warn/[0.08] px-[7px] py-[3px] font-mono text-[10px] text-warn">
                {t('history.missingBadge')}
              </span>
            )}
            <span className="w-12 text-right font-mono text-[11px] text-ink-faint">
              {track.duration ?? '—'}
            </span>
            {actions && (
              <div className="flex w-[84px] justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {actions}
              </div>
            )}
          </>
        )}
      </div>

      {open && (
        <TrackDetail
          meta={meta && meta.file === track.file ? meta.data : null}
          source={source}
          state={detailState}
        />
      )}
    </div>
  )
}
