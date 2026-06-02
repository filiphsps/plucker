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
}

export type MenuDescriptor = MenuItemDescriptor[]
