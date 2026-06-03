// Native context-menu service. The renderer sends a serializable descriptor over
// `menu:popup`; we build a native Electron menu, pop it at the cursor, and resolve
// the invoke with the clicked item's id (or null on dismiss). Clipboard writes for
// "Copy …" items go through `clipboard:write`.
import { BrowserWindow, clipboard, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron'
import type { MenuAnchor, MenuDescriptor } from '@shared/context-menu'
import type { GetWindow } from '@app/app/updater/updater'
import { log } from '@app/app/logging/log'

/** The native SwiftUI panel addon (@plucker/native-context-menu), loaded lazily. */
interface NativeMenu {
  isAvailable: () => boolean
  popup: (items: MenuDescriptor, anchor: MenuAnchor) => Promise<string | null>
}

let nativeChecked = false
let nativeMenu: NativeMenu | null = null

/** Resolve the native context-menu addon, or null to fall back to the Electron menu.
 * macOS-only; the import specifier is kept opaque to the bundler so the addon stays an
 * optional runtime dependency (missing/unbuilt → graceful fallback). */
async function loadNativeMenu(): Promise<NativeMenu | null> {
  if (nativeChecked) return nativeMenu
  nativeChecked = true
  if (process.platform !== 'darwin') return null
  try {
    const specifier = ['@plucker', 'native-context-menu'].join('/')
    const imported = (await import(/* @vite-ignore */ specifier)) as
      | NativeMenu
      | { default: NativeMenu }
    // The addon is CJS, so Node may expose its exports under `default`.
    const mod = 'isAvailable' in imported ? imported : imported.default
    nativeMenu = mod.isAvailable() ? mod : null
    log.debug('menu', nativeMenu ? 'native panel enabled' : 'native panel reported unavailable')
  } catch (err) {
    log.warn('menu', 'native panel unavailable, using Electron menu:', err)
    nativeMenu = null
  }
  return nativeMenu
}

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
    if (item.submenu) {
      return {
        label: item.label,
        enabled: item.enabled,
        submenu: buildMenuTemplate(item.submenu, onClick)
      }
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

/** True if the descriptor (at any depth) contains a built-in editing role. Such menus
 * must use the Electron menu, which dispatches roles against the focused webContents —
 * the native panel can't reach Chromium's responder chain. */
function hasRole(descriptor: MenuDescriptor): boolean {
  return descriptor.some(
    (item) => item.role != null || (item.submenu ? hasRole(item.submenu) : false)
  )
}

/** Register the context-menu + clipboard IPC handlers. */
export function registerContextMenuIpc(getWindow: GetWindow): void {
  ipcMain.handle('menu:popup', async (_e, descriptor: MenuDescriptor, anchor?: MenuAnchor) => {
    log.debug('menu', `popup: ${descriptor.length} items`)

    // Prefer the native SwiftUI panel when enabled; fall back to the Electron menu
    // on any failure so behaviour is identical when the addon is absent/disabled.
    const native = hasRole(descriptor) ? null : await loadNativeMenu()
    if (native && anchor) {
      try {
        return await native.popup(descriptor, anchor)
      } catch (err) {
        log.warn('menu', 'native popup failed, falling back to Electron menu:', err)
      }
    }

    return new Promise<string | null>((resolve) => {
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
