import React, { useEffect, useState } from 'react'
import type { Waveform } from '../../../shared/types'

/**
 * The signature hover waveform: the cover fades to black (handled by the tile) and a
 * vertically-centred, symmetric waveform blooms in then scrolls. Visual only — Plan 5
 * swaps the CSS marquee for playback-synced scroll + audio. Honors reduced-motion.
 */
export function CollectionWaveform({
  active,
  loadWaveform
}: {
  active: boolean
  loadWaveform: () => Promise<Waveform | null>
}): React.JSX.Element {
  const [peaks, setPeaks] = useState<number[] | null>(null)

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

  if (!peaks) return <></>
  // Duplicate the peak set so the marquee (translateX -50%) loops seamlessly.
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
        className="absolute inset-y-0 left-0 flex w-[200%] items-center gap-[1.5px] motion-safe:animate-[wave-marquee_9s_linear_infinite]"
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
