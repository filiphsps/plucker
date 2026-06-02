# Custom Application Menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the role-aggregate Electron menu (and its grab-bag `Go` menu) with a fully custom, i18n-first template using conventional action placement (Structure A).

**Architecture:** Split `menu.ts` into a **pure** `buildMenuTemplate(ctx, actions)` that returns `MenuItemConstructorOptions[]` (testable, no Electron side effects) and a thin `buildAppMenu(getWindow)` wrapper that resolves language/platform/settings, wires the action callbacks (IPC sends, clipboard, updater, shell), and installs the menu. Two new commands (New Download, Open URL…) flow renderer-ward over new `menu:*` channels; `Manage Cache…` reuses the navigation channel via a new `'cache'` target.

**Tech Stack:** Electron `Menu` API, TypeScript, Vitest, React (renderer wiring), i18n strings shared in `src/shared`.

**Spec:** `.specs/2026-06-02-app-menu-design.md`

---

## File structure

- **Modify** `src/shared/menu-strings.ts` — replace the string catalog (remove `go`, add every menu title + custom + standard-role label, en/de).
- **Create** `src/shared/menu-strings.test.ts` — en/de key-parity test.
- **Modify** `src/shared/shortcuts.ts` — add `newDownload`, `openUrl`, `retransform` accelerators.
- **Modify** `src/shared/types.ts:27` — extend `MenuNavTarget` with `'cache'`.
- **Modify** `src/preload/index.ts` — add `onMenuNewDownload` and `onMenuOpenUrl` subscriptions.
- **Rewrite** `src/main/menu.ts` — pure `buildMenuTemplate` + thin `buildAppMenu`.
- **Create** `src/main/menu.test.ts` — structure/placement/dispatch/gating tests over the pure builder.
- **Modify** `src/renderer/src/download-view.tsx` — add a `prefill` prop that sets the URL field + focuses.
- **Modify** `src/renderer/src/app.tsx` — handle `'cache'` nav, subscribe to the two new commands, pass `prefill` to `DownloadView`.
- **Modify** `src/renderer/src/download-view.test.tsx` (if present) or create it — test the `prefill` behavior.

Note for reviewers: the renderer doesn't read any `menu.*` i18n key via `t()` (verified — the catalog merge `menu: menu.en` is exposure-only), so churning the menu-strings keys is safe.

---

### Task 1: i18n catalog for the menu

**Files:**
- Modify: `src/shared/menu-strings.ts`
- Test: `src/shared/menu-strings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/menu-strings.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { menu } from './menu-strings'

describe('menu strings', () => {
  it('has identical key sets for en and de', () => {
    const en = Object.keys(menu.en).sort()
    const de = Object.keys(menu.de).sort()
    expect(de).toEqual(en)
  })

  it('has no empty strings', () => {
    for (const lang of [menu.en, menu.de]) {
      for (const [key, value] of Object.entries(lang)) {
        expect(value, key).toBeTruthy()
      }
    }
  })

  it('dropped the obsolete Go menu key', () => {
    expect('go' in menu.en).toBe(false)
    expect('go' in menu.de).toBe(false)
  })

  it('exposes the new menu titles and commands', () => {
    for (const k of ['file', 'view', 'window', 'help', 'newDownload', 'openUrl', 'manageCache']) {
      expect(menu.en).toHaveProperty(k)
      expect(menu.de).toHaveProperty(k)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/menu-strings.test.ts`
Expected: FAIL — `go` still present / new keys missing.

- [ ] **Step 3: Replace the catalog**

Replace the entire body of `src/shared/menu-strings.ts` with:

