/** Clamp `n` into the inclusive range [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Time (seconds) at a 0..1 position along a track of `durationSec`. */
export function timeAtFraction(fraction: number, durationSec: number): number {
  return clamp(fraction, 0, 1) * durationSec
}
