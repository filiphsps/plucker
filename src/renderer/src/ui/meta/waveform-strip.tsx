import React, { useRef, useState } from 'react'
import { formatDuration } from './format'
import { clamp, timeAtFraction } from './waveform-utils'

/**
 * A waveform: mirrored vertical bars drawn from a center baseline (one per
 * peak). Purely presentational and hand-rolled (no canvas, no dependency),
 * matching the existing `Meter`. Bars animate in with a left-to-right stagger
 * (see `wave-rise` in index.css; disabled under prefers-reduced-motion).
 *
 * Hovering shows the timestamp under the cursor (a thin guide line + a floating
 * label), derived from `durationSec`. That same cursor → fraction math drives
 * click-to-seek: clicking calls `onSeek(fraction)`. A `progress` (0..1) renders
 * the playhead so the strip doubles as a transport.
 */
export function WaveformStrip({
  peaks,
  durationSec,
  onContextMenu,
  progress,
  onSeek
}: {
  peaks: number[]
  durationSec?: number
  onContextMenu?: (e: React.MouseEvent) => void
  /** 0..1 playhead position; renders a playhead line when set. */
  progress?: number
  /** Seek callback (fraction 0..1) fired on click. */
  onSeek?: (fraction: number) => void
}): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  // Hover position as a 0..1 fraction across the strip; null when not hovering.
  const [hover, setHover] = useState<number | null>(null)

  if (peaks.length === 0) return null

  const showCursor = hover != null && durationSec != null

  const fractionAt = (e: React.MouseEvent): number | null => {
    const el = ref.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return clamp((e.clientX - rect.left) / rect.width, 0, 1)
  }
  const onMouseMove = (e: React.MouseEvent): void => {
    if (durationSec == null) return
    const f = fractionAt(e)
    if (f != null) setHover(f)
  }
  const onClick = (e: React.MouseEvent): void => {
    if (!onSeek) return
    const f = fractionAt(e)
    if (f != null) onSeek(f)
  }

  return (
    <div
      ref={ref}
      className={'relative mt-1.5 w-full ' + (onSeek ? 'cursor-pointer' : '')}
      onContextMenu={onContextMenu}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setHover(null)}
      onClick={onClick}
    >
      {showCursor && (
        <>
          <span
            className="pointer-events-none absolute bottom-full z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-raise px-1.5 py-0.5 font-mono text-[10.5px] leading-none text-ink shadow-[0_6px_20px_rgba(0,0,0,0.45)]"
            style={{ left: `${clamp(hover * 100, 0, 100)}%` }}
          >
            {formatDuration(timeAtFraction(hover, durationSec))}
          </span>
          <span
            className="pointer-events-none absolute inset-y-0 z-10 w-px -translate-x-1/2 bg-ink/40"
            style={{ left: `${clamp(hover * 100, 0, 100)}%` }}
          />
        </>
      )}
      {progress != null && (
        <span
          data-playhead
          className="pointer-events-none absolute inset-y-0 z-10 w-[2px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_8px_var(--color-accent)]"
          style={{ left: `${clamp(progress * 100, 0, 100)}%` }}
        />
      )}
      <div className="flex h-9 w-full items-center gap-px" aria-hidden>
        {peaks.map((p, i) => (
          <span
            key={i}
            data-wave-bar
            className="wave-bar flex-1 rounded-[1px] bg-ink-faint/60"
            style={{
              height: `${Math.max(2, p * 100)}%`,
              animationDelay: `${i * 6}ms`
            }}
          />
        ))}
      </div>
    </div>
  )
}
