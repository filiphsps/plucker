import { useEffect, useRef, useState, type RefObject } from 'react'
import { playPreview, INTENT_MS } from './preview-player'

/**
 * Declarative hover-to-play: drive a looping audio preview from hover *state*
 * rather than raw enter/leave events. Because the effect keys on both `hovered`
 * and `hash`, a preview that's hovered before its blob hash has resolved starts
 * automatically the moment the hash arrives — fixing the "first hover does
 * nothing" flakiness of the old imperative wiring. The dwell, single-active
 * hand-off, and easing live in {@link playPreview}.
 *
 * Returns `hovered` + `setHovered` (wire to mouseenter/leave and any hover-only
 * visuals), the live `playing` flag (for the pulse/waveform), and a `posRef`
 * updated each frame (0..1 within the loop).
 */
export function useHoverPreview(
  hash: string | null,
  range: [number, number]
): {
  hovered: boolean
  setHovered: (v: boolean) => void
  playing: boolean
  posRef: RefObject<number>
} {
  const [hovered, setHovered] = useState(false)
  const [playing, setPlaying] = useState(false)
  const posRef = useRef(0)
  const [t0, t1] = range

  useEffect(() => {
    if (!hovered || !hash) return
    let stop: (() => void) | null = null
    const timer = setTimeout(() => {
      stop = playPreview(hash, [t0, t1], {
        onFrame: (p) => (posRef.current = p),
        onState: (s) => setPlaying(s !== 'stopped')
      })
    }, INTENT_MS)
    return () => {
      clearTimeout(timer)
      stop?.()
      posRef.current = 0
      setPlaying(false)
    }
  }, [hovered, hash, t0, t1])

  return { hovered, setHovered, playing, posRef }
}
