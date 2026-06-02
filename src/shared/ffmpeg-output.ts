// src/shared/ffmpeg-output.ts
import type { TrimMode } from './silence-filter'

export interface SilenceRegion {
  start: number
  end: number
}

/** Pair `silence_start`/`silence_end` lines from ffmpeg silencedetect stderr. */
export function parseSilenceRegions(stderr: string): SilenceRegion[] {
  const regions: SilenceRegion[] = []
  let pendingStart: number | null = null
  for (const line of stderr.split('\n')) {
    const s = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/)
    if (s) {
      pendingStart = parseFloat(s[1])
      continue
    }
    const e = line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/)
    if (e && pendingStart !== null) {
      regions.push({ start: pendingStart, end: parseFloat(e[1]) })
      pendingStart = null
    }
  }
  return regions
}

/** Parse the input `Duration: HH:MM:SS.ss` line into seconds, or null. */
export function parseDurationSec(stderr: string): number | null {
  const m = stderr.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/)
  if (!m) return null
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

/** Parse an audio bitrate in kb/s (stream line preferred, container fallback). */
export function parseBitrateKbps(stderr: string): number | null {
  const stream = stderr.match(/Audio:.*?(\d+)\s*kb\/s/)
  if (stream) return Number(stream[1])
  const container = stderr.match(/bitrate:\s*(\d+)\s*kb\/s/)
  return container ? Number(container[1]) : null
}

/**
 * How close (seconds) a region's edge must sit to the literal stream start/end to
 * count as leading/trailing. `silenceremove` only strips silence anchored at the
 * very start (or, reversed, the very end) of the stream — a region that begins
 * after some audio, or ends before EOF, is left untouched. So this must be a tight
 * rounding tolerance, not a "near the edge" window: a looser value reports phantom
 * trims (logging silence that silenceremove never removes, leaving it on the
 * waveform).
 */
const EDGE_EPS = 0.05

/**
 * Whether the requested mode has edge silence to trim. silencedetect only reports
 * regions already at least `minDurationSec` long; a region counts only when it is
 * anchored to the literal edge — starting at the very beginning (leading) or
 * ending at the very end (trailing). Mid-track and merely near-edge silence are
 * ignored, matching what silenceremove actually removes.
 */
export function hasTrimmableSilence(
  regions: SilenceRegion[],
  durationSec: number | null,
  mode: TrimMode
): boolean {
  const hasLeading = regions.some((r) => r.start <= EDGE_EPS)
  const hasTrailing = durationSec !== null && regions.some((r) => r.end >= durationSec - EDGE_EPS)
  if (mode === 'start') return hasLeading
  if (mode === 'end') return hasTrailing
  if (mode === 'both') return hasLeading || hasTrailing
  return false
}

/**
 * Estimate how much edge silence the requested `mode` will remove, in seconds,
 * split per end. Leading is the length of a region anchored at the very start;
 * trailing is the span from a trailing region's start to the end of the track
 * (its reported `end` is clamped to the duration). Returns zeros for ends the
 * mode doesn't trim or that have no edge silence. Used only for logging, so an
 * unknown duration simply yields a 0 trailing estimate rather than guessing.
 */
export function measureEdgeSilence(
  regions: SilenceRegion[],
  durationSec: number | null,
  mode: TrimMode
): { leadingSec: number; trailingSec: number } {
  const round = (n: number): number => Math.round(Math.max(n, 0) * 1000) / 1000
  let leadingSec = 0
  let trailingSec = 0
  if (mode === 'start' || mode === 'both') {
    const lead = regions.find((r) => r.start <= EDGE_EPS)
    if (lead) leadingSec = round(lead.end - Math.max(lead.start, 0))
  }
  if ((mode === 'end' || mode === 'both') && durationSec !== null) {
    const trail = regions.find((r) => r.end >= durationSec - EDGE_EPS)
    if (trail) trailingSec = round(durationSec - trail.start)
  }
  return { leadingSec, trailingSec }
}
