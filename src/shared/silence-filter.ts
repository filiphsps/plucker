// src/shared/silence-filter.ts

export type TrimMode = 'both' | 'start' | 'end' | 'none'

export interface SilenceFilterOpts {
  mode: TrimMode
  /** Anything quieter than this (dB, negative) counts as silence; -90 ≈ true silence. */
  thresholdDb: number
  /** Minimum silence length, in seconds, before a region is trimmed. */
  minDurationSec: number
}

/** The leading-silence half of a silenceremove filter. */
function startFilter(thresholdDb: number, minDurationSec: number): string {
  return `silenceremove=start_periods=1:start_threshold=${thresholdDb}dB:start_duration=${minDurationSec}`
}

/**
 * ffmpeg `-af` filtergraph that trims silence at the requested ends, or null for
 * mode 'none'. silenceremove only trims *leading* silence natively, so trailing
 * silence is removed by reversing the stream, trimming the now-leading silence,
 * and reversing back.
 */
export function silenceRemoveFilter(opts: SilenceFilterOpts): string | null {
  const { mode, thresholdDb, minDurationSec } = opts
  if (mode === 'none') return null
  const start = startFilter(thresholdDb, minDurationSec)
  const end = `areverse,${start},areverse`
  if (mode === 'start') return start
  if (mode === 'end') return end
  return `${start},${end}` // both
}
