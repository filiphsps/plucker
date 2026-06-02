// Renderer-facing context-menu helper. Consumers build menu items with inline
// onClick closures; we strip those into a serializable descriptor (assigning an id
// per clickable item), pop the native menu via IPC, and run the chosen handler.
import type { MenuDescriptor, MenuItemDescriptor, MenuRole } from '../../../shared/context-menu'

export interface MenuItem {
  label?: string
  type?: 'normal' | 'separator'
  role?: MenuRole
  enabled?: boolean
  accelerator?: string
  onClick?: () => void
}

/** Split items into a serializable descriptor + a handler map keyed by item id.
 * Exported for testing. */
export function serializeMenu(items: MenuItem[]): {
  descriptor: MenuDescriptor
  handlers: Map<string, () => void>
} {
  const handlers = new Map<string, () => void>()
  const descriptor: MenuDescriptor = items.map((item, i) => {
    if (item.type === 'separator') return { type: 'separator' }
    const base: MenuItemDescriptor = {
      label: item.label,
      enabled: item.enabled,
      accelerator: item.accelerator
    }
    if (item.role) return { ...base, role: item.role }
    if (item.onClick) {
      const id = `item-${i}`
      handlers.set(id, item.onClick)
      return { ...base, id }
    }
    return base
  })
  return { descriptor, handlers }
}

/** Pop up a native context menu for the given items and run the chosen handler. */
export async function showContextMenu(items: MenuItem[]): Promise<void> {
  const { descriptor, handlers } = serializeMenu(items)
  const id = await window.plucker.popupMenu(descriptor)
  if (id) handlers.get(id)?.()
}
