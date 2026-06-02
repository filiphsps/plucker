/** Cursor anchor in screen coordinates (top-left origin, matching the DOM). */
export interface MenuAnchor {
  x: number
  y: number
  /** Optional NSScreen number to disambiguate multi-monitor setups. */
  screenId?: number
}

/** Whether the native SwiftUI panel is usable in this process (macOS + built). */
export function isAvailable(): boolean

/**
 * Show the native context menu and resolve with the clicked item id, or null on
 * dismiss. `items` uses the same serializable shape as the shared MenuDescriptor;
 * an optional `symbol` (SF Symbol name) renders a leading icon.
 */
export function popup(
  items: ReadonlyArray<Record<string, unknown>>,
  anchor: MenuAnchor
): Promise<string | null>

/**
 * Render an SF Symbol to PNG bytes (an @2x template-style glyph) for use as an
 * application-menu icon. Returns a Buffer, or null when the addon is unavailable
 * (non-macOS / not built) or the symbol name is unknown.
 */
export function symbolPng(name: string, pointSize?: number): Buffer | null
