import { describe, it, expect, vi } from 'vitest'
import { buildMenuTemplate, type MenuContext, type MenuActions } from './menu'
import { menu as MENU } from '../shared/menu-strings'
import { ACCELERATORS } from '../shared/shortcuts'
import type { MenuItemConstructorOptions } from 'electron'

function ctx(over: Partial<MenuContext> = {}): MenuContext {
  return {
    t: MENU.en,
    isMac: true,
    appName: 'Plucker',
    devToolsAvailable: true,
    consoleAvailable: true,
    accelerators: ACCELERATORS,
    ...over
  }
}

function actions(): MenuActions {
  return {
    navigate: vi.fn(),
    newDownload: vi.fn(),
    openUrl: vi.fn(),
    toggleConsole: vi.fn(),
    checkForUpdates: vi.fn(),
    viewReleases: vi.fn()
  }
}

const titles = (t: MenuItemConstructorOptions[]): (string | undefined)[] => t.map((m) => m.label)
const sub = (m: MenuItemConstructorOptions): MenuItemConstructorOptions[] =>
  (m.submenu as MenuItemConstructorOptions[]) ?? []
const find = (items: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions =>
  items.find((i) => i.label === label)!
const click = (m: MenuItemConstructorOptions): void => m.click!({} as never, undefined, {} as never)

describe('buildMenuTemplate', () => {
  it('has no Go menu and uses conventional top-level order on mac', () => {
    const t = buildMenuTemplate(ctx(), actions())
    expect(titles(t)).toEqual(['Plucker', 'File', 'Edit', 'View', 'Window', 'Help'])
    expect(titles(t)).not.toContain('Go')
  })

  it('omits the app menu off mac and routes settings into File', () => {
    const t = buildMenuTemplate(ctx({ isMac: false }), actions())
    expect(titles(t)).toEqual(['File', 'Edit', 'View', 'Window', 'Help'])
    expect(titles(sub(find(t, 'File')))).toContain('Settings…')
  })

  it('dispatches navigation and command items to the right action', () => {
    const a = actions()
    const t = buildMenuTemplate(ctx(), a)
    const view = sub(find(t, 'View'))
    click(find(view, 'Download'))
    expect(a.navigate).toHaveBeenCalledWith('download')
    const file = sub(find(t, 'File'))
    click(find(file, 'New Download'))
    expect(a.newDownload).toHaveBeenCalled()
    click(find(file, 'Open URL…'))
    expect(a.openUrl).toHaveBeenCalled()
    click(find(file, 'Manage Cache…'))
    expect(a.navigate).toHaveBeenCalledWith('cache')
  })

  it('binds the documented accelerators (reload on role default)', () => {
    const t = buildMenuTemplate(ctx(), actions())
    const file = sub(find(t, 'File'))
    expect(find(file, 'New Download').accelerator).toBe('CmdOrCtrl+N')
    const view = sub(find(t, 'View'))
    expect(find(view, 'Reload').accelerator).toBeUndefined() // role default (CmdOrCtrl+R)
    expect(find(view, 'Force Reload').accelerator).toBeUndefined()
  })

  it('hides the developer group when dev tools are unavailable', () => {
    const t = buildMenuTemplate(ctx({ devToolsAvailable: false }), actions())
    expect(titles(sub(find(t, 'View')))).not.toContain('Reload')
    expect(titles(sub(find(t, 'View')))).not.toContain('Toggle Developer Tools')
  })

  it('hides Toggle Console when the console is unavailable', () => {
    const t = buildMenuTemplate(ctx({ consoleAvailable: false }), actions())
    expect(titles(sub(find(t, 'View')))).not.toContain('Toggle Console')
  })

  it('appends the auto window list via a role:window item on mac', () => {
    const t = buildMenuTemplate(ctx(), actions())
    const win = sub(find(t, 'Window'))
    expect(win.some((i) => i.role === 'window')).toBe(true)
    expect(win.some((i) => i.role === 'front')).toBe(true)
  })

  it('keeps roles on edit leaf items for native behavior', () => {
    const t = buildMenuTemplate(ctx(), actions())
    const edit = sub(find(t, 'Edit'))
    expect(find(edit, 'Copy').role).toBe('copy')
    expect(find(edit, 'Paste').role).toBe('paste')
  })

  it('puts icons only on Plucker-specific action commands, not standard system items', () => {
    const resolveIcon = (s: string): string => `icon:${s}`
    const t = buildMenuTemplate(ctx({ resolveIcon }), actions())
    const app = sub(find(t, 'Plucker'))
    const file = sub(find(t, 'File'))
    const edit = sub(find(t, 'Edit'))
    const view = sub(find(t, 'View'))
    const help = sub(find(t, 'Help'))

    // App-specific commands get icons.
    for (const [items, label] of [
      [file, 'New Download'],
      [file, 'Open URL…'],
      [file, 'Manage Cache…'],
      [view, 'Download'],
      [view, 'History'],
      [view, 'Toggle Console'],
      [help, 'View Releases']
    ] as const) {
      expect(find(items, label).icon, label).toBeDefined()
    }

    // Standard system items stay text-only — even though a resolver is available.
    for (const [items, label] of [
      [app, 'About Plucker'],
      [app, 'Check for Updates…'],
      [app, 'Settings…'],
      [app, 'Quit Plucker'],
      [edit, 'Copy'],
      [edit, 'Paste'],
      [view, 'Reload'],
      [view, 'Enter Full Screen']
    ] as const) {
      expect(find(items, label).icon, label).toBeUndefined()
    }
  })

  it('omits all icons when no resolver is provided', () => {
    const t = buildMenuTemplate(ctx(), actions())
    expect(find(sub(find(t, 'File')), 'New Download').icon).toBeUndefined()
    expect(find(sub(find(t, 'View')), 'Download').icon).toBeUndefined()
  })
})
