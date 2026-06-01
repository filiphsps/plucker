import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { Settings } from '../shared/types'

export interface DownloadArgsInput {
  url: string
  destFolder: string
  settings: Settings
  ffmpegPath: string
}

// Custom progress line we can parse deterministically:
//   "PLUCKER <playlist_index> <percent_no_%> <title>"
const PROGRESS_TEMPLATE =
  'PLUCKER %(info.playlist_index|1)s %(progress._percent_str)s %(info.title)s'

export function buildDownloadArgs(input: DownloadArgsInput): string[] {
  const { url, destFolder, settings, ffmpegPath } = input
  const args = [
    '--ignore-errors',
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', `${settings.audio.preferredBitrate}K`,
    '--embed-thumbnail',
    '--embed-metadata',
    '--ffmpeg-location', ffmpegPath,
    '--newline',
    '--progress-template', PROGRESS_TEMPLATE.replace('%(progress._percent_str)s', '%(progress._percent)d'),
    '-o', join(destFolder, '%(artist,uploader)s - %(track,title)s.%(ext)s'),
    '--yes-playlist',
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

export interface ProgressEvent { index: number; percent: number; title: string }

export function parseProgressLine(line: string): ProgressEvent | null {
  const m = line.match(/^PLUCKER\s+(\S+)\s+([\d.]+)\s+(.+)$/)
  if (!m) return null
  const index = /^\d+$/.test(m[1]) ? Number(m[1]) : 1
  return { index, percent: Number(m[2]), title: m[3].trim() }
}

export interface SkipEvent { videoId: string }

/** Detect yt-dlp "Requested format is not available" lines (our below-floor skips). */
export function parseSkipLine(line: string): SkipEvent | null {
  const m = line.match(/\[\w+\]\s+([\w-]{6,}):\s+Requested format is not available/)
  return m ? { videoId: m[1] } : null
}

export interface SpawnResult { code: number; stderrTail: string; skipped: SkipEvent[] }

/** Spawn yt-dlp, stream progress + skips, resolve with exit code + tail of stderr. */
export function runYtDlp(
  ytdlpPath: string,
  args: string[],
  onProgress: (e: ProgressEvent) => void,
  signal?: AbortSignal,
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(ytdlpPath, args, { signal })
    let stderrTail = ''
    let outBuf = ''
    let errBuf = ''
    const skipped: SkipEvent[] = []
    const scanSkips = (buf: string): string => {
      const lines = buf.split('\n')
      const rest = lines.pop() ?? ''
      for (const line of lines) { const s = parseSkipLine(line); if (s) skipped.push(s) }
      return rest
    }
    child.stdout.on('data', (d: Buffer) => {
      outBuf += d.toString()
      const lines = outBuf.split('\n')
      outBuf = lines.pop() ?? ''
      for (const line of lines) {
        const e = parseProgressLine(line)
        if (e) onProgress(e)
      }
    })
    child.stderr.on('data', (d: Buffer) => {
      stderrTail = (stderrTail + d.toString()).slice(-2000)
      errBuf = scanSkips(errBuf + d.toString())
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? -1, stderrTail, skipped }))
  })
}
