// Serializable description of a native context menu. The renderer builds this from
// its menu items (stripping the onClick closures) and sends it to the main process
// over the `menu:popup` IPC channel; main turns it back into an Electron menu.
export type MenuRole = 'copy' | 'cut' | 'paste' | 'selectAll' | 'undo' | 'redo'

export interface MenuItemDescriptor {
  /** Present on clickable custom items; absent on separators and role items. */
  id?: string
  label?: string
  type?: 'normal' | 'separator'
  /** Built-in editing action handled natively by Electron (no id needed). */
  role?: MenuRole
  enabled?: boolean
  accelerator?: string
  /** SF Symbol name for the native panel's leading icon. Ignored by the Electron menu. */
  symbol?: string
  /** Nested submenu; opens as a flyout (native) or a real submenu (Electron). */
  submenu?: MenuDescriptor
}

export type MenuDescriptor = MenuItemDescriptor[]

/** Where to anchor the menu, in screen coordinates (top-left origin, matching the
 * DOM's `screenX`/`screenY`). Consumed by the native panel; ignored by the Electron
 * menu, which always pops at the OS cursor. */
export interface MenuAnchor {
  x: number
  y: number
  /** Optional NSScreen number to disambiguate multi-monitor setups. */
  screenId?: number
}
