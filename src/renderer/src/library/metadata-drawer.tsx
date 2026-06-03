import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TrackMetadata } from '../../../shared/types'
import { TrackDetail } from '../ui/meta/track-detail'

/** A pull-tab on the seam that folds the (waveform-less) TrackDetail over the graph. */
export function MetadataDrawer({
  trackId,
  children
}: {
  trackId: string
  children: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [meta, setMeta] = useState<TrackMetadata | null>(null)

  useEffect(() => {
    if (!open || meta) return
    let live = true
    void window.plucker.getLibraryTrackBlob(trackId).then((b) => {
      if (!live || !b.file) return
      window.plucker.getTrackMetadata(b.file, b.hash ?? undefined).then((m) => live && setMeta(m))
    })
    return () => {
      live = false
    }
  }, [open, meta, trackId])

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="absolute left-1/2 top-0 z-[6] flex h-[19px] -translate-x-1/2 items-center gap-1.5 rounded-b-[9px] border border-t-0 border-line bg-panel px-3 font-mono text-[8.5px] uppercase tracking-[1px] text-ink-faint hover:bg-raise hover:text-ink-dim"
      >
        {t('library.metadata')}
        <span className={'transition-transform ' + (open ? 'rotate-180' : '')}>▾</span>
      </button>
      {children}
      <div
        className={
          'absolute inset-0 z-[4] bg-black/55 transition-opacity ' +
          (open ? 'opacity-100' : 'pointer-events-none opacity-0')
        }
      />
      <div
        className={
          'absolute inset-x-0 top-0 z-[5] border-b border-line bg-panel2 shadow-[0_20px_44px_rgba(0,0,0,.55)] transition-transform duration-300 ' +
          (open ? 'translate-y-0' : '-translate-y-[101%]')
        }
      >
        <TrackDetail meta={meta} state={meta ? 'ready' : 'loading'} showWaveform={false} />
      </div>
    </div>
  )
}
