// Builds the native application menu as a fully custom template. Every label comes from
// our i18n catalog (src/shared/menu-strings.ts); leaf items keep `role:` so macOS still
// provides correct native behavior (edit semantics, services, window management) while we
// own placement, labels, accelerators, and icons. Following macOS convention (Safari,
// VS Code, Ghostty), SF Symbol icons appear only on Plucker-specific *action* commands —
// New Download, Open URL…, Re-run Transforms, Manage Cache…, the two primary destinations,
// Toggle Console, View Releases. Standard system items (About, Settings, Quit, the Edit
// roles, window/zoom, etc.) stay text-only, as do the top-level bar titles (a platform
// constraint). `buildMenuTemplate` is pure and testable; `buildAppMenu` resolves
// language/platform/settings, wires the action callbacks, and supplies the icon resolver.
// Icons must be primed once via `primeMenuIcons()` before the first build.
import { app, Menu, shell, clipboard, nativeImage, type MenuItemConstructorOptions } from 'electron'
import { menu as MENU, type MenuLang, type MenuStrings } from '../shared/menu-strings'
import { ACCELERATORS } from '../shared/shortcuts'
import { loadSettings } from './settings'
import { checkForUpdates, RELEASES_URL, type GetWindow } from './updater'
import { log } from './log'
import type { MenuNavTarget } from '../shared/types'

/** Resolves an SF Symbol name to a menu icon (NativeImage), or undefined when icons are
 * unavailable (non-macOS / addon not built) or the symbol name is unknown. */
type IconResolver = (symbol: string) => MenuItemConstructorOptions['icon'] | undefined

export interface MenuContext {
  t: MenuStrings
  isMac: boolean
  appName: string
  /** Reload / Force Reload / Toggle Developer Tools group (dev builds or opt-in). */
  devToolsAvailable: boolean
  /** Toggle Console item. */
  consoleAvailable: boolean
  accelerators: typeof ACCELERATORS
  /** Maps an SF Symbol name to an icon; omitted in tests / when icons are unavailable. */
  resolveIcon?: IconResolver
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
  // Icons go only on Plucker-specific action commands (see file header). Standard
  // system items are intentionally left icon-less to match native macOS apps.
  const ic = (symbol: string): MenuItemConstructorOptions['icon'] | undefined =>
    ctx.resolveIcon?.(symbol)

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
      {
        label: t.newDownload,
        icon: ic('plus.circle'),
        accelerator: accelerators.newDownload,
        click: () => a.newDownload()
      },
      {
        label: t.openUrl,
        icon: ic('link'),
        accelerator: accelerators.openUrl,
        click: () => a.openUrl()
      },
      sep,
      {
        label: t.retransformSelection,
        icon: ic('arrow.triangle.2.circlepath'),
        accelerator: accelerators.retransform,
        click: () => a.retransform()
      },
      sep,
      { label: t.manageCache, icon: ic('internaldrive'), click: () => a.navigate('cache') },
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
          icon: ic('terminal'),
          accelerator: accelerators.toggleConsole,
          click: () => a.toggleConsole()
        }
      ]
    : []

  const viewMenu: MenuItemConstructorOptions = {
    label: t.view,
    submenu: [
      {
        label: t.download,
        icon: ic('arrow.down.to.line'),
        accelerator: 'CmdOrCtrl+1',
        click: () => a.navigate('download')
      },
      {
        label: t.history,
        icon: ic('clock.arrow.circlepath'),
        accelerator: 'CmdOrCtrl+2',
        click: () => a.navigate('history')
      },
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
      { label: t.viewReleases, icon: ic('tag'), click: () => a.viewReleases() }
    ]
  }

  return [...(isMac ? [appMenu] : []), fileMenu, editMenu, viewMenu, windowMenu, helpMenu]
}

// --- Icon rendering (native SF Symbols) ------------------------------------------------

/** symbolPng(name, pointSize) from @plucker/native-context-menu, loaded once. */
type SymbolPng = (name: string, pointSize?: number) => Buffer | null
let symbolPng: SymbolPng | null = null
const iconCache = new Map<string, Electron.NativeImage | null>()

/** Load the native addon and confirm the SF-Symbol renderer is usable. macOS-only; the
 * import specifier is kept opaque to the bundler so the addon stays an optional runtime
 * dependency (missing/unbuilt → menus simply render without icons). Call once before the
 * first `buildAppMenu`. */
export async function primeMenuIcons(): Promise<void> {
  if (process.platform !== 'darwin') return
  try {
    const specifier = ['@plucker', 'native-context-menu'].join('/')
    const imported = (await import(/* @vite-ignore */ specifier)) as Record<string, unknown> & {
      default?: Record<string, unknown>
    }
    const mod = ('symbolPng' in imported ? imported : imported.default) as
      | { isAvailable?: () => boolean; symbolPng?: SymbolPng }
      | undefined
    if (mod?.isAvailable?.() && typeof mod.symbolPng === 'function') {
      symbolPng = mod.symbolPng
      log.debug('menu', 'native menu icons enabled')
    }
  } catch (err) {
    symbolPng = null
    log.warn('menu', 'native menu icons unavailable, using text-only menus:', err)
  }
}

/** Render (and cache) the icon for an SF Symbol as a template NativeImage. */
function iconFor(symbol: string): MenuItemConstructorOptions['icon'] | undefined {
  if (!symbolPng) return undefined
  if (iconCache.has(symbol)) return iconCache.get(symbol) ?? undefined
  let image: Electron.NativeImage | null = null
  const buf = symbolPng(symbol, 15)
  if (buf) {
    const img = nativeImage.createFromBuffer(buf, { scaleFactor: 2 })
    if (!img.isEmpty()) {
      img.setTemplateImage(true)
      image = img
    }
  }
  iconCache.set(symbol, image)
  return image ?? undefined
}

// --- Assembly ---------------------------------------------------------------------------

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
      accelerators: ACCELERATORS,
      resolveIcon: iconFor
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
