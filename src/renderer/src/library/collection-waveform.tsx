import React, { useEffect, useRef, useState } from 'react'
import type { Waveform } from '../../../shared/types'

/** Milliseconds for the free-running marquee to scroll one full peak set (50%). */
const MARQUEE_MS = 9000

/**
 * The signature hover waveform: the cover fades to black (handled by the tile) and a
 * symmetric waveform scrolls. A single rAF drives the scroll — a free-running marquee
 * by default, handing off seamlessly to audio-synced scroll whenever a preview is
 * actually advancing `posRef` (> 0). This means hover always animates, regardless of
 * whether audio previews are enabled or still buffering. Reduced motion → static.
 */
export function CollectionWaveform({
  active,
  loadWaveform,
  posRef
}: {
  active: boolean
  loadWaveform: () => Promise<Waveform | null>
  posRef?: React.RefObject<number>
}): React.JSX.Element {
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active || peaks) return
    let live = true
    void loadWaveform().then((wf) => {
      if (live && wf) setPeaks(wf.peaks.slice(0, 120))
    })
    return () => {
      live = false
    }
  }, [active, peaks, loadWaveform])

  // One animation loop for both modes. While the preview is advancing (posRef > 0) the
  // scroll locks to playback; otherwise a time-based marquee keeps it moving. Driving
  // both from rAF (rather than a CSS class we toggle) avoids the cascade conflict that
  // previously froze the waveform whenever a posRef was supplied.
  useEffect(() => {
    if (!active || !peaks) return
    const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let phase = 0
    let last = performance.now()
    const tick = (now: number): void => {
      const dt = now - last
      last = now
      const pos = posRef?.current ?? 0
      let x = 0
      if (reduce) x = 0
      else if (pos > 0)
        x = -pos * 50 // audio-synced
      else {
        phase = (phase + dt / MARQUEE_MS) % 1 // free-running marquee
        x = -phase * 50
      }
      if (stripRef.current) stripRef.current.style.transform = `translateX(${x}%)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, peaks, posRef])

  if (!peaks) return <></>
  // Duplicate the peak set so the scroll (translateX -50%) loops seamlessly.
  const bars = [...peaks, ...peaks]
  return (
    <div
      className={
        'pointer-events-none absolute inset-0 z-[2] overflow-hidden transition-opacity duration-500 ' +
        (active ? 'opacity-100' : 'opacity-0')
      }
      style={{
        WebkitMaskImage: 'linear-gradient(90deg,transparent,#000 13%,#000 87%,transparent)',
        maskImage: 'linear-gradient(90deg,transparent,#000 13%,#000 87%,transparent)'
      }}
    >
      <div
        ref={stripRef}
        className="absolute inset-y-0 left-0 flex w-[200%] items-center gap-[1.5px]"
        style={{ filter: 'drop-shadow(0 0 7px rgba(10,132,255,.45))' }}
      >
        {bars.map((p, i) => (
          <span
            key={i}
            data-collection-wave-bar
            className="min-w-0 flex-1 rounded-[1px] bg-gradient-to-b from-[rgba(74,163,255,.5)] via-accent to-[rgba(74,163,255,.5)]"
            style={{ height: `${12 + p * 88}%` }}
          />
        ))}
      </div>
    </div>
  )
}