```ts
// i18n strings for the native application menu ("chrome"). These live in src/shared so
// the main process (which builds the menu) and the renderer i18n catalog can both use
// them. The app resolves the menu language to exactly 'en' or 'de' (see
// src/main/menu.ts → resolveLang), so we own every label here — including standard
// role items like Copy/Paste — rather than relying on Electron's per-OS localization,
// which would never apply.
export const menu = {
  en: {
    // app menu
    about: 'About Plucker',
    checkForUpdates: 'Check for Updates…',
    services: 'Services',
    hide: 'Hide Plucker',
    hideOthers: 'Hide Others',
    unhide: 'Show All',
    quit: 'Quit Plucker',
    // File
    file: 'File',
    newDownload: 'New Download',
    openUrl: 'Open URL…',
    retransformSelection: 'Re-run Transforms on Selection',
    manageCache: 'Manage Cache…',
    settings: 'Settings…',
    // Edit
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    // View
    view: 'View',
    download: 'Download',
    history: 'History',
    reload: 'Reload',
    forceReload: 'Force Reload',
    toggleDevTools: 'Toggle Developer Tools',
    toggleConsole: 'Toggle Console',
    enterFullScreen: 'Enter Full Screen',
    // Window
    window: 'Window',
    minimize: 'Minimize',
    zoom: 'Zoom',
    bringAllToFront: 'Bring All to Front',
    // Help
    help: 'Help',
    viewReleases: 'View Releases'
  },
  de: {
    about: 'Über Plucker',
    checkForUpdates: 'Nach Updates suchen …',
    services: 'Dienste',
    hide: 'Plucker ausblenden',
    hideOthers: 'Andere ausblenden',
    unhide: 'Alle einblenden',
    quit: 'Plucker beenden',
    file: 'Datei',
    newDownload: 'Neuer Download',
    openUrl: 'URL öffnen …',
    retransformSelection: 'Transformationen für Auswahl erneut ausführen',
    manageCache: 'Cache verwalten …',
    settings: 'Einstellungen …',
    edit: 'Bearbeiten',
    undo: 'Widerrufen',
    redo: 'Wiederholen',
    cut: 'Ausschneiden',
    copy: 'Kopieren',
    paste: 'Einsetzen',
    selectAll: 'Alles auswählen',
    view: 'Darstellung',
    download: 'Download',
    history: 'Verlauf',
    reload: 'Neu laden',
    forceReload: 'Neu laden (erzwingen)',
    toggleDevTools: 'Entwicklerwerkzeuge ein-/ausblenden',
    toggleConsole: 'Konsole umschalten',
    enterFullScreen: 'Vollbild',
    // Window
    window: 'Fenster',
    minimize: 'Minimieren',
    zoom: 'Zoomen',
    bringAllToFront: 'Alle nach vorne bringen',
    // Help
    help: 'Hilfe',
    viewReleases: 'Releases ansehen'
  }
}

export type MenuLang = keyof typeof menu
export type MenuStrings = (typeof menu)['en']
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/shared/menu-strings.test.ts`
Expected: PASS (all 4).

- [ ] **Step 5: Commit**

```bash
git add src/shared/menu-strings.ts src/shared/menu-strings.test.ts
git commit -m "feat(menu): full i18n catalog for custom app menu, drop Go key"
```

---

### Task 2: Accelerators

**Files:**
- Modify: `src/shared/shortcuts.ts`

- [ ] **Step 1: Add the accelerators**

Replace the `ACCELERATORS` object in `src/shared/shortcuts.ts` with:

```ts
export const ACCELERATORS = {
  toggleConsole: 'CmdOrCtrl+J',
  newDownload: 'CmdOrCtrl+N',
  openUrl: 'CmdOrCtrl+Shift+N',
  retransform: 'CmdOrCtrl+Shift+R'
} as const
```

(Leave the surrounding doc comment and `AcceleratorName` export untouched.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no consumers break — additive change).

- [ ] **Step 3: Commit**

```bash
git add src/shared/shortcuts.ts
git commit -m "feat(menu): add accelerators for new download, open url, retransform"
```

---

### Task 3: Nav target + preload subscriptions

**Files:**
- Modify: `src/shared/types.ts:27`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Extend the nav target**

In `src/shared/types.ts` change line 27 to:

```ts
export type MenuNavTarget = 'download' | 'history' | 'settings' | 'cache'
```

- [ ] **Step 2: Add the two subscriptions**

In `src/preload/index.ts`, immediately after the `onMenuNavigate` block (ends at the line returning `removeListener('menu:navigate', fn)`), insert:

```ts
  // Application-menu commands that need a renderer hook (File ▸ New Download / Open URL…).
  onMenuNewDownload: (cb: () => void): (() => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('menu:new-download', fn)
    return () => ipcRenderer.removeListener('menu:new-download', fn)
  },
  onMenuOpenUrl: (cb: (url: string) => void): (() => void) => {
    const fn = (_: unknown, url: string): void => cb(url)
    ipcRenderer.on('menu:open-url', fn)
    return () => ipcRenderer.removeListener('menu:open-url', fn)
  },
```

