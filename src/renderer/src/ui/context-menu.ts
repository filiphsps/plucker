// Renderer-facing context-menu helper. Consumers build menu items with inline
// onClick closures; we strip those into a serializable descriptor (assigning an id
// per clickable item), pop the native menu via IPC, and run the chosen handler.
import type {
  MenuAnchor,
  MenuDescriptor,
  MenuItemDescriptor,
  MenuRole
} from '../../../shared/context-menu'

export interface MenuItem {
  label?: string
  type?: 'normal' | 'separator'
  role?: MenuRole
  enabled?: boolean
  accelerator?: string
  /** SF Symbol name for the native panel's leading icon (e.g. 'doc.on.doc'). */
  symbol?: string
  onClick?: () => void
  /** Nested submenu items. */
  submenu?: MenuItem[]
}

/** Split items into a serializable descriptor + a handler map keyed by item id.
 * Recurses into submenus, assigning hierarchical ids (`item-0-item-1`). Exported for
 * testing. */
export function serializeMenu(items: MenuItem[]): {
  descriptor: MenuDescriptor
  handlers: Map<string, () => void>
} {
  const handlers = new Map<string, () => void>()
  const walk = (list: MenuItem[], prefix: string): MenuDescriptor =>
    list.map((item, i) => {
      if (item.type === 'separator') return { type: 'separator' }
      const id = `${prefix}item-${i}`
      const out: MenuItemDescriptor = {
        label: item.label,
        enabled: item.enabled,
        accelerator: item.accelerator
      }
      if (item.symbol) out.symbol = item.symbol
      if (item.role) return { ...out, role: item.role }
      if (item.onClick) {
        handlers.set(id, item.onClick)
        out.id = id
      }
      if (item.submenu) out.submenu = walk(item.submenu, `${id}-`)
      return out
    })
  return { descriptor: walk(items, ''), handlers }
}

// Track the last pointer position in screen coordinates so the native panel can
// anchor exactly at the cursor without every call site threading the event through.
// Capture-phase listeners run before the handler that calls showContextMenu.
let lastPointer: MenuAnchor = { x: 0, y: 0 }
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const track = (e: MouseEvent): void => {
    lastPointer = { x: e.screenX, y: e.screenY }
  }
  window.addEventListener('contextmenu', track, true)
  window.addEventListener('pointerdown', track, true)
}

/** Pop up a context menu for the given items and run the chosen handler. Anchors at
 * the cursor by default; pass `anchor` to override (e.g. button-triggered menus). */
export async function showContextMenu(items: MenuItem[], anchor?: MenuAnchor): Promise<void> {
  const { descriptor, handlers } = serializeMenu(items)
  const id = await window.plucker.popupMenu(descriptor, anchor ?? lastPointer)
  if (id) handlers.get(id)?.()
}
