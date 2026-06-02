/**
 * Human-readable byte size using 1024-based units (B, KB, MB, GB, TB).
 * Bytes render with no decimals; larger units use `fractionDigits` (default 1).
 *
 *   formatBytes(512)        → "512 B"
 *   formatBytes(1536)       → "1.5 KB"
 *   formatBytes(750579222)  → "715.8 MB"
 *
 * Negative or non-finite inputs clamp to "0 B".
 */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const rendered = unit === 0 ? Math.round(value).toString() : value.toFixed(fractionDigits)
  return `${rendered} ${units[unit]}`
}
