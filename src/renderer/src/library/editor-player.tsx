import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Music, Play, Pause } from 'lucide-react'
import type { Waveform } from '../../../shared/types'
import { useTrackBlob } from './use-track-blob'
import { useTrackMeta } from './use-track-meta'
import { playPreview, stopPreview } from './preview-player'
import { WaveformStrip } from '../ui/meta/waveform-strip'

function fmtDuration(sec: number | null): string {
  if (sec == null) return ''
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
}

/** Editor identity header: eyebrow breadcrumb → title → identity line, cover, version waveform. */
export function EditorPlayer({
  trackId,
  title,
  collectionTitle,
  versionLabel,
  isCurrent,
  onBack,
  branchSwitcher
}: {
  trackId: string
  title: string
  collectionTitle: string
  versionLabel: string
  isCurrent: boolean
  onBack: () => void
  branchSwitcher: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  const { cover, hash } = useTrackBlob(trackId)
  const { artist, durationSec } = useTrackMeta(trackId)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)

  // Fetch the current-version waveform, keyed by trackId (derived → no setState-in-effect).
  const [loaded, setLoaded] = useState<{ id: string; wave: Waveform | null } | null>(null)
  useEffect(() => {
    let live = true
    void window.plucker.getLibraryTrackBlob(trackId).then((b) => {
      if (!live || !b.file) return
      window.plucker
        .getWaveform(b.file, b.hash ?? undefined)
        .then((w) => live && setLoaded({ id: trackId, wave: w }))
    })
    return () => {
      live = false
    }
  }, [trackId])
  const wave = loaded && loaded.id === trackId ? loaded.wave : null
  const total = wave?.durationSec ?? 0
  const canPlay = !!hash && total > 0

  const toggle = (): void => {
    if (playing) {
      stopPreview()
      setPlaying(false)
    } else if (hash && total > 0) {
      playPreview(hash, [0, total], {
        onFrame: setPos,
        onState: (s) => setPlaying(s !== 'stopped')
      })
    }
  }
  // Stop playback when the editor unmounts.
  useEffect(() => () => stopPreview(), [])

  const dur = fmtDuration(durationSec)

  return (
    <div className="flex flex-none gap-4 border-b border-line2 p-4">
      <div className="flex h-[90px] w-[90px] flex-none items-center justify-center overflow-hidden rounded-[10px] border border-line bg-[#23272e]">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <Music size={20} className="text-ink-faint" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <button
          onClick={onBack}
          className="flex w-max items-center gap-1 font-mono text-[10px] text-ink-faint hover:text-ink-dim"
        >
          <ChevronLeft size={12} />
          {collectionTitle}
        </button>
        <h2 className="mt-0.5 truncate text-[21px] font-bold leading-tight tracking-[-.4px] text-white">
          {title}
        </h2>
        <div className="mt-0.5 truncate text-[12px] text-ink-dim">
          {[artist, dur].filter(Boolean).join(' · ') || ' '}
        </div>
        {/* Tools sit on their own row above the waveform so the waveform spans the
            full width instead of being squeezed by a side column. */}
        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <span className="truncate font-mono text-[9px] tracking-[.4px] text-ink-faint">
            {t('library.showing', { version: versionLabel })}
            {isCurrent ? ` · ${t('library.current')}` : ''}
          </span>
          <div className="flex flex-none items-center gap-2">{branchSwitcher}</div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={toggle}
            disabled={!canPlay}
            aria-label={t('library.play')}
            className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"
          >
            {playing ? (
              <Pause size={14} fill="currentColor" />
            ) : (
              <Play size={14} fill="currentColor" className="ml-0.5" />
            )}
          </button>
          <div className="relative flex-1">
            {wave ? (
              <WaveformStrip peaks={wave.peaks} durationSec={wave.durationSec} />
            ) : (
              <div className="h-[34px] rounded-md bg-panel2" />
            )}
            {playing && (
              <div
                className="pointer-events-none absolute inset-y-0 w-[2px] bg-white shadow-[0_0_8px_var(--color-accent)]"
                style={{ left: `${pos * 100}%` }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
