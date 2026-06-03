import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Music, ArrowUpRight, Upload, Trash2 } from 'lucide-react'
import type { TrackSummary } from '../../../shared/library'
import { useTrackBlob } from './use-track-blob'
import { useTrackMeta } from './use-track-meta'
import { hoverPreview } from './preview-player'

function fmtDuration(sec: number | null): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** A compact waveform that scrolls with the row's preview playback position (0..1). */
function RowWave({ posRef }: { posRef: React.RefObject<number> }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      if (ref.current) ref.current.style.transform = `translateX(${-(posRef.current ?? 0) * 50}%)`
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [posRef])
  const heights = Array.from(
    { length: 60 },
    (_, i) => 3 + Math.abs(Math.sin(i * 0.5) * 0.6 + Math.sin(i * 0.17) * 0.4) * 12
  )
  const bars = [...heights, ...heights]
  return (
    <div
      className="mt-0.5 h-[14px] w-[180px] overflow-hidden"
      style={{
        WebkitMaskImage: 'linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)',
        maskImage: 'linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)'
      }}
    >
      <div
        ref={ref}
        className="flex w-[200%] items-center gap-px"
        style={{ filter: 'drop-shadow(0 0 4px rgba(10,132,255,.4))' }}
      >
        {bars.map((h, i) => (
          <span
            key={i}
            className="min-w-0 flex-1 rounded-[1px] bg-[#4aa3ff]"
            style={{ height: `${h}px` }}
          />
        ))}
      </div>
    </div>
  )
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
  const { cover, hash } = useTrackBlob(track.id)
  const { artist, durationSec } = useTrackMeta(track.id)
  const stop = (e: React.MouseEvent): void => e.stopPropagation()
  const versions = track.versionCount ?? 0
  const branches = track.branchCount ?? 0
  const posRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const ctrl = useRef<{ enter: () => void; leave: () => void } | null>(null)
  useEffect(() => {
    ctrl.current = hash
      ? hoverPreview(hash, [8, 24], {
          onState: (s) => setPlaying(s === 'playing' || s === 'buffering'),
          onFrame: (p) => (posRef.current = p)
        })
      : null
  }, [hash])

  return (
    <div
      className="group flex h-[52px] items-center gap-3 border-b border-line2 px-[18px] hover:bg-white/[0.018]"
      onMouseEnter={() => ctrl.current?.enter()}
      onMouseLeave={() => ctrl.current?.leave()}
    >
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
          {playing && (
            <span className="mr-2 h-1.5 w-1.5 flex-none rounded-full bg-ok shadow-[0_0_8px_var(--color-ok)] motion-safe:animate-pulse" />
          )}
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
        {playing ? (
          <RowWave posRef={posRef} />
        ) : artist ? (
          <span className="truncate text-[11px] text-ink-dim">{artist}</span>
        ) : null}
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
