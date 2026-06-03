import React from 'react'
import { useTranslation } from 'react-i18next'
import { Music, ArrowUpRight, Upload, Trash2 } from 'lucide-react'
import type { TrackSummary } from '../../../shared/library'
import { useTrackBlob } from './use-track-blob'
import { useTrackMeta } from './use-track-meta'

function fmtDuration(sec: number | null): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** A dense library track row: cover, index, title/artist, version chips, duration, hover actions. */
export function LibraryTrackRow({
  index,
  track,
  onOpen,
  onExport,
  onDelete
}: {
  index: number
  track: TrackSummary
  onOpen: (trackId: string) => void
  onExport: (trackId: string) => void
  onDelete: (trackId: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const { cover } = useTrackBlob(track.id)
  const { artist, durationSec } = useTrackMeta(track.id)
  const stop = (e: React.MouseEvent): void => e.stopPropagation()
  const versions = track.versionCount ?? 0
  const branches = track.branchCount ?? 0

  return (
    <div className="group flex h-[52px] items-center gap-3 border-b border-line2 px-[18px] hover:bg-white/[0.018]">
      <span className="w-[22px] text-center font-mono text-[11px] text-ink-faint">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-[5px] border border-line bg-[#23272e]">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <Music size={14} className="text-ink-faint" />
        )}
      </div>
      <button onClick={() => onOpen(track.id)} className="flex min-w-0 flex-1 flex-col items-start text-left">
        <span className="flex items-center truncate text-[13px] font-medium text-ink">
          {track.title}
          {versions > 1 && (
            <span className="ml-2 rounded-[4px] border border-[rgba(74,163,255,.35)] px-1.5 font-mono text-[8.5px] tracking-[.6px] text-[#4aa3ff]">
              v{versions}
            </span>
          )}
          {branches > 1 && (
            <span className="ml-1.5 rounded-[4px] border border-[rgba(63,201,127,.4)] px-1.5 font-mono text-[8.5px] tracking-[.6px] text-ok">
              ⑂ {branches}
            </span>
          )}
        </span>
        {artist && <span className="truncate text-[11px] text-ink-dim">{artist}</span>}
      </button>
      <span className="w-12 text-right font-mono text-[11px] text-ink-faint">
        {fmtDuration(durationSec)}
      </span>
      <div
        className="flex w-[84px] justify-end gap-1.5 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={stop}
      >
        <button
          aria-label={t('common.open')}
          onClick={() => onOpen(track.id)}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-white/[0.06] text-ink-dim hover:text-ink"
        >
          <ArrowUpRight size={12} />
        </button>
        <button
          aria-label={t('library.export')}
          onClick={() => onExport(track.id)}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-white/[0.06] text-ink-dim hover:text-ink"
        >
          <Upload size={12} />
        </button>
        <button
          aria-label={t('common.delete')}
          onClick={() => onDelete(track.id)}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-white/[0.06] text-ink-dim hover:text-ink"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}
