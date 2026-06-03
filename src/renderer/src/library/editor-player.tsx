import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Music } from 'lucide-react'
import type { Waveform } from '../../../shared/types'
import { useTrackBlob } from './use-track-blob'
import { useTrackMeta } from './use-track-meta'
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
  const { cover } = useTrackBlob(trackId)
  const { artist, durationSec } = useTrackMeta(trackId)

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
        <div className="mt-auto pt-3">
          {wave ? (
            <WaveformStrip peaks={wave.peaks} durationSec={wave.durationSec} />
          ) : (
            <div className="h-[34px] rounded-md bg-panel2" />
          )}
        </div>
      </div>
      <div className="flex flex-none flex-col items-end gap-2">
        <div className="flex items-center gap-2">{branchSwitcher}</div>
        <div className="font-mono text-[9px] tracking-[.4px] text-ink-faint">
          {t('library.showing', { version: versionLabel })}
          {isCurrent ? ` · ${t('library.current')}` : ''}
        </div>
      </div>
    </div>
  )
}
