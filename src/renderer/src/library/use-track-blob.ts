import { useEffect, useRef, useState } from 'react'
import type { Waveform } from '../../../shared/types'

export interface TrackBlobArt {
  cover: string | null
  /** Lazily fetch + cache the version's peaks (used on first hover). */
  loadWaveform: () => Promise<Waveform | null>
}

/**
 * Resolve a library track's current-version blob, then its cover. The waveform is
 * fetched on demand (hover) and cached. Returns `null` cover until loaded.
 */
export function useTrackBlob(trackId: string | null): TrackBlobArt {
  const [cover, setCover] = useState<string | null>(null)
  const blob = useRef<{ file: string | null; hash: string | null }>({ file: null, hash: null })
  const wave = useRef<Waveform | null>(null)

  useEffect(() => {
    let live = true
    setCover(null)
    blob.current = { file: null, hash: null }
    wave.current = null
    if (!trackId) return
    void window.plucker.getLibraryTrackBlob(trackId).then((b) => {
      if (!live) return
      blob.current = b
      if (b.file) window.plucker.getCover(b.file).then((url) => live && setCover(url))
    })
    return () => {
      live = false
    }
  }, [trackId])

  const loadWaveform = async (): Promise<Waveform | null> => {
    if (wave.current) return wave.current
    const { file, hash } = blob.current
    if (!file) return null
    const wf = await window.plucker.getWaveform(file, hash ?? undefined)
    wave.current = wf
    return wf
  }

  return { cover, loadWaveform }
}
