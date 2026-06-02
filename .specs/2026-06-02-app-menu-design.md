# Native Application Menu — Design

**Date:** 2026-06-02
**Status:** Approved (pending spec review)
**Area:** `src/main/menu.ts`, `src/shared/menu-strings.ts`, `src/shared/shortcuts.ts`, `src/shared/types.ts`, `src/preload/index.ts`, `src/renderer/src/app.tsx`

## Goal

Replace the current application menu with a fully custom, i18n-first template that
places every command where a conventional desktop app user expects it. Kill the
grab-bag **Go** menu; fold navigation into **View** and download/library actions into
**File**.

## What changes and why

Today `buildAppMenu` leans on Electron's aggregate role menus (`role: 'editMenu'`,
`'viewMenu'`, `'windowMenu'`, `role: 'help'`) and stuffs all app-specific commands —
Download, History, Re-run Transforms, Toggle Console, Settings — into a single custom
**Go** menu. That is non-standard placement and only partially under our control.

New approach: **define every top-level menu and every item ourselves.** Labels come
from our i18n catalog (`src/shared/menu-strings.ts`). Leaf actions that have a native
equivalent keep `role:` so macOS still provides correct behavior (edit semantics,
emoji/dictation, window management) — we own the label and placement, Electron just
executes the action.

### i18n scope note

`resolveLang()` collapses the OS/locale setting to exactly `'en'` or `'de'`. The app
has no third locale, so hardcoding en/de labels for *all* items — including standard
ones like Copy/Paste/Minimize — is consistent and gives full control. We knowingly
bypass Electron's built-in per-OS-locale menu localization because it would never
apply (the app is en/de only). Every label below is an i18n key.

## Menu structure (Structure A — conventional 6-menu)

`isMac` gates the **Plucker** app menu (macOS only). On Windows/Linux the app menu's
items are redistributed (Settings → File, About/Check for Updates → Help) per the
existing convention.

```
Plucker (macOS only)
  About Plucker                 role: 'about',    label: t.about
  Check for Updates…            click → checkForUpdates({silent:false})
  ──
  Settings…              ⌘,     click → navigate('settings')
  ──
  Services                      role: 'services',  label: t.services
  ──
  Hide Plucker           ⌘H     role: 'hide'
  Hide Others          ⌥⌘H      role: 'hideOthers'
  Show All                      role: 'unhide'
  ──
  Quit Plucker           ⌘Q     role: 'quit'

File
  New Download           ⌘N     click → send 'menu:new-download'
  Open URL…              ⇧⌘N     click → read clipboard, send 'menu:open-url' with text
  ──
  Re-run Transforms on Selection  ⇧⌘R   click → send 'menu:retransform-selection'
  ──
  Manage Cache…                 click → navigate('cache')
  ── (non-mac)
  Settings…              Ctrl+,  (non-mac only)        click → navigate('settings')

Edit
  Undo                   ⌘Z      role: 'undo'
  Redo                  ⇧⌘Z      role: 'redo'
  ──
  Cut                    ⌘X      role: 'cut'
  Copy                   ⌘C      role: 'copy'
  Paste                  ⌘V      role: 'paste'
  Select All             ⌘A      role: 'selectAll'

View
  Download               ⌘1      click → navigate('download')
  History                ⌘2      click → navigate('history')
  ──  (Developer group — only when developerTools available)
  Reload                 ⌘R      role: 'reload'
  Force Reload          (none)    role: 'forceReload'      (see accelerator note)
  Toggle Developer Tools ⌥⌘I     role: 'toggleDevTools'
  ──
  Toggle Console         ⌘J      click → send 'menu:toggle-console'   (when consoleAvailable)
  ──
  Enter Full Screen     ⌃⌘F      role: 'togglefullscreen'

Window
  Minimize               ⌘M      role: 'minimize'
  Zoom                           role: 'zoom'
  ──
  Bring All to Front             role: 'front'    (macOS)
  ──
  { role: 'window' }             → Electron appends live window list (main + console)

Help
  View Releases                  click → shell.openExternal(RELEASES_URL)
  ── (non-mac)
  Check for Updates…    (non-mac only)   click → checkForUpdates({silent:false})
```

### Accelerator notes / conflicts

- **Reload `⌘R`** is standard; **Re-run Transforms `⇧⌘R`** uses Shift to avoid the
  clash. `Force Reload` conventionally is `⇧⌘R` too — to avoid colliding with Re-run
  Transforms, Force Reload gets **no accelerator** (it stays available as a menu click
  in the dev group). Re-run Transforms keeps `⇧⌘R` because it is the app-specific
  command users will actually reach for.
- Reload / Force Reload / Toggle Developer Tools are **gated behind developer-tools
  availability** (`!app.isPackaged || loadSettings().developer.console`, the same
  signal as the console). Rationale: a stray `⌘R` mid-download in a packaged build
  would wipe renderer state. Hiding the whole group in production removes that footgun
  while keeping it for development.
- Toggle Console keeps today's `consoleAvailable` gate and `ACCELERATORS.toggleConsole`.

