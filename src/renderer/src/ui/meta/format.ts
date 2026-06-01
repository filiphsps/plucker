/** Display formatters for audio-technical metadata. All return an em dash when the value is absent. */

const DASH = '—'

/**
 * Format a number with thousands grouping (and fixed decimals when requested),
 * e.g. `7,300` or `1,200,300.25`. Uses a fixed `en-US` locale so output is
 * deterministic (commas + dot decimals) regardless of the host machine locale.
 */
export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value)
}

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
  if (n < 1024) return `${formatNumber(n)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = n / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${formatNumber(value, 1)} ${units[i]}`
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
  return `${Number.isInteger(khz) ? formatNumber(khz) : formatNumber(khz, 1)} kHz`
}

/** kbps → `320 kbps`. */
export function formatBitrate(kbps: number | undefined): string {
  return kbps === undefined ? DASH : `${formatNumber(kbps)} kbps`
}

/** Codec id → upper-cased label. */
export function formatCodec(codec: string | undefined): string {
  return codec ? codec.toUpperCase() : DASH
}

/** Bytes/sec → `1.2 MB/s` / `850 KB/s`; em dash when absent or zero. */
export function formatSpeed(bytesPerSec: number | undefined): string {
  if (!bytesPerSec || !isFinite(bytesPerSec) || bytesPerSec <= 0) return DASH
  return `${formatBytes(bytesPerSec)}/s`
}

/** Milliseconds → `735ms` (sub-second) or `7.2s`; em dash when absent. */
export function formatElapsed(ms: number | undefined): string {
  if (ms === undefined || !isFinite(ms) || ms < 0) return DASH
  return ms < 1000 ? `${formatNumber(Math.round(ms))}ms` : `${formatNumber(ms / 1000, 1)}s`
}
