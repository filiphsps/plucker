// Native context-menu service. The renderer sends a serializable descriptor over
// `menu:popup`; we build a native Electron menu, pop it at the cursor, and resolve
// the invoke with the clicked item's id (or null on dismiss). Clipboard writes for
// "Copy …" items go through `clipboard:write`.
import { BrowserWindow, clipboard, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron'
import type { MenuDescriptor } from '../shared/context-menu'
import type { GetWindow } from './updater'
import { log } from './log'

/** Map a serializable descriptor to an Electron template. Clickable items (those
 * carrying an `id`) call `onClick(id)`; separators and role items pass through. */
export function buildMenuTemplate(
  descriptor: MenuDescriptor,
  onClick: (id: string) => void
): MenuItemConstructorOptions[] {
  return descriptor.map((item) => {
    if (item.type === 'separator') return { type: 'separator' }
    if (item.role) {
      return { role: item.role, enabled: item.enabled, accelerator: item.accelerator }
    }
    const id = item.id
    return {
      label: item.label,
      enabled: item.enabled,
      accelerator: item.accelerator,
      click: id ? () => onClick(id) : undefined
    }
  })
}

/** Register the context-menu + clipboard IPC handlers. */
export function registerContextMenuIpc(getWindow: GetWindow): void {
  ipcMain.handle('menu:popup', (_e, descriptor: MenuDescriptor) => {
    return new Promise<string | null>((resolve) => {
      log.debug('menu', `popup: ${descriptor.length} items`)
      try {
        let clicked: string | null = null
        const template = buildMenuTemplate(descriptor, (id) => {
          clicked = id
        })
        const menu = Menu.buildFromTemplate(template)
        const win = getWindow() ?? BrowserWindow.getFocusedWindow()
        menu.popup({
          ...(win ? { window: win } : {}),
          callback: () => {
            log.debug('menu', clicked ? `clicked: ${clicked}` : 'dismissed')
            resolve(clicked)
          }
        })
      } catch (err) {
        log.error('menu', 'popup failed:', err)
        resolve(null)
      }
    })
  })
  ipcMain.handle('clipboard:write', (_e, text: string) => {
    // Log the length only — never the clipboard contents (URLs / titles / etc.).
    log.debug('menu', `clipboard write (${text.length} chars)`)
    clipboard.writeText(text)
  })
}