(`PluckerApi` is `typeof api`, so the renderer type updates automatically.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/preload/index.ts
git commit -m "feat(menu): add cache nav target and new-download/open-url IPC bridges"
```

---

### Task 4: Rewrite `menu.ts` (pure builder + wrapper) with tests

**Files:**
- Rewrite: `src/main/menu.ts`
- Test: `src/main/menu.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/menu.test.ts`:

```ts
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
    retransform: vi.fn(),
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
    find(view, 'Download').click!({} as never, undefined, {} as never)
    expect(a.navigate).toHaveBeenCalledWith('download')
    const file = sub(find(t, 'File'))
    find(file, 'New Download').click!({} as never, undefined, {} as never)
    expect(a.newDownload).toHaveBeenCalled()
    find(file, 'Open URL…').click!({} as never, undefined, {} as never)
    expect(a.openUrl).toHaveBeenCalled()
    find(file, 'Manage Cache…').click!({} as never, undefined, {} as never)
    expect(a.navigate).toHaveBeenCalledWith('cache')
  })

  it('binds the documented accelerators (retransform on Shift+R, reload on R)', () => {
    const t = buildMenuTemplate(ctx(), actions())
    const file = sub(find(t, 'File'))
    expect(find(file, 'New Download').accelerator).toBe('CmdOrCtrl+N')
    expect(find(file, 'Re-run Transforms on Selection').accelerator).toBe('CmdOrCtrl+Shift+R')
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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/menu.test.ts`
Expected: FAIL — `buildMenuTemplate` / `MenuContext` / `MenuActions` not exported.

- [ ] **Step 3: Rewrite `menu.ts`**

Replace the entire contents of `src/main/menu.ts` with:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/menu.test.ts`
Expected: PASS (all 8).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/menu.ts src/main/menu.test.ts
git commit -m "feat(menu): replace built-in Electron menu with custom i18n template"
```

---

### Task 5: Renderer wiring — cache nav + New Download / Open URL

**Files:**
- Modify: `src/renderer/src/download-view.tsx`
- Modify: `src/renderer/src/app.tsx`
- Test: `src/renderer/src/download-view.test.tsx`

- [ ] **Step 1: Write the failing test**

Create (or extend) `src/renderer/src/download-view.test.tsx`. Minimal render harness for the `prefill` prop:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DownloadView } from './download-view'

const baseProps = {
  progress: null,
  statusLog: null,
  resolveLog: [],
  urlHistory: [],
  trackPaused: {},
  onRunningChange: () => {},
  onStart: () => {},
  onClear: () => {}
} as const

describe('DownloadView prefill', () => {
  it('fills the URL field when prefill changes', () => {
    const { rerender } = render(<DownloadView {...baseProps} />)
    rerender(<DownloadView {...baseProps} prefill={{ url: 'https://example.com/x', nonce: 1 }} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('https://example.com/x')
  })

  it('clears the URL field when prefill carries an empty url (New Download)', () => {
    const { rerender } = render(
      <DownloadView {...baseProps} prefill={{ url: 'https://seed', nonce: 1 }} />
    )
    rerender(<DownloadView {...baseProps} prefill={{ url: '', nonce: 2 }} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('')
  })
})
```

If the project lacks `@testing-library/react`, check `package.json` for the existing renderer test setup (other `*.test.tsx` files like `transport-deck.test.tsx` already render components — mirror their imports/setup exactly).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/src/download-view.test.tsx`
Expected: FAIL — `prefill` prop not accepted / field not filled.

- [ ] **Step 3: Add the `prefill` prop to `DownloadView`**

In `src/renderer/src/download-view.tsx`, add `prefill` to the destructured params and the props type. In the destructure list (after `redownloadRequest,`) add:

```tsx
  prefill,
```

In the props type object (after the `redownloadRequest?: …` line) add:

```tsx
  /** Set the URL field and focus it (File ▸ New Download clears with '', Open URL… prefills). */
  prefill?: { url: string; nonce: number } | null
```

Then, directly after the existing autofocus `useEffect` (the one that adds the `window` focus listener), add:

```tsx
  // React to File ▸ New Download / Open URL…: set the field and focus. `nonce` lets the
  // same URL (or repeated empty "New Download") retrigger.
  useEffect(() => {
    if (!prefill) return
    setUrl(prefill.url)
    setDismissed(true)
    inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce])
```

- [ ] **Step 4: Run the DownloadView test to verify it passes**

Run: `pnpm vitest run src/renderer/src/download-view.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 5: Wire `app.tsx` — cache nav target**

In `src/renderer/src/app.tsx`, replace the `onMenuNavigate` effect (currently at ~line 145-155) with:

```tsx
  useEffect(
    () =>
      window.plucker.onMenuNavigate((target) => {
        if (target === 'settings') {
          setCacheOpen(false)
          setSettingsOpen(true)
        } else if (target === 'cache') {
          setSettingsOpen(false)
          setCacheOpen(true)
        } else {
          setSettingsOpen(false)
          setCacheOpen(false)
          setView(target)
        }
      }),
    []
  )
```

- [ ] **Step 6: Wire `app.tsx` — New Download / Open URL subscriptions + prefill state**

Add a prefill state + nonce ref near the other `useState` hooks at the top of the component (after the `urlHistory` state ~line 21):

```tsx
  const [prefill, setPrefill] = useState<{ url: string; nonce: number } | null>(null)
  const prefillNonce = useRef(0)
```

(Ensure `useRef` is imported from `react` in this file; add it to the existing React import if missing.)

Add a new effect next to the other menu effects:

```tsx
  useEffect(() => {
    const toDownload = (url: string): void => {
      setSettingsOpen(false)
      setCacheOpen(false)
      setView('download')
      setPrefill({ url, nonce: ++prefillNonce.current })
    }
    const offNew = window.plucker.onMenuNewDownload(() => toDownload(''))
    const offOpen = window.plucker.onMenuOpenUrl((url) => toDownload(url))
    return () => {
      offNew()
      offOpen()
    }
  }, [])
```

- [ ] **Step 7: Wire `app.tsx` — pass `prefill` to `DownloadView`**

In the `<DownloadView … />` element (in the `view === 'download'` page, ~line 236), add the prop:

```tsx
            prefill={prefill}
```

- [ ] **Step 8: Run the full suite + typecheck**

Run: `pnpm typecheck && pnpm vitest run`
Expected: PASS. (Pre-existing unrelated failures from the in-progress console-undock work — `app.tsx` `onUndock`, `staging-list`, `retransform-source` modules — may exist independently of this change; confirm they predate Task 5 and are not introduced here.)

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/download-view.tsx src/renderer/src/download-view.test.tsx src/renderer/src/app.tsx
git commit -m "feat(menu): wire cache nav, New Download and Open URL into the renderer"
```

---

### Task 6: Manual verification

**Files:** none (run the app)

- [ ] **Step 1: Launch**

Run: `pnpm dev`

- [ ] **Step 2: Verify the menu bar**

Confirm top-level menus read `Plucker File Edit View Window Help` (no `Go`). Check:
- File ▸ New Download (⌘N) → jumps to Download view, empties + focuses the URL bar.
- Copy a URL, File ▸ Open URL… (⌘⇧N) → Download view, URL bar prefilled with the clipboard URL, focused.
- File ▸ Manage Cache… → opens the Cache overlay.
- View ▸ Download (⌘1) / History (⌘2) switch pages; Settings… (⌘,) opens Settings.
- View ▸ Toggle Console (⌘J) toggles the console; in a dev run the Reload/DevTools group is present.
- Window menu lists the open windows (and the floating console when undocked).
- Switch Settings language to Deutsch (or run with a German locale) → menu labels localize.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: PASS.

---

## Notes / accepted trade-offs

- **Full Screen label:** with a custom `label` on `role: 'togglefullscreen'`, macOS won't auto-swap the label to "Exit Full Screen" while fullscreen. Accepted — the action still toggles correctly.
- **i18n breadth:** labels are en/de only by design (`resolveLang` collapses to those two). Electron's built-in per-OS localization is intentionally bypassed.
- **Dev group gating** uses the same `developer.console` signal as the console toggle; if a dedicated dev-tools flag is added later, point `devToolsAvailable` at it.
