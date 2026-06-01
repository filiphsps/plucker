import { spawnSync } from 'node:child_process'

/** Technical audio properties probed from a media file (all best-effort). */
export interface AudioInfo {
  codec?: string
  bitrateKbps?: number
  sampleRateHz?: number
  channels?: number
  durationSec?: number
}

const CHANNEL_WORDS: Record<string, number> = {
  mono: 1,
  stereo: 2,
  '2.1': 3,
  quad: 4,
  '4.0': 4,
  '5.0': 5,
  '5.1': 6,
  '6.1': 7,
  '7.1': 8
}

/** Parse the stderr banner ffmpeg prints for `-i <file>` into structured audio info. */
export function parseFfmpegInfo(stderr: string): AudioInfo {
  const info: AudioInfo = {}

  const dur = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (dur) {
    info.durationSec = +dur[1] * 3600 + +dur[2] * 60 + parseFloat(dur[3])
  }

  const stream = stderr.match(/Stream #\d+:\d+.*?:\s*Audio:\s*(.+)/)
  if (stream) {
    const parts = stream[1].split(',').map((s) => s.trim())
    const codec = parts[0]?.match(/^([a-z0-9]+)/i)
    if (codec) info.codec = codec[1].toLowerCase()

    for (const p of parts) {
      const hz = p.match(/^(\d+)\s*Hz$/)
      if (hz) info.sampleRateHz = +hz[1]

      if (info.channels === undefined) {
        if (p in CHANNEL_WORDS) info.channels = CHANNEL_WORDS[p]
        else {
          const ch = p.match(/^(\d+)\s*channels?$/)
          if (ch) info.channels = +ch[1]
        }
      }
    }
  }

  // Bitrate may appear on the Duration line and/or the stream line; prefer the stream's.
  const streamRate = stream?.[1].match(/(\d+)\s*kb\/s/)
  const overallRate = stderr.match(/bitrate:\s*(\d+)\s*kb\/s/)
  if (streamRate) info.bitrateKbps = +streamRate[1]
  else if (overallRate) info.bitrateKbps = +overallRate[1]

  return info
}

/** Probe a media file by running the bundled ffmpeg and parsing its stderr banner. */
export function probeAudio(ffmpegPath: string, file: string): AudioInfo {
  // `ffmpeg -i <file>` with no output exits non-zero but prints the stream banner
  // to stderr — exactly what we parse. We ignore the exit status by design.
  const res = spawnSync(ffmpegPath, ['-hide_banner', '-i', file], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  })
  return parseFfmpegInfo(`${res.stderr ?? ''}`)
}
