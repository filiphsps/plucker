import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TrackStatus } from '../../shared/types'

export interface TrackRowData {
  title: string
  artist?: string
  album?: string
  year?: string
  status?: TrackStatus
  percent?: number
  file?: string
}

/** A track line with lazy-loaded album cover, metadata, optional status + trailing actions. */
export function TrackRow({
  track,
  statusLabel,
  actions
}: {
  track: TrackRowData
  statusLabel?: string
  actions?: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  // Keyed by file so a stale cover never shows for a different track.
  const [cover, setCover] = useState<{ file: string; url: string | null } | null>(null)

  useEffect(() => {
    const file = track.file
    if (!file) return
    let active = true
    window.plucker.getCover(file).then((url) => active && setCover({ file, url }))
    return () => {
      active = false
    }
  }, [track.file])

  const coverUrl = cover && cover.file === track.file ? cover.url : null
  const subtitle = [track.artist, track.album, track.year].filter(Boolean).join(' · ')
  const clickable = Boolean(track.file)

  return (
    <div className="px-4 py-2 flex items-center gap-3 text-sm">
      <div className="w-10 h-10 rounded bg-neutral-800 overflow-hidden flex items-center justify-center shrink-0">
        {coverUrl ? (
          <img src={coverUrl} alt={t('track.coverAlt')} className="w-full h-full object-cover" />
        ) : (
          <span className="text-neutral-600">♪</span>
        )}
      </div>
      <button
        type="button"
        disabled={!clickable}
        onClick={() => track.file && window.plucker.revealFile(track.file)}
        title={clickable ? t('actions.reveal') : undefined}
        className="flex-1 min-w-0 text-left enabled:hover:text-white disabled:cursor-default"
      >
        <div className="truncate">{track.title}</div>
        {subtitle && <div className="truncate text-neutral-500 text-xs">{subtitle}</div>}
      </button>
      {statusLabel && (
        <span className="text-neutral-500 text-right shrink-0 w-20 truncate">{statusLabel}</span>
      )}
      {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
    </div>
  )
}
