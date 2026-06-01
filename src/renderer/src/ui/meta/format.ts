/** Display formatters for audio-technical metadata. All return an em dash when the value is absent. */

const DASH = '—'

/** Seconds → `m:ss` or `h:mm:ss`. */
export function formatDuration(sec: number | undefined): string {
  if (sec === undefined || !isFinite(sec)) return DASH
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`
  return `${m}:${ss}`
}

/** Bytes → `9.7 MB` / `2.0 KB` / `512 B`. */
export function formatBytes(n: number | undefined): string {
  if (n === undefined || !isFinite(n)) return DASH
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = n / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(1)} ${units[i]}`
}

const CHANNEL_NAMES: Record<number, string> = { 1: 'Mono', 2: 'Stereo', 6: '5.1', 8: '7.1' }

/** Channel count → friendly name (`Stereo`, `5.1`) or `N ch`. */
export function formatChannels(n: number | undefined): string {
  if (n === undefined) return DASH
  return CHANNEL_NAMES[n] ?? `${n} ch`
}

/** Hertz → `44.1 kHz` (trims a trailing `.0`). */
export function formatSampleRate(hz: number | undefined): string {
  if (hz === undefined) return DASH
  const khz = hz / 1000
  return `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`
}

/** kbps → `320 kbps`. */
export function formatBitrate(kbps: number | undefined): string {
  return kbps === undefined ? DASH : `${kbps} kbps`
}

/** Codec id → upper-cased label. */
export function formatCodec(codec: string | undefined): string {
  return codec ? codec.toUpperCase() : DASH
}
