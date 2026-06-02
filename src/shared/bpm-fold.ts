// src/shared/bpm-fold.ts
import type { TempoRange } from './tempo'

/**
 * Octave-fold a tempo into `[minBpm, maxBpm]` by repeatedly doubling or halving,
 * then round to a whole BPM.
 *
 * A steady pulse is equally periodic at half and double tempo, so any detector
 * — Essentia's or our own — legitimately reports a tempo an octave off. Folding
 * maps whatever octave it found into the caller's preferred range. The two loops
 * are monotonic and run sequentially, so this always terminates; when the range
 * spans less than an octave the result may sit just below `minBpm` (the closest
 * octave), which is the best we can do. A non-positive `bpm`/`maxBpm` is returned
 * (rounded) unchanged rather than looped on.
 */
export function foldBpm(bpm: number, range: TempoRange): number {
  if (!(bpm > 0) || !(range.maxBpm > 0)) return Math.round(bpm)
  let v = bpm
  while (v < range.minBpm) v *= 2
  while (v > range.maxBpm) v /= 2
  return Math.round(v)
}
