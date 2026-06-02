// src/main/audio-trim.ts
import { spawnManaged } from './spawn'
import { silenceRemoveFilter, type SilenceFilterOpts } from '../shared/silence-filter'
import {
  parseSilenceRegions,
  parseDurationSec,
  parseBitrateKbps,
  hasTrimmableSilence,
  measureEdgeSilence
} from '../shared/ffmpeg-output'

export interface TrimResult {
  /** Path to the trimmed file, or the original path when nothing was trimmed. */
  file: string
  trimmed: boolean
  /** Seconds removed from the start (0 when not trimmed or mode excludes start). */
  leadingSec: number
  /** Seconds removed from the end (0 when not trimmed or mode excludes end). */
  trailingSec: number
}

/** Injectable I/O so the orchestration is unit-testable without a real ffmpeg. */
export interface TrimDeps {
  /** Run the silencedetect probe; resolve with the combined ffmpeg stderr. */
  detect: (file: string, opts: SilenceFilterOpts) => Promise<string>
  /** Re-encode `input` to `output`, applying `filter` at `bitrateKbps`. */
  encode: (input: string, output: string, filter: string, bitrateKbps: number) => Promise<void>
}

const FALLBACK_BITRATE_KBPS = 320

/** Args for the probe pass — stderr carries silence regions, duration and bitrate. */
export function detectArgs(file: string, opts: SilenceFilterOpts): string[] {
  return [
    '-hide_banner',
    '-i',
    file,
    '-af',
    `silencedetect=noise=${opts.thresholdDb}dB:d=${opts.minDurationSec}`,
    '-f',
    'null',
    '-'
  ]
}

/** Args for the re-encode pass — trims audio, copies the cover and tags through. */
export function encodeArgs(
  input: string,
  output: string,
  filter: string,
  bitrateKbps: number
): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input,
    '-map',
    '0',
    '-map_metadata',
    '0',
    '-af',
    filter,
    '-c:a',
    'libmp3lame',
    '-b:a',
    `${bitrateKbps}k`,
    '-c:v',
    'copy',
    output
  ]
}

/**
 * Trim edge silence from `file`. Probe-first: when the requested ends have no
 * silence, the original file is returned untouched (no lossy re-encode). When
 * they do, the audio is re-encoded at the source bitrate to a sibling temp.
 */
export async function trimSilence(
  file: string,
  opts: SilenceFilterOpts,
  deps: TrimDeps
): Promise<TrimResult> {
  const untouched = { file, trimmed: false as const, leadingSec: 0, trailingSec: 0 }
  const filter = silenceRemoveFilter(opts)
  if (filter === null) return untouched // mode 'none'

  const stderr = await deps.detect(file, opts)
  const regions = parseSilenceRegions(stderr)
  if (regions.length === 0) return untouched

  const duration = parseDurationSec(stderr)
  const shouldTrim = duration === null ? true : hasTrimmableSilence(regions, duration, opts.mode)
  if (!shouldTrim) return untouched

  const bitrate = parseBitrateKbps(stderr) ?? FALLBACK_BITRATE_KBPS
  const output = `${file}.trim.mp3`
  await deps.encode(file, output, filter, bitrate)
  const { leadingSec, trailingSec } = measureEdgeSilence(regions, duration, opts.mode)
  return { file: output, trimmed: true, leadingSec, trailingSec }
}

/** Run ffmpeg, collecting stderr; resolves on close (callers check the code). */
function runFfmpeg(
  ffmpegPath: string,
  args: string[],
  signal?: AbortSignal,
  groupKey?: number
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawnManaged(ffmpegPath, args, {}, signal, undefined, groupKey)
    let stderr = ''
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stderr }))
  })
}

/** Real ffmpeg-backed deps for {@link trimSilence}. */
export function ffmpegTrimDeps(
  ffmpegPath: string,
  signal?: AbortSignal,
  groupKey?: number
): TrimDeps {
  return {
    detect: async (file, opts) => {
      const { stderr } = await runFfmpeg(ffmpegPath, detectArgs(file, opts), signal, groupKey)
      return stderr
    },
    encode: async (input, output, filter, bitrateKbps) => {
      const { code, stderr } = await runFfmpeg(
        ffmpegPath,
        encodeArgs(input, output, filter, bitrateKbps),
        signal,
        groupKey
      )
      if (code !== 0) throw new Error(`ffmpeg trim failed (code ${code}): ${stderr.trim()}`)
    }
  }
}
