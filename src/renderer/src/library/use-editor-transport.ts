import { useEffect, useRef, useState } from 'react'
import { stopPreview } from './preview-player'

export interface EditorTransport {
  playing: boolean
  /** Playhead as a 0..1 fraction of the track; persists across pause. */
  position: number
  /** Play from the current position, or pause keeping it (no reset). */
  toggle: () => void
  /** Move the playhead to `fraction` (0..1); keeps playing/paused as-is. */
  seek: (fraction: number) => void
}

/**
 * Full-track transport for the editor, backed by its own audio element. Unlike
 * the hover preview (a looping snippet that restarts each time), pausing keeps
 * `currentTime`, so play resumes where it left off, and `seek` moves the
 * playhead — including while paused — so clicking the waveform sets where
 * playback continues from.
 *
 * State is tagged with the hash it belongs to and derived at render, so a
 * track/version switch reads back as paused-at-0 without resetting state inside
 * an effect (the repo's keyed-derive idiom, e.g. useTrackBlob).
 */
export function useEditorTransport(hash: string | null, durationSec: number): EditorTransport {
  const [play, setPlay] = useState<{ h: string | null; on: boolean }>({ h: null, on: false })
  const [pos, setPos] = useState<{ h: string | null; v: number }>({ h: null, v: 0 })
  const playing = play.h === hash && play.on
  const position = pos.h === hash ? pos.v : 0

  const elRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef(0)
  // Read duration through a ref so the rAF/seek closures always see the latest
  // value (the waveform's duration arrives a tick after the element is created).
  const durRef = useRef(durationSec)
  useEffect(() => {
    durRef.current = durationSec
  }, [durationSec])

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (!hash) {
      elRef.current = null
      return
    }
    const el = new Audio(`plucker-audio://${hash}`)
    el.preload = 'auto'
    elRef.current = el
    const onEnded = (): void => {
      setPlay({ h: hash, on: false })
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    el.addEventListener('ended', onEnded)
    return () => {
      el.removeEventListener('ended', onEnded)
      el.pause()
      elRef.current = null
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [hash])

  const track = (h: string): void => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const tick = (): void => {
      const el = elRef.current
      const dur = durRef.current
      if (el && dur > 0) setPos({ h, v: Math.min(1, el.currentTime / dur) })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const toggle = (): void => {
    const el = elRef.current
    if (!el || !hash || durRef.current <= 0) return
    if (!el.paused) {
      el.pause()
      setPlay({ h: hash, on: false })
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    } else {
      stopPreview() // silence any lingering hover preview before transport audio
      if (el.ended) el.currentTime = 0 // replay from the start after it finished
      void el
        .play()
        .then(() => {
          setPlay({ h: hash, on: true })
          track(hash)
        })
        .catch(() => setPlay({ h: hash, on: false }))
    }
  }

  const seek = (fraction: number): void => {
    const el = elRef.current
    const dur = durRef.current
    if (!el || !hash || dur <= 0) return
    const f = Math.min(1, Math.max(0, fraction))
    try {
      el.currentTime = f * dur
    } catch {
      /* not seekable yet — position still reflects intent below */
    }
    setPos({ h: hash, v: f })
  }

  return { playing, position, toggle, seek }
}
