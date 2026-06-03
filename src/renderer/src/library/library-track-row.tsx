import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Music, ArrowUpRight, Upload, Trash2 } from 'lucide-react'
import type { TrackSummary } from '../../../shared/library'
import { useTrackBlob } from './use-track-blob'
import { useTrackMeta } from './use-track-meta'
import { useHoverPreview } from './use-hover-preview'
import { showContextMenu } from '../ui/context-menu'
import { libraryTrackMenuItems } from './library-track-menu'
import { watchUrl } from '../../../shared/youtube-url'
import { Tooltip } from '../ui/tooltip'
import { downsamplePeaks } from '../ui/meta/waveform-utils'

function fmtDuration(sec: number | null): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const ROW_WAVE_BARS = 56
/** Preview snippet window (seconds) for a track row's hover-to-play. */
const ROW_PREVIEW_RANGE: [number, number] = [8, 24]

/** Render one layer of the row waveform — fixed-width so the bright clip never reflows it. */
function RowWaveBars({ peaks, color }: { peaks: number[]; color: string }): React.JSX.Element {
  return (
    <div className="flex h-[14px] w-[180px] items-center gap-px" aria-hidden>
      {peaks.map((p, i) => (
        <span
          key={i}
          data-row-wave-bar
          className={'min-w-0 flex-1 rounded-[1px] ' + color}
          style={{ height: `${Math.max(12, p * 100)}%` }}
        />
      ))}
    </div>
  )
}

/**
 * The track's real waveform with a played-portion fill that advances with the
 * preview position (0..1). The dim full waveform and the bright clip share the
 * exact same fixed-width bars, so the fill reveals left-to-right with no seam.
 */
function RowWave({
  peaks,
  posRef
}: {
  peaks: number[]
  posRef: React.RefObject<number>
}): React.JSX.Element {
  const fillRef = useRef<HTMLDivElement>(null)
  // Drive the fill width imperatively from the live position — no re-render per
  // frame (same approach as the editor playhead).
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      if (fillRef.current) fillRef.current.style.width = `${(posRef.current ?? 0) * 100}%`
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [posRef])
  return (
    <div className="relative mt-0.5 h-[14px] w-[180px] overflow-hidden">
      <RowWaveBars peaks={peaks} color="bg-ink-faint/45" />
      <div
        ref={fillRef}
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: '0%', filter: 'drop-shadow(0 0 4px rgba(10,132,255,.4))' }}
      >
        <RowWaveBars peaks={peaks} color="bg-[#4aa3ff]" />
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
  onDelete,
  onRedownload
}: {
  index: number
  track: TrackSummary
  onOpen: (trackId: string) => void
  onExport: (trackId: string) => void
  onDelete: (trackId: string) => void
  onRedownload: (url: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const { cover, hash, loadWaveform } = useTrackBlob(track.id)
  const { artist, durationSec } = useTrackMeta(track.id)
  const stop = (e: React.MouseEvent): void => e.stopPropagation()
  const versions = track.versionCount ?? 0
  const branches = track.branchCount ?? 0
  const { setHovered, playing, posRef } = useHoverPreview(hash, ROW_PREVIEW_RANGE)

  // The row's own waveform peaks, fetched (and cached) lazily on first hover so
  // the strip shows the real track — not a shared placeholder shape.
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const peaksReq = useRef(false)
  const ensurePeaks = (): void => {
    if (peaksReq.current) return
    peaksReq.current = true
    void loadWaveform().then((wf) => wf && setPeaks(downsamplePeaks(wf.peaks, ROW_WAVE_BARS)))
  }

  return (
    <div
      className="group flex h-[52px] items-center gap-3 border-b border-line2 px-[18px] hover:bg-white/[0.018]"
      onMouseEnter={() => {
        ensurePeaks()
        setHovered(true)
      }}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault()
        const url =
          track.sourceUrl ?? (track.sourceVideoId ? watchUrl(track.sourceVideoId) : undefined)
        void showContextMenu(
          libraryTrackMenuItems({
            t,
            videoId: track.sourceVideoId,
            sourceUrl: track.sourceUrl,
            onOpen: () => onOpen(track.id),
            onRedownload: () => url && onRedownload(url),
            onExport: () => onExport(track.id),
            onDelete: () => onDelete(track.id)
          })
        )
      }}
    >
      <Tooltip
        className="w-[22px] flex-none justify-center"
        label={t('library.trackN', { n: index + 1 })}
      >
        <span className="font-mono text-[11px] text-ink-faint">
          {String(index + 1).padStart(2, '0')}
        </span>
      </Tooltip>
      <div className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-[5px] border border-line bg-[#23272e]">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <Music size={14} className="text-ink-faint" />
        )}
      </div>
      <button
        onClick={() => onOpen(track.id)}
        className="flex min-w-0 flex-1 flex-col items-start text-left"
      >
        <span className="flex items-center truncate text-[13px] font-medium text-ink">
          {playing && (
            <Tooltip className="mr-2 flex-none" label={t('library.previewing')}>
              <span className="h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_8px_var(--color-ok)] motion-safe:animate-pulse" />
            </Tooltip>
          )}
          {track.title}
          {versions > 1 && (
            <Tooltip className="ml-2 flex-none" label={t('library.versionsN', { count: versions })}>
              <span className="rounded-[4px] border border-[rgba(74,163,255,.35)] px-1.5 font-mono text-[8.5px] tracking-[.6px] text-[#4aa3ff]">
                v{versions}
              </span>
            </Tooltip>
          )}
          {branches > 1 && (
            <Tooltip
              className="ml-1.5 flex-none"
              label={t('library.branchesN', { count: branches })}
            >
              <span className="rounded-[4px] border border-[rgba(63,201,127,.4)] px-1.5 font-mono text-[8.5px] tracking-[.6px] text-ok">
                ⑂ {branches}
              </span>
            </Tooltip>
          )}
        </span>
        {playing ? (
          peaks ? (
            <RowWave peaks={peaks} posRef={posRef} />
          ) : (
            <div className="mt-0.5 h-[14px] w-[180px] rounded bg-panel2/60" />
          )
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
        <Tooltip label={t('common.open')}>
          <button
            aria-label={t('common.open')}
            onClick={() => onOpen(track.id)}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-white/[0.06] text-ink-dim hover:text-ink"
          >
            <ArrowUpRight size={12} />
          </button>
        </Tooltip>
        <Tooltip label={t('library.export')}>
          <button
            aria-label={t('library.export')}
            onClick={() => onExport(track.id)}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-white/[0.06] text-ink-dim hover:text-ink"
          >
            <Upload size={12} />
          </button>
        </Tooltip>
        <Tooltip label={t('common.delete')}>
          <button
            aria-label={t('common.delete')}
            onClick={() => onDelete(track.id)}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-white/[0.06] text-ink-dim hover:text-ink"
          >
            <Trash2 size={12} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
