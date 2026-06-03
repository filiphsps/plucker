import { useEffect, useState } from 'react'

/**
 * Lazily fetch a library track's artist + duration from its current-version blob.
 * One round-trip to resolve the blob, one to read metadata. Keyed by `trackId` and
 * derived, so it reads `null` until the new track's metadata loads — without a
 * synchronous setState in the effect body.
 */
export function useTrackMeta(trackId: string): {
  artist: string | null
  durationSec: number | null
} {
  const [loaded, setLoaded] = useState<{
    id: string
    artist: string | null
    durationSec: number | null
  } | null>(null)

  useEffect(() => {
    let live = true
    void window.plucker.getLibraryTrackBlob(trackId).then((b) => {
      if (!live || !b.file) return
      window.plucker.getTrackMetadata(b.file, b.hash ?? undefined).then((m) => {
        if (live)
          setLoaded({
            id: trackId,
            artist: m.tags.artist ?? null,
            durationSec: m.audio.durationSec ?? null
          })
      })
    })
    return () => {
      live = false
    }
  }, [trackId])

  const match = loaded && loaded.id === trackId
  return {
    artist: match ? loaded.artist : null,
    durationSec: match ? loaded.durationSec : null
  }
}