## New commands & IPC

Two brand-new commands need a renderer hook. Both reuse the existing `menu:*` →
`webContents.send` pattern and a preload `onMenu…` subscription.

| Command | Channel | Main behavior | Renderer behavior |
|---|---|---|---|
| New Download | `menu:new-download` | `send` only | switch to Download view, clear + focus URL input |
| Open URL… | `menu:open-url` (payload: clipboard string) | `clipboard.readText()`, send text | switch to Download view, prefill URL field with text, focus |

`Manage Cache…` reuses the existing navigation channel by extending the nav target.

### Type / preload changes

- `src/shared/types.ts`: `MenuNavTarget = 'download' | 'history' | 'settings' | 'cache'`.
- `src/preload/index.ts`: add `onMenuNewDownload(cb)` and
  `onMenuOpenUrl(cb: (url: string) => void)` subscriptions, mirroring the existing
  `onMenuRetransformSelection` / `onMenuNavigate` shape (returns an unsubscribe fn).

### Renderer (`app.tsx`) changes

- Extend the `onMenuNavigate` handler to treat `'cache'` → `setCacheOpen(true)`
  (and close other overlays), mirroring the `'settings'` branch.
- Subscribe to `onMenuNewDownload`: `setView('download')`, close overlays, clear the
  URL input, focus it. Requires a focus/clear handle on the Download view's URL field
  (lift a small imperative `ref` or a `focusUrlInput`/`resetUrl` callback into
  `DownloadView`).
- Subscribe to `onMenuOpenUrl(url)`: same as New Download but **prefill** the field
  with `url` instead of clearing.

The Download view already owns the URL input and `urlHistory`; expose a minimal
imperative handle (ref) rather than threading new props through every layer.

## i18n keys (`src/shared/menu-strings.ts`)

Add keys (en + de) for every custom label and the standard role-item labels we now
own. Drop the obsolete `go` key. New/changed keys:

```
menuTitles:  file, edit, view, window, help          (+ existing app handled by app.name)
app:         about, services, hide, hideOthers, unhide, quit, checkForUpdates*
file:        newDownload, openUrl, retransformSelection*, manageCache, settings*
edit:        undo, redo, cut, copy, paste, selectAll
view:        download*, history*, reload, forceReload, toggleDevTools, toggleConsole*, enterFullScreen
window:      minimize, zoom, bringAllToFront
help:        viewReleases*
```

`*` = key already exists (keep). `go`, and any keys no longer referenced, are removed.
`MenuLang` export is unchanged. The renderer i18n catalog already merges these under
`menu` — verify the merge still type-checks after key churn.

## `shortcuts.ts`

Add accelerators that the UI also displays as hints (keep the single source of truth):

```
ACCELERATORS = {
  toggleConsole: 'CmdOrCtrl+J',   // existing
  newDownload:   'CmdOrCtrl+N',
  openUrl:       'CmdOrCtrl+Shift+N',
  retransform:   'CmdOrCtrl+Shift+R',
}
```

Pure-native accelerators that the renderer never displays (Reload, DevTools, fullscreen,
edit roles) stay inline in `menu.ts` via their `role` defaults; only shortcuts the UI
might surface go in `ACCELERATORS`.

## Module shape (`menu.ts`)

`buildAppMenu(getWindow)` stays the single entry point. Internally, extract one small
builder per top-level menu (`appMenu()`, `fileMenu()`, `editMenu()`, `viewMenu()`,
`windowMenu()`, `helpMenu()`) returning `MenuItemConstructorOptions`, then assemble the
template. This keeps each menu independently readable and testable and avoids one long
template literal. `resolveLang()` and the `navigate()` helper are unchanged.

## Testing

`src/main/menu.test.ts` (new):

- Builds the template for `en` and `de`, `isMac` true/false (inject platform), and
  asserts:
  - No top-level menu labelled `Go` / `Gehe zu`.
  - Top-level order: `[app?] File Edit View Window Help`.
  - Each navigation/command item carries the right `accelerator` and dispatches the
    right `menu:*` channel / `navigate` target (spy on a fake `getWindow().webContents.send`).
  - Developer group (Reload/ForceReload/DevTools) is **absent** when
    `isPackaged && !developer.console`, **present** otherwise.
  - Window submenu contains a `{ role: 'window' }` item (auto window list).
  - `Re-run Transforms` uses `⇧⌘R`, not `⌘R`; Reload uses `⌘R`.
- Mock `electron` (`app`, `Menu`, `shell`, `clipboard`), `./settings`, `./updater`
  following the existing main-process test conventions.

`src/shared/menu-strings.test.ts` (new or extend): every key present in both `en` and
`de`; no key references removed; `de` has no English fallthrough for the new keys.

## Out of scope

- A custom in-window HTML menu bar (macOS forbids it; we stay on the native `Menu` API).
- Removing `role:` from leaf items (explicitly decided against — roles give correct
  native behavior).
- Locales beyond en/de.
- Tray menu / dock menu (unchanged).
