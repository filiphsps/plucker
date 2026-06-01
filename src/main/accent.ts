import { systemPreferences } from 'electron'

/** macOS blue — used until Windows/Linux sourcing is wired and when no API is available. */
export const DEFAULT_ACCENT = '#0a84ff'

/**
 * The user's OS accent color as `#rrggbb`.
 *
 * `systemPreferences.getAccentColor()` returns an RGBA hex string (e.g. "0a84ffff") on
 * macOS + Windows. Linux has no API and throws — callers get DEFAULT_ACCENT. Extracted
 * here so per-platform sourcing can evolve without touching the IPC layer.
 */
export function getAccentColor(): string {
  try {
    const raw = systemPreferences.getAccentColor?.() ?? ''
    const hex = raw.replace(/^#/, '').trim()
    if (hex.length >= 6) return `#${hex.slice(0, 6).toLowerCase()}`
    return DEFAULT_ACCENT
  } catch {
    return DEFAULT_ACCENT
  }
}
