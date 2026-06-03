/** Clamp `n` into the inclusive range [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Time (seconds) at a 0..1 position along a track of `durationSec`. */
export function timeAtFraction(fraction: number, durationSec: number): number {
  return clamp(fraction, 0, 1) * durationSec
}

/**
 * Map a preview position (0..1 within the snippet window `[t0,t1]` seconds) to
 * the playback fraction of the whole track (0..1 over `durationSec`). Lets a
 * full-track waveform show where a short hover-preview snippet actually is in
 * the track. Falls back to the raw snippet position when the duration is
 * unknown; result clamped to [0,1].
 */
export function snippetToTrackFraction(
  pos: number,
  [t0, t1]: [number, number],
  durationSec: number | null
): number {
  const seconds = t0 + pos * (t1 - t0)
  const f = durationSec && durationSec > 0 ? seconds / durationSec : pos
  return clamp(f, 0, 1)
}

/**
 * Reduce a full-resolution peak array to `buckets` bars by taking the loudest
 * peak within each slice. Lets a dense waveform fit a narrow strip without
 * aliasing away transients. Returns the input unchanged when it already has
 * `buckets` or fewer bars, and `[]` for empty input or a non-positive count.
 */
export function downsamplePeaks(peaks: number[], buckets: number): number[] {
  if (buckets <= 0) return []
  if (peaks.length <= buckets) return peaks
  const out = new Array<number>(buckets).fill(0)
  const per = peaks.length / buckets
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * per)
    const end = Math.min(peaks.length, Math.floor((b + 1) * per))
    let max = 0
    for (let i = start; i < end; i++) if (peaks[i] > max) max = peaks[i]
    out[b] = max
  }
  return out
}
