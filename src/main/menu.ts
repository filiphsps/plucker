// Builds the native application menu. Custom item labels come from the shared menu
// i18n strings (src/shared/menu-strings.ts); standard role-based menus (Edit/View/
// Window) are labelled and localized by Electron itself. Navigation items message the
// renderer over `menu:navigate` so they drive the same views as the in-app header.
import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { menu as MENU } from '../shared/menu-strings'
import { loadSettings } from './settings'
import { checkForUpdates, RELEASES_URL, type GetWindow } from './updater'
import type { MenuLang } from '../shared/menu-strings'
import type { MenuNavTarget } from '../shared/types'

/** Resolve the menu language from settings ('system' follows the OS locale). */
function resolveLang(): MenuLang {
  const setting = loadSettings().language
  const locale = setting === 'system' ? app.getLocale() : setting
  return locale.toLowerCase().startsWith('de') ? 'de' : 'en'
}

export function buildAppMenu(getWindow: GetWindow): void {
  const t = MENU[resolveLang()]
  const isMac = process.platform === 'darwin'

  const navigate = (target: MenuNavTarget) => (): void => {
    getWindow()?.webContents.send('menu:navigate', target)
  }

  const settingsItem: MenuItemConstructorOptions = {
    label: t.settings,
    accelerator: 'CmdOrCtrl+,',
    click: navigate('settings')
  }
  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: t.checkForUpdates,
    click: () => void checkForUpdates(getWindow, { silent: false })
  }
  const viewReleasesItem: MenuItemConstructorOptions = {
    label: t.viewReleases,
    click: () => void shell.openExternal(RELEASES_URL)
  }

  // The developer console toggle (⌘J) is only offered when the feature is available:
  // in dev, or when the user has enabled it in Settings.
  const consoleAvailable = !app.isPackaged || loadSettings().developer.console
  const consoleItem: MenuItemConstructorOptions = {
    label: t.toggleConsole,
    accelerator: 'CmdOrCtrl+J',
    click: () => getWindow()?.webContents.send('menu:toggle-console')
  }

  // Re-run the enabled transform chain on the current History selection. Always
  // enabled — the renderer no-ops (and shows a notice) when nothing eligible is
  // selected, so we don't have to mirror selection state into the native menu.
  const retransformItem: MenuItemConstructorOptions = {
    label: t.retransformSelection,
    click: () => getWindow()?.webContents.send('menu:retransform-selection')
  }

  // Download / History navigation, shared by the Go menu (and the mac app menu omits it).
  const goSubmenu: MenuItemConstructorOptions[] = [
    { label: t.download, accelerator: 'CmdOrCtrl+1', click: navigate('download') },
    { label: t.history, accelerator: 'CmdOrCtrl+2', click: navigate('history') },
    { type: 'separator' },
    retransformItem,
    ...(consoleAvailable ? [{ type: 'separator' } as MenuItemConstructorOptions, consoleItem] : []),
    ...(!isMac ? [{ type: 'separator' } as MenuItemConstructorOptions, settingsItem] : [])
  ]

  const appSubmenu: MenuItemConstructorOptions[] = [
    { role: 'about' },
    checkForUpdatesItem,
    { type: 'separator' },
    settingsItem,
    { type: 'separator' },
    { role: 'services' },
    { type: 'separator' },
    { role: 'hide' },
    { role: 'hideOthers' },
    { role: 'unhide' },
    { type: 'separator' },
    { role: 'quit' }
  ]

  const helpSubmenu: MenuItemConstructorOptions[] = [
    ...(!isMac ? [checkForUpdatesItem, { type: 'separator' } as MenuItemConstructorOptions] : []),
    viewReleasesItem
  ]

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ label: app.name, submenu: appSubmenu } as MenuItemConstructorOptions] : []),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { label: t.go, submenu: goSubmenu },
    { role: 'windowMenu' },
    { role: 'help', submenu: helpSubmenu }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
