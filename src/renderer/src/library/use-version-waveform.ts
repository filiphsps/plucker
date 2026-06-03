import { useEffect, useState } from 'react'
import { downsamplePeaks } from '../ui/meta/waveform-utils'

/**
 * Resolve a library version's blob, then its real waveform peaks, downsampled to
 * `bars`. Keyed by `versionId` and derived, so it reads `null` until the new
 * version's peaks load — and `null` for a cold/unmaterialized version (no blob).
 * Used by the version-graph cards so each card shows its own waveform.
 */
export function useVersionWaveform(versionId: string | null, bars: number): number[] | null {
  const [loaded, setLoaded] = useState<{ id: string; peaks: number[] } | null>(null)

  useEffect(() => {
    let live = true
    if (!versionId) return
    void window.plucker.getLibraryVersionBlob(versionId).then((b) => {
      if (!live || !b.file) return
      window.plucker.getWaveform(b.file, b.hash ?? undefined).then((w) => {
        if (live && w) setLoaded({ id: versionId, peaks: downsamplePeaks(w.peaks, bars) })
      })
    })
    return () => {
      live = false
    }
  }, [versionId, bars])

  return loaded && loaded.id === versionId ? loaded.peaks : null
}
