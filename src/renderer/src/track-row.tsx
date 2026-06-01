import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Music, ChevronRight, ChevronDown, Check, X, AlertTriangle } from 'lucide-react'
import type { TrackStatus, TrackMetadata, TrackTags } from '../../shared/types'
import { TrackDetail, type TrackSource } from './ui/meta/track-detail'
import { formatDuration, formatSpeed, formatElapsed } from './ui/meta/format'
import { Tooltip } from './ui/tooltip'
import { statusColumnWidth } from './status-column'

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
  /** Machine error code for a failure (e.g. yt-dlp exit code), preferred over `reason` in tooltips. */
  errorCode?: string
  videoId?: string
  /** Audio-content hash; cache key for the expanded metadata panel. */
  hash?: string
  /** Current activity id for the live status tooltip (resolved via the `stage.*` i18n keys). */
  stage?: string
  /** Live download speed in bytes/sec while downloading. */
  speedBytesPerSec?: number
  /** Total processing time in ms, shown in the status tooltip once done. */
  elapsedMs?: number
}

const METER_CELLS = 14

const ERR_LABEL =
  'self-center font-mono text-[9px] uppercase leading-3 tracking-[1px] text-ink-faint select-none'

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

/** Shared, expandable track line used by Download, History and the Cache manager. */
export function TrackRow({
  variant,
  index,
  track,
  source,
  meta,
  actions,
  active = false,
  missing = false,
  editing = false,
  onSaveTags,
  onCancelEdit
}: {
  variant: 'download' | 'history' | 'cache'
  index: number
  track: TrackRowData
  /** Source info (video id, url, download date) for the expanded detail panel. */
  source?: TrackSource
  /** Pre-resolved metadata (cache variant); when absent it is fetched on expand. */
  meta?: TrackMetadata
  /** Trailing hover actions (history / cache variants). */
  actions?: React.ReactNode
  /** Highlight this as the single active ("now plucking") row (download variant). */
  active?: boolean
  /** The track's file is no longer on disk (history / cache variants). */
  missing?: boolean
  /** Render the expanded panel in tag-edit mode (cache variant). */
  editing?: boolean
  onSaveTags?: (tags: TrackTags) => void
  onCancelEdit?: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const statusWidth = statusColumnWidth(t)
  const [open, setOpen] = useState(false)
  const [cover, setCover] = useState<{ key: string; url: string | null } | null>(null)
  const [fetched, setFetched] = useState<{ file: string; data: TrackMetadata } | null>(null)

  const isOpen = open || editing

  // Cover: from the file when present, falling back to the cached cover by hash.
  useEffect(() => {
    const file = track.file
    const hash = track.hash
    let live = true
    if (file && !missing) {
      window.plucker.getCover(file).then((url) => live && setCover({ key: file, url }))
    } else if (variant === 'cache' && hash) {
      window.plucker.getCacheCover(hash).then((url) => live && setCover({ key: hash, url }))
    }
    return () => {
      live = false
    }
  }, [track.file, track.hash, missing, variant])

  // Lazily read metadata the first time the row is expanded (per file), unless
  // metadata was supplied directly (cache variant).
  useEffect(() => {
    const file = track.file
    if (meta || !isOpen || missing || !file || fetched?.file === file) return
    let live = true
    window.plucker.getTrackMetadata(file, track.hash).then((data) => {
      if (live) setFetched({ file, data })
    })
    return () => {
      live = false
    }
  }, [isOpen, track.file, track.hash, missing, fetched?.file, meta])

  const coverKey = track.file && !missing ? track.file : track.hash
  const coverUrl = cover && cover.key === coverKey ? cover.url : null
  const resolvedMeta = meta ?? (fetched && fetched.file === track.file ? fetched.data : null)
  const failed = track.status === 'failed'
  const unsuccessful =
    track.status === 'failed' || track.status === 'cancelled' || track.status === 'skipped'
  // Error code or message, in that order — shown on the failed cover and in the expanded panel.
  const errorText = track.errorCode ?? track.reason
  const subtitle = missing
    ? t('history.missing')
    : unsuccessful
      ? (track.reason ?? t(`status.${track.status}` as never))
      : [track.artist, track.album, track.year].filter(Boolean).join(' · ')

  const statusEl = (): React.JSX.Element => {
    if (track.status === 'done')
      return (
        <span
          style={{ width: statusWidth }}
          className="flex items-center justify-end gap-1.5 whitespace-nowrap font-mono text-[11px] text-ok"
        >
          <Check size={13} strokeWidth={3} />
          {t('status.done').toUpperCase()}
        </span>
      )
    if (track.status === 'downloading')
      return (
        <span
          style={{ width: statusWidth }}
          className="whitespace-nowrap text-right font-mono text-[11px] text-accent"
        >
          {Math.round(track.percent ?? 0)}%
        </span>
      )
    if (track.status === 'transforming')
      return (
        <span
          style={{ width: statusWidth }}
          className="whitespace-nowrap text-right font-mono text-[11px] text-accent"
        >
          {Math.round(track.transformPercent ?? 0)}%
        </span>
      )
    return (
      <span
        style={{ width: statusWidth }}
        className="whitespace-nowrap text-right font-mono text-[11px] text-ink-faint"
      >
        {t(`status.${track.status ?? 'queued'}`).toUpperCase()}
      </span>
    )
  }

  // Resolve the current stage id to a localized label (built-ins live under
  // `stage.*`; transform stages fall back to their type id). Once done, the
  // tooltip instead reports the total processing time.
  const stageText = track.stage
    ? t(`stage.${track.stage}` as never, { defaultValue: track.stage })
    : null
  const tooltipText =
    track.status === 'done' && track.elapsedMs != null
      ? t('stage.took', { time: formatElapsed(track.elapsedMs) })
      : stageText

  const missingBadge = (
    <span className="rounded-md border border-warn/30 bg-warn/[0.08] px-[7px] py-[3px] font-mono text-[10px] text-warn">
      {t('history.missingBadge')}
    </span>
  )

  const coverBox = (
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
  )

  const highlight = (variant === 'download' && active) || (variant === 'cache' && editing)
  const qualityText = resolvedMeta?.audio.bitrateKbps
    ? `${resolvedMeta.audio.bitrateKbps} · ${(resolvedMeta.audio.codec ?? 'mp3').toUpperCase()}`
    : '—'
  const durationText =
    variant === 'cache' ? formatDuration(resolvedMeta?.audio.durationSec) : (track.duration ?? '—')
  const detailState = missing
    ? 'unavailable'
    : meta
      ? 'ready'
      : !resolvedMeta && track.file && isOpen
        ? 'loading'
        : 'ready'

  return (
    <div
      className={
        'border-b border-line2 ' +
        (highlight
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
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="w-[22px] text-center font-mono text-[11px] text-ink-faint">
          {String(index).padStart(2, '0')}
        </span>
        {/* On a failed track the red X carries the error code (or message) as a tooltip. */}
        {failed && errorText ? <Tooltip label={errorText}>{coverBox}</Tooltip> : coverBox}
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
            <span className="w-[64px] text-right font-mono text-[11px] text-ink-dim tnum">
              {track.status === 'downloading' ? formatSpeed(track.speedBytesPerSec) : ''}
            </span>
            <Meter
              value={track.percent ?? (track.status === 'done' ? 100 : 0)}
              done={track.status === 'done'}
            />
            {tooltipText ? <Tooltip label={tooltipText}>{statusEl()}</Tooltip> : statusEl()}
          </>
        ) : (
          <>
            {missing && missingBadge}
            {variant === 'cache' && (
              <span className="w-[84px] text-right font-mono text-[11px] text-ink-dim">
                {qualityText}
              </span>
            )}
            <span className="w-12 text-right font-mono text-[11px] text-ink-faint">
              {durationText}
            </span>
            {actions && (
              <div
                className={
                  'flex justify-end gap-1 transition-opacity ' +
                  (variant === 'cache' ? 'w-[64px]' : 'w-[84px]') +
                  (editing ? ' opacity-100' : ' opacity-0 group-hover:opacity-100')
                }
              >
                {actions}
              </div>
            )}
          </>
        )}
      </div>

      {isOpen &&
        (failed ? (
          <div className="flex flex-col gap-2 bg-gradient-to-b from-bad/[0.07] to-transparent px-4 pb-4 pt-3.5">
            <div className="font-mono text-[9px] uppercase leading-3 tracking-[1px] text-bad select-none">
              {t('error.heading')}
            </div>
            <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
              {track.errorCode && (
                <>
                  <span className={ERR_LABEL}>{t('error.code')}</span>
                  <span className="font-mono text-[12px] text-ink">{track.errorCode}</span>
                </>
              )}
              <span className={ERR_LABEL}>{t('error.message')}</span>
              <span className="font-mono text-[12px] break-words text-ink-dim">
                {track.reason ?? t('error.none')}
              </span>
            </div>
          </div>
        ) : (
          <TrackDetail
            key={editing ? 'edit' : 'view'}
            meta={resolvedMeta}
            source={source}
            file={track.file}
            state={detailState}
            editing={editing}
            onSave={onSaveTags}
            onCancel={onCancelEdit}
          />
        ))}
    </div>
  )
}
