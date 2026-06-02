import { readFileSync, writeFileSync } from 'node:fs'

/** Saved window geometry, persisted so a relaunch (incl. dev hot-restart) reopens in place. */
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

/** A display work area rectangle (top-left origin), as reported by Electron's `screen`. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// Floor sizes — refuse to restore a window so small it's effectively unusable, which
// guards against a corrupt or partially-written state file.
const MIN_WIDTH = 480
const MIN_HEIGHT = 400

/** Validate an arbitrary parsed blob into concrete bounds, or null when it's unusable. */
export function parseBounds(raw: unknown): WindowBounds | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  const nums = [b.x, b.y, b.width, b.height]
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const width = b.width as number
  const height = b.height as number
  if (width < MIN_WIDTH || height < MIN_HEIGHT) return null
  return { x: b.x as number, y: b.y as number, width, height }
}

/**
 * True when a meaningful slice of `bounds` overlaps at least one display work area —
 * i.e. the window would be reachable. Restoring onto a now-disconnected monitor would
 * strand the window off-screen, so the caller falls back to centering when this is false.
 */
export function isOnScreen(bounds: WindowBounds, areas: Rect[]): boolean {
  // Require at least this much of the window's title region to be visible so the user
  // can always grab and move it.
  const VISIBLE_MARGIN = 80
  return areas.some((a) => {
    const overlapX = Math.min(bounds.x + bounds.width, a.x + a.width) - Math.max(bounds.x, a.x)
    const overlapY = Math.min(bounds.y + bounds.height, a.y + a.height) - Math.max(bounds.y, a.y)
    return overlapX >= VISIBLE_MARGIN && overlapY >= VISIBLE_MARGIN
  })
}

/** Read + validate the persisted window bounds; null when missing, unreadable, or invalid. */
export function loadWindowBounds(file: string): WindowBounds | null {
  try {
    return parseBounds(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return null
  }
}

/** Persist window bounds to disk; swallows IO errors (geometry is non-critical state). */
export function saveWindowBounds(file: string, bounds: WindowBounds): void {
  try {
    writeFileSync(file, JSON.stringify(bounds))
  } catch {
    /* best-effort: losing saved geometry just means the next launch centers */
  }
}
