import { useEffect, useRef, useState } from 'react'
import type { Waveform } from '../../../shared/types'

export interface TrackBlobArt {
  cover: string | null
  /** Current-version blob hash (for plucker-audio:// playback); null until resolved. */
  hash: string | null
  /** Lazily fetch + cache the version's peaks (used on first hover). */
  loadWaveform: () => Promise<Waveform | null>
}

/**
 * Resolve a library track's current-version blob, then its cover. The hash is surfaced
 * as soon as the blob resolves (so previews can start); the cover follows once read.
 * Keyed by `trackId` and derived — no synchronous setState in the effect body.
 */
export function useTrackBlob(trackId: string | null): TrackBlobArt {
  const [loaded, setLoaded] = useState<{
    id: string
    url: string | null
    hash: string | null
  } | null>(null)
  const blob = useRef<{ file: string | null; hash: string | null }>({ file: null, hash: null })
  const wave = useRef<Waveform | null>(null)

  useEffect(() => {
    let live = true
    blob.current = { file: null, hash: null }
    wave.current = null
    if (!trackId) return
    void window.plucker.getLibraryTrackBlob(trackId).then((b) => {
      if (!live) return
      blob.current = b
      // Surface the hash immediately; the cover updates once read.
      setLoaded({ id: trackId, url: null, hash: b.hash })
      if (b.file)
        window.plucker
          .getCover(b.file)
          .then((url) => live && setLoaded({ id: trackId, url, hash: b.hash }))
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

  const match = loaded && loaded.id === trackId
  return { cover: match ? loaded.url : null, hash: match ? loaded.hash : null, loadWaveform }
}
