// Builds the native application menu as a fully custom template. Every label comes from
// our i18n catalog (src/shared/menu-strings.ts); leaf items keep `role:` so macOS still
// provides correct native behavior (edit semantics, services, window management) while
// we own placement, labels, and accelerators. `buildMenuTemplate` is pure and testable;
// `buildAppMenu` resolves language/platform/settings and wires the action callbacks.
import { app, Menu, shell, clipboard, type MenuItemConstructorOptions } from 'electron'
import { menu as MENU, type MenuLang, type MenuStrings } from '../shared/menu-strings'
import { ACCELERATORS } from '../shared/shortcuts'
import { loadSettings } from './settings'
import { checkForUpdates, RELEASES_URL, type GetWindow } from './updater'
import type { MenuNavTarget } from '../shared/types'

export interface MenuContext {
  t: MenuStrings
  isMac: boolean
  appName: string
  /** Reload / Force Reload / Toggle Developer Tools group (dev builds or opt-in). */
  devToolsAvailable: boolean
  /** Toggle Console item. */
  consoleAvailable: boolean
  accelerators: typeof ACCELERATORS
}

export interface MenuActions {
  navigate: (target: MenuNavTarget) => void
  newDownload: () => void
  openUrl: () => void
  retransform: () => void
  toggleConsole: () => void
  checkForUpdates: () => void
  viewReleases: () => void
}

/** Build the application-menu template. Pure — no Electron side effects. */
export function buildMenuTemplate(ctx: MenuContext, a: MenuActions): MenuItemConstructorOptions[] {
  const { t, isMac, appName, devToolsAvailable, consoleAvailable, accelerators } = ctx
  const sep: MenuItemConstructorOptions = { type: 'separator' }

  const settingsItem: MenuItemConstructorOptions = {
    label: t.settings,
    accelerator: 'CmdOrCtrl+,',
    click: () => a.navigate('settings')
  }
  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: t.checkForUpdates,
    click: () => a.checkForUpdates()
  }

  const appMenu: MenuItemConstructorOptions = {
    label: appName,
    submenu: [
      { role: 'about', label: t.about },
      checkForUpdatesItem,
      sep,
      settingsItem,
      sep,
      { role: 'services', label: t.services },
      sep,
      { role: 'hide', label: t.hide },
      { role: 'hideOthers', label: t.hideOthers },
      { role: 'unhide', label: t.unhide },
      sep,
      { role: 'quit', label: t.quit }
    ]
  }

  const fileMenu: MenuItemConstructorOptions = {
    label: t.file,
    submenu: [
      { label: t.newDownload, accelerator: accelerators.newDownload, click: () => a.newDownload() },
      { label: t.openUrl, accelerator: accelerators.openUrl, click: () => a.openUrl() },
      sep,
      {
        label: t.retransformSelection,
        accelerator: accelerators.retransform,
        click: () => a.retransform()
      },
      sep,
      { label: t.manageCache, click: () => a.navigate('cache') },
      ...(!isMac ? [sep, settingsItem] : [])
    ]
  }

  const editMenu: MenuItemConstructorOptions = {
    label: t.edit,
    submenu: [
      { role: 'undo', label: t.undo },
      { role: 'redo', label: t.redo },
      sep,
      { role: 'cut', label: t.cut },
      { role: 'copy', label: t.copy },
      { role: 'paste', label: t.paste },
      { role: 'selectAll', label: t.selectAll }
    ]
  }

  // Reload / Force Reload / DevTools can wipe renderer state mid-download, so the whole
  // group is hidden in packaged builds unless developer mode is on.
  const devGroup: MenuItemConstructorOptions[] = devToolsAvailable
    ? [
        sep,
        { role: 'reload', label: t.reload },
        { role: 'forceReload', label: t.forceReload },
        { role: 'toggleDevTools', label: t.toggleDevTools }
      ]
    : []
  const consoleGroup: MenuItemConstructorOptions[] = consoleAvailable
    ? [
        sep,
        {
          label: t.toggleConsole,
          accelerator: accelerators.toggleConsole,
          click: () => a.toggleConsole()
        }
      ]
    : []

  const viewMenu: MenuItemConstructorOptions = {
    label: t.view,
    submenu: [
      { label: t.download, accelerator: 'CmdOrCtrl+1', click: () => a.navigate('download') },
      { label: t.history, accelerator: 'CmdOrCtrl+2', click: () => a.navigate('history') },
      ...devGroup,
      ...consoleGroup,
      sep,
      { role: 'togglefullscreen', label: t.enterFullScreen }
    ]
  }

  const windowMenu: MenuItemConstructorOptions = {
    label: t.window,
    submenu: [
      { role: 'minimize', label: t.minimize },
      { role: 'zoom', label: t.zoom },
      // `role: 'window'` makes Electron append the live window list (main + floating
      // console) on macOS.
      ...(isMac
        ? [
            sep,
            { role: 'front', label: t.bringAllToFront } as MenuItemConstructorOptions,
            sep,
            { role: 'window' } as MenuItemConstructorOptions
          ]
        : [])
    ]
  }

  const helpMenu: MenuItemConstructorOptions = {
    label: t.help,
    submenu: [
      ...(!isMac ? [checkForUpdatesItem, sep] : []),
      { label: t.viewReleases, click: () => a.viewReleases() }
    ]
  }

  return [...(isMac ? [appMenu] : []), fileMenu, editMenu, viewMenu, windowMenu, helpMenu]
}

/** Resolve the menu language from settings ('system' follows the OS locale). */
function resolveLang(): MenuLang {
  const setting = loadSettings().language
  const locale = setting === 'system' ? app.getLocale() : setting
  return locale.toLowerCase().startsWith('de') ? 'de' : 'en'
}

export function buildAppMenu(getWindow: GetWindow): void {
  const send = (channel: string, ...payload: unknown[]): void => {
    getWindow()?.webContents.send(channel, ...payload)
  }
  // In dev, or when the user enables the developer console, expose dev tooling.
  const devAvailable = !app.isPackaged || loadSettings().developer.console

  const template = buildMenuTemplate(
    {
      t: MENU[resolveLang()],
      isMac: process.platform === 'darwin',
      appName: app.name,
      devToolsAvailable: devAvailable,
      consoleAvailable: devAvailable,
      accelerators: ACCELERATORS
    },
    {
      navigate: (target) => send('menu:navigate', target),
      newDownload: () => send('menu:new-download'),
      openUrl: () => send('menu:open-url', clipboard.readText().trim()),
      retransform: () => send('menu:retransform-selection'),
      toggleConsole: () => send('menu:toggle-console'),
      checkForUpdates: () => void checkForUpdates(getWindow, { silent: false }),
      viewReleases: () => void shell.openExternal(RELEASES_URL)
    }
  )

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
