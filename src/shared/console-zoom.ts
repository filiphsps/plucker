/**
 * Zoom bounds and stepping for the floating console window. The console scales
 * independently of the main window, so these helpers are shared between the main
 * process (clamping the persisted value before applying it) and the renderer
 * (stepping + displaying the current factor).
 */
export const CONSOLE_ZOOM_MIN = 0.5
export const CONSOLE_ZOOM_MAX = 2
export const CONSOLE_ZOOM_STEP = 0.1
export const CONSOLE_ZOOM_DEFAULT = 1

/** Clamp an arbitrary value into the supported zoom range, falling back to 1×. */
export function clampConsoleZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return CONSOLE_ZOOM_DEFAULT
  return Math.min(CONSOLE_ZOOM_MAX, Math.max(CONSOLE_ZOOM_MIN, zoom))
}

/**
 * Step the zoom one increment up (`+1`) or down (`-1`), clamped to range and
 * rounded to whole percent so repeated steps don't accumulate float drift.
 */
export function stepConsoleZoom(zoom: number, direction: 1 | -1): number {
  const next = clampConsoleZoom(zoom) + direction * CONSOLE_ZOOM_STEP
  return clampConsoleZoom(Math.round(next * 100) / 100)
}
