/** Clamp `value + delta` into the inclusive range [min, max]. */
export function clampStep(value: number, delta: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value + delta))
}
