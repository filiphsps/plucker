import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { Settings } from '../shared/types'

export interface DownloadArgsInput {
  url: string
  destFolder: string
  settings: Settings
  ffmpegPath: string
  /**
   * Download only the single video the URL points at (`--no-playlist`) instead of
   * the whole playlist. The pipeline fans a playlist out into one single-video
   * download per entry so they can run concurrently — yt-dlp can't download
   * multiple playlist entries at once within one process.
   */
  singleVideo?: boolean
}

// Custom progress line we can parse deterministically:
//   "PLUCKER <playlist_index> <percent> <video_id> <title>"
// video_id is a no-space token, so the trailing title can contain spaces.
const PROGRESS_TEMPLATE =
  'PLUCKER %(info.playlist_index|1)s %(progress._percent)d %(info.id)s %(info.title)s'

export function buildDownloadArgs(input: DownloadArgsInput): string[] {
  const { url, destFolder, settings, ffmpegPath, singleVideo } = input
  const args = [
    '--ignore-errors',
    '--extract-audio',
    '--audio-format',
    'mp3',
    '--audio-quality',
    `${settings.audio.preferredBitrate}K`,
    '--embed-thumbnail',
    // libmp3lame algorithm effort: higher = faster encode (big help on slow CPUs),
    // inaudible at our bitrates. Use -compression_level (not -q:a, which would
    // switch the CBR encode to VBR and change the target bitrate).
    '--postprocessor-args',
    `ExtractAudio:-compression_level ${settings.performance.compressionLevel}`,
    '--embed-metadata',
    '--ffmpeg-location',
    ffmpegPath,
    '--newline',
    '--progress-template',
    PROGRESS_TEMPLATE,
    '--write-info-json',
    '--print',
    'after_move:PLUCKERDONE %(filepath)s',
    '-o',
    join(destFolder, '%(artist,uploader)s - %(track,title)s.%(ext)s'),
    singleVideo ? '--no-playlist' : '--yes-playlist'
  ]
  // Source-bitrate floor: select best audio at/above the floor with NO fallback,
  // so below-floor videos yield no format and are skipped under --ignore-errors.
  if (settings.audio.minBitrate != null) {
    args.push('-f', `ba[abr>=${settings.audio.minBitrate}]`)
  }
  if (settings.cookies.source !== 'none' && settings.cookies.source !== 'auto') {
    args.push('--cookies-from-browser', settings.cookies.source)
  }
  args.push(url)
  return args
}

export interface ProgressEvent {
  index: number
  percent: number
  videoId: string
  title: string
}

export function parseProgressLine(line: string): ProgressEvent | null {
  const m = line.match(/^PLUCKER\s+(\S+)\s+([\d.]+)\s+(\S+)\s+(.+)$/)
  if (!m) return null
  const index = /^\d+$/.test(m[1]) ? Number(m[1]) : 1
  return { index, percent: Number(m[2]), videoId: m[3], title: m[4].trim() }
}

/** Parse our after_move completion sentinel into the final file path. */
export function parseCompleteLine(line: string): string | null {
  const m = line.match(/^PLUCKERDONE\s+(.+)$/)
  return m ? m[1].trim() : null
}

export interface SkipEvent {
  videoId: string
}

/** Detect yt-dlp "Requested format is not available" lines (our below-floor skips). */
export function parseSkipLine(line: string): SkipEvent | null {
  const m = line.match(/\[\w+\]\s+([\w-]{6,}):\s+Requested format is not available/)
  return m ? { videoId: m[1] } : null
}

export interface ErrorEvent {
  /** The video the error pertains to, when yt-dlp names one. */
  videoId?: string
  /** Human-readable failure reason, surfaced in the UI. */
  message: string
}

/**
 * Parse a yt-dlp `ERROR:` line into a video id (when present) + message.
 * Below-floor skips ("Requested format is not available") are excluded — those
 * are handled as skips, not download failures.
 */
export function parseErrorLine(line: string): ErrorEvent | null {
  const m = line.match(/^ERROR:\s+(.+)$/)
  if (!m) return null
  const rest = m[1].trim()
  if (/Requested format is not available/.test(rest)) return null
  const vm = rest.match(/^\[\w+\]\s+([\w-]{6,}):\s+(.+)$/)
  if (vm) return { videoId: vm[1], message: vm[2].trim() }
  return { message: rest }
}

export interface SpawnResult {
  code: number
  stderrTail: string
  skipped: SkipEvent[]
  errors: ErrorEvent[]
}

/** Spawn yt-dlp, stream progress + skips, resolve with exit code + tail of stderr. */
export function runYtDlp(
  ytdlpPath: string,
  args: string[],
  onProgress: (e: ProgressEvent) => void,
  onComplete: (filePath: string) => void,
  signal?: AbortSignal
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(ytdlpPath, args, { signal })
    let stderrTail = ''
    let outBuf = ''
    let errBuf = ''
    const skipped: SkipEvent[] = []
    const errors: ErrorEvent[] = []
    const scanStderr = (buf: string): string => {
      const lines = buf.split('\n')
      const rest = lines.pop() ?? ''
      for (const line of lines) {
        const s = parseSkipLine(line)
        if (s) {
          skipped.push(s)
          continue
        }
        const e = parseErrorLine(line)
        if (e) errors.push(e)
      }
      return rest
    }
    child.stdout.on('data', (d: Buffer) => {
      outBuf += d.toString()
      const lines = outBuf.split('\n')
      outBuf = lines.pop() ?? ''
      for (const line of lines) {
        const done = parseCompleteLine(line)
        if (done) {
          onComplete(done)
          continue
        }
        const e = parseProgressLine(line)
        if (e) onProgress(e)
      }
    })
    child.stderr.on('data', (d: Buffer) => {
      stderrTail = (stderrTail + d.toString()).slice(-2000)
      errBuf = scanStderr(errBuf + d.toString())
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? -1, stderrTail, skipped, errors }))
  })
}
