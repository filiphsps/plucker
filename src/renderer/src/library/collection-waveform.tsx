import React, { useEffect, useRef, useState } from 'react'
import type { Waveform } from '../../../shared/types'

/**
 * The signature hover waveform: the cover fades to black (handled by the tile) and a
 * symmetric waveform scrolls. When a `posRef` is supplied, the scroll is driven by the
 * 0..1 playback position (synced to the preview audio); otherwise it falls back to a CSS
 * marquee. `posRef` staying at 0 (previews off / reduced-motion) → a static waveform.
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

  // Playback-synced scroll: when a position ref is supplied, drive the transform from it.
  useEffect(() => {
    if (!active || !posRef || !peaks) return
    let raf = 0
    const tick = (): void => {
      if (stripRef.current) stripRef.current.style.transform = `translateX(${-posRef.current * 50}%)`
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [active, posRef, peaks])

  if (!peaks) return <></>
  // Duplicate the peak set so the scroll (translateX -50%) loops seamlessly.
  const bars = [...peaks, ...peaks]
  const synced = !!posRef
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
        className={
          'absolute inset-y-0 left-0 flex w-[200%] items-center gap-[1.5px] ' +
          (synced ? '' : 'motion-safe:animate-[wave-marquee_9s_linear_infinite]')
        }
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
