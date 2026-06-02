# Context-menu abstraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native (Electron `Menu.popup`) context-menu abstraction and wire right-click menus into track rows, history cards, the cache view, the console drawer, and text inputs.

**Architecture:** One IPC channel (`menu:popup`) carries a serializable menu *descriptor* from renderer to main; main builds a native menu, pops it at the cursor, and resolves the invoke with the clicked item's id (or `null`). The renderer keeps the `onClick` closures and dispatches the one matching the returned id — handlers never cross IPC. Labels are localized in the renderer; role items (Cut/Copy/Paste) are handled natively.

**Tech Stack:** Electron (`Menu`, `clipboard`, `ipcMain`/`ipcRenderer`), React 19 + TypeScript, i18next, Vitest, pnpm.

**Spec:** `.specs/2026-06-02-context-menu-design.md`

**Conventions reminder:** use **pnpm**; commit with **Conventional Commits**; work on the current branch (no new branches).

---

## Task 1: Shared descriptor types + main `buildMenuTemplate`

**Files:**
- Create: `src/shared/context-menu.ts`
- Create: `src/main/context-menu.ts`
- Test: `src/main/context-menu.test.ts`

- [ ] **Step 1: Create the shared descriptor types**

`src/shared/context-menu.ts`:

```ts
// Serializable description of a native context menu. The renderer builds this from
// its menu items (stripping the onClick closures) and sends it to the main process
// over the `menu:popup` IPC channel; main turns it back into an Electron menu.
export type MenuRole = 'copy' | 'cut' | 'paste' | 'selectAll' | 'undo' | 'redo'

export interface MenuItemDescriptor {
  /** Present on clickable custom items; absent on separators and role items. */
  id?: string
  label?: string
  type?: 'normal' | 'separator'
  /** Built-in editing action handled natively by Electron (no id needed). */
  role?: MenuRole
  enabled?: boolean
  accelerator?: string
}

export type MenuDescriptor = MenuItemDescriptor[]
```

- [ ] **Step 2: Write the failing test for `buildMenuTemplate`**

`src/main/context-menu.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { buildMenuTemplate } from './context-menu'
import type { MenuDescriptor } from '../shared/context-menu'

describe('buildMenuTemplate', () => {
  it('maps a clickable item to a click handler that calls onClick with its id', () => {
    const onClick = vi.fn()
    const descriptor: MenuDescriptor = [{ id: 'a', label: 'Reveal', enabled: true }]
    const template = buildMenuTemplate(descriptor, onClick)
    expect(template[0].label).toBe('Reveal')
    expect(template[0].enabled).toBe(true)
    template[0].click?.({} as never, undefined, {} as never)
    expect(onClick).toHaveBeenCalledWith('a')
  })

  it('passes separators and roles through without a click handler', () => {
    const onClick = vi.fn()
    const descriptor: MenuDescriptor = [
      { type: 'separator' },
      { role: 'copy', label: 'Copy' }
    ]
    const template = buildMenuTemplate(descriptor, onClick)
    expect(template[0]).toEqual({ type: 'separator' })
    expect(template[1].role).toBe('copy')
    expect(template[1].click).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run src/main/context-menu.test.ts`
Expected: FAIL — `buildMenuTemplate` is not exported / module missing.

- [ ] **Step 4: Implement `buildMenuTemplate` and `registerContextMenuIpc`**

`src/main/context-menu.ts`:

```ts
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
```

Note: `GetWindow` is already exported from `src/main/updater.ts` (`() => BrowserWindow | null`); `menu.ts` imports it the same way.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/main/context-menu.test.ts`
Expected: PASS (both cases).

- [ ] **Step 6: Commit**

```bash
git add src/shared/context-menu.ts src/main/context-menu.ts src/main/context-menu.test.ts
git commit -m "feat(menu): add native context-menu IPC service"
```

---

## Task 2: Wire the IPC into the main process

**Files:**
- Modify: `src/main/index.ts` (import near line 26; call near line 323)

- [ ] **Step 1: Import the registrar**

In `src/main/index.ts`, next to the updater import (around line 26):

```ts
import { registerContextMenuIpc } from './context-menu'
```

- [ ] **Step 2: Register it during app setup**

In `app.whenReady().then(...)`, right after `registerUpdaterIpc(() => mainWindow)` (around line 324):

```ts
  registerContextMenuIpc(() => mainWindow)
```

- [ ] **Step 3: Typecheck the main project**

Run: `pnpm typecheck:node`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(menu): register context-menu IPC on app start"
```

---

## Task 3: Expose `popupMenu` + `copyText` in preload

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Import the descriptor type**

At the top of `src/preload/index.ts`, add to the shared-types import block:

```ts
import type { MenuDescriptor } from '../shared/context-menu'
```

- [ ] **Step 2: Add the two API methods**

Inside the `api` object (place after `openExternal`, near line 46):

```ts
  // Native context menu: send a serializable descriptor, resolve with the clicked
  // item id (or null on dismiss). Clipboard write backs "Copy …" menu items.
  popupMenu: (descriptor: MenuDescriptor): Promise<string | null> =>
    ipcRenderer.invoke('menu:popup', descriptor),
  copyText: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:write', text),
```

`PluckerApi` is `typeof api`, so the renderer types update automatically — no change to `index.d.ts`.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck:node`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(menu): expose popupMenu and copyText to the renderer"
```

---

## Task 4: Renderer `showContextMenu` helper + serializer

**Files:**
- Create: `src/renderer/src/ui/context-menu.ts`
- Test: `src/renderer/src/ui/context-menu.test.ts`

- [ ] **Step 1: Write the failing test**

`src/renderer/src/ui/context-menu.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { serializeMenu, showContextMenu, type MenuItem } from './context-menu'

describe('serializeMenu', () => {
  it('assigns ids to clickable items and strips the onClick closure', () => {
    const onClick = vi.fn()
    const { descriptor, handlers } = serializeMenu([{ label: 'Reveal', onClick }])
    expect(descriptor[0].label).toBe('Reveal')
    expect(descriptor[0].id).toBeTruthy()
    expect('onClick' in descriptor[0]).toBe(false)
    handlers.get(descriptor[0].id!)?.()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('preserves separators and role items without ids', () => {
    const { descriptor, handlers } = serializeMenu([
      { type: 'separator' },
      { label: 'Copy', role: 'copy' }
    ])
    expect(descriptor[0]).toEqual({ type: 'separator' })
    expect(descriptor[1].role).toBe('copy')
    expect(descriptor[1].id).toBeUndefined()
    expect(handlers.size).toBe(0)
  })

  it('keeps the enabled flag', () => {
    const { descriptor } = serializeMenu([{ label: 'Delete', enabled: false, onClick: vi.fn() }])
    expect(descriptor[0].enabled).toBe(false)
  })
})

describe('showContextMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('dispatches the handler for the id main returns', async () => {
    const onClick = vi.fn()
    const popupMenu = vi.fn().mockResolvedValue('item-0')
    vi.stubGlobal('window', { plucker: { popupMenu } } as never)
    await showContextMenu([{ label: 'Reveal', onClick }] as MenuItem[])
    expect(popupMenu).toHaveBeenCalledOnce()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('runs no handler when main returns null (dismissed)', async () => {
    const onClick = vi.fn()
    vi.stubGlobal('window', { plucker: { popupMenu: vi.fn().mockResolvedValue(null) } } as never)
    await showContextMenu([{ label: 'Reveal', onClick }] as MenuItem[])
    expect(onClick).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/renderer/src/ui/context-menu.test.ts`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Implement the helper**

`src/renderer/src/ui/context-menu.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/renderer/src/ui/context-menu.test.ts`
Expected: PASS (all five cases).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/ui/context-menu.ts src/renderer/src/ui/context-menu.test.ts
git commit -m "feat(menu): add renderer showContextMenu helper"
```

---

## Task 5: Add `context.*` i18n strings (en + de)

**Files:**
- Modify: `src/renderer/src/i18n/locales/en.ts`
- Modify: `src/renderer/src/i18n/locales/de.ts`

The catalog is typed; the `de` object must have the same shape as `en` or
`typecheck:web` fails. Reuse a platform-neutral "Reveal in folder" to match the
existing `actions.reveal` wording.

- [ ] **Step 1: Add the `context` block to `en.ts`**

Insert after the `actions: { … },` block (around line 18):

```ts
  context: {
    reveal: 'Reveal in folder',
    copyTitle: 'Copy title',
    copyUrl: 'Copy YouTube URL',
    openYouTube: 'Open on YouTube',
    redownload: 'Re-download',
    editTags: 'Edit tags',
    deleteFile: 'Delete file',
    copyError: 'Copy error code',
    openFolder: 'Open folder',
    redownloadAll: 'Re-download all',
    copyPlaylistUrl: 'Copy playlist URL',
    deleteEntry: 'Delete entry',
    clearCache: 'Clear cache',
    copyLine: 'Copy line',
    copyAll: 'Copy all',
    revealLog: 'Reveal log file'
  },
```

- [ ] **Step 2: Add the matching `context` block to `de.ts`**

Insert after the `actions` block in `de.ts`:

```ts
  context: {
    reveal: 'Im Ordner anzeigen',
    copyTitle: 'Titel kopieren',
    copyUrl: 'YouTube-URL kopieren',
    openYouTube: 'Auf YouTube öffnen',
    redownload: 'Erneut herunterladen',
    editTags: 'Tags bearbeiten',
    deleteFile: 'Datei löschen',
    copyError: 'Fehlercode kopieren',
    openFolder: 'Ordner öffnen',
    redownloadAll: 'Alle erneut herunterladen',
    copyPlaylistUrl: 'Playlist-URL kopieren',
    deleteEntry: 'Eintrag löschen',
    clearCache: 'Cache leeren',
    copyLine: 'Zeile kopieren',
    copyAll: 'Alles kopieren',
    revealLog: 'Protokolldatei anzeigen'
  },
```

- [ ] **Step 3: Typecheck the web project + run i18n tests**

Run: `pnpm typecheck:web && pnpm vitest run src/renderer/src/i18n/i18n.test.ts`
Expected: PASS — both locales share the same shape.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/i18n/locales/en.ts src/renderer/src/i18n/locales/de.ts
git commit -m "feat(menu): add context-menu i18n strings (en/de)"
```

---

## Task 6: Track-row menu factory + `onContextMenu` prop

**Files:**
- Create: `src/renderer/src/track-row-menu.ts`
- Test: `src/renderer/src/track-row-menu.test.ts`
- Modify: `src/renderer/src/track-row.tsx`

The factory is a pure function so it can be tested without rendering. `TrackRow`
gains an optional `onContextMenu` prop that parent views supply (the views own the
delete / re-download / edit logic).

- [ ] **Step 1: Write the failing test for the factory**

`src/renderer/src/track-row-menu.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { trackRowMenuItems } from './track-row-menu'

const t = ((k: string) => k) as never

describe('trackRowMenuItems', () => {
  it('disables Reveal and Delete when the file is missing', () => {
    const items = trackRowMenuItems({
      t,
      variant: 'history',
      track: { title: 'Song', file: '/a.mp3', videoId: 'abc' },
      missing: true,
      failed: false,
      onReveal: vi.fn(),
      onDelete: vi.fn()
    })
    const reveal = items.find((i) => i.label === 'context.reveal')
    const del = items.find((i) => i.label === 'context.deleteFile')
    expect(reveal?.enabled).toBe(false)
    expect(del?.enabled).toBe(false)
  })

  it('omits YouTube items when there is no videoId', () => {
    const items = trackRowMenuItems({
      t,
      variant: 'download',
      track: { title: 'Song' },
      missing: false,
      failed: false,
      onReveal: vi.fn()
    })
    expect(items.some((i) => i.label === 'context.copyUrl')).toBe(false)
    expect(items.some((i) => i.label === 'context.openYouTube')).toBe(false)
  })

  it('adds Copy error code only for failed rows with an error', () => {
    const items = trackRowMenuItems({
      t,
      variant: 'download',
      track: { title: 'Song', errorCode: 'E1' },
      missing: false,
      failed: true,
      onReveal: vi.fn()
    })
    expect(items.some((i) => i.label === 'context.copyError')).toBe(true)
  })

  it('includes Re-download for the history variant and Edit tags for cache', () => {
    const history = trackRowMenuItems({
      t,
      variant: 'history',
      track: { title: 'S' },
      missing: false,
      failed: false,
      onReveal: vi.fn(),
      onRedownload: vi.fn()
    })
    const cache = trackRowMenuItems({
      t,
      variant: 'cache',
      track: { title: 'S' },
      missing: false,
      failed: false,
      onReveal: vi.fn(),
      onEditTags: vi.fn()
    })
    expect(history.some((i) => i.label === 'context.redownload')).toBe(true)
    expect(cache.some((i) => i.label === 'context.editTags')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/renderer/src/track-row-menu.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the factory**

`src/renderer/src/track-row-menu.ts`:

```ts
// Builds the context-menu items for a TrackRow. Pure function (no rendering) so the
// item set / enabled states are unit-testable. Action closures (reveal, delete,
// re-download, edit tags) are supplied by the parent view that owns that logic.
import type { TFunction } from 'i18next'
import type { MenuItem } from './ui/context-menu'

const watchUrl = (videoId: string): string => `https://www.youtube.com/watch?v=${videoId}`

export interface TrackMenuTrack {
  title: string
  file?: string
  videoId?: string
  errorCode?: string
  reason?: string
}

export function trackRowMenuItems(opts: {
  t: TFunction
  variant: 'download' | 'history' | 'cache'
  track: TrackMenuTrack
  missing: boolean
  failed: boolean
  onReveal: () => void
  onRedownload?: () => void
  onEditTags?: () => void
  onDelete?: () => void
}): MenuItem[] {
  const { t, variant, track, missing, failed } = opts
  const hasFile = !!track.file && !missing
  const items: MenuItem[] = [
    { label: t('context.reveal'), enabled: hasFile, onClick: opts.onReveal },
    { label: t('context.copyTitle'), onClick: () => void window.plucker.copyText(track.title) }
  ]

  if (track.videoId) {
    const url = watchUrl(track.videoId)
    items.push(
      { label: t('context.copyUrl'), onClick: () => void window.plucker.copyText(url) },
      { label: t('context.openYouTube'), onClick: () => void window.plucker.openExternal(url) }
    )
  }

  if (variant === 'history' && opts.onRedownload) {
    items.push({ type: 'separator' }, { label: t('context.redownload'), onClick: opts.onRedownload })
  }
  if (variant === 'cache' && opts.onEditTags) {
    items.push({ type: 'separator' }, { label: t('context.editTags'), onClick: opts.onEditTags })
  }

  if (failed && (track.errorCode || track.reason)) {
    items.push(
      { type: 'separator' },
      {
        label: t('context.copyError'),
        onClick: () => void window.plucker.copyText(track.errorCode ?? track.reason ?? '')
      }
    )
  }

  if (opts.onDelete) {
    items.push(
      { type: 'separator' },
      { label: t('context.deleteFile'), enabled: hasFile, onClick: opts.onDelete }
    )
  }

  return items
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/renderer/src/track-row-menu.test.ts`
Expected: PASS (four cases).

- [ ] **Step 5: Add the `onContextMenu` prop to `TrackRow`**

In `src/renderer/src/track-row.tsx`, add to the component's prop list (after `onCancelEdit?`):

```ts
  /** Native right-click handler for the row (built by the parent view). */
  onContextMenu?: (e: React.MouseEvent) => void
```

Destructure it in the function signature (add `onContextMenu` to the params), and
attach it to the row container — the `<div className="group flex h-12 ...">`:

```tsx
      <div className="group flex h-12 items-center gap-3 pl-1.5 pr-4" onContextMenu={onContextMenu}>
```

- [ ] **Step 6: Typecheck + run the track-row tests**

Run: `pnpm typecheck:web && pnpm vitest run src/renderer/src/track-row.test.tsx`
Expected: PASS (the new optional prop is backward-compatible).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/track-row-menu.ts src/renderer/src/track-row-menu.test.ts src/renderer/src/track-row.tsx
git commit -m "feat(menu): add track-row context-menu factory and prop"
```

---

## Task 7: Wire track context menus in the three views

**Files:**
- Modify: `src/renderer/src/download-view.tsx`
- Modify: `src/renderer/src/history-view.tsx`
- Modify: `src/renderer/src/cache-view.tsx`

Each view builds an `onContextMenu` per row from `trackRowMenuItems` + `showContextMenu`.

- [ ] **Step 1: Download view — reveal/copy/YouTube only**

In `src/renderer/src/download-view.tsx`, add imports:

```ts
import { showContextMenu } from './ui/context-menu'
import { trackRowMenuItems } from './track-row-menu'
```

Where the view maps `progress.tracks` to `<TrackRow … />`, add the handler (the
download variant has no delete / re-download — only reveal/copy/YouTube):

```tsx
            onContextMenu={(e) => {
              e.preventDefault()
              void showContextMenu(
                trackRowMenuItems({
                  t,
                  variant: 'download',
                  track: tk,
                  missing: false,
                  failed: tk.status === 'failed',
                  onReveal: () => tk.file && window.plucker.revealFile(tk.file)
                })
              )
            }}
```

(Use whatever the map's track variable is named — match the existing `.map` callback parameter; `tk` here is illustrative.)

- [ ] **Step 2: History view — full menu with re-download + delete**

In `src/renderer/src/history-view.tsx`, add the same two imports. The view already
has `redownload(url, folder)`, `deleteTrack(id, index)`, and the `missing` set. In
the per-track `<TrackRow … />` (inside `entry.tracks.map((tk, i) => …)`), add:

```tsx
                  onContextMenu={(e) => {
                    e.preventDefault()
                    void showContextMenu(
                      trackRowMenuItems({
                        t,
                        variant: 'history',
                        track: tk,
                        missing: tk.file ? missing.has(tk.file) : true,
                        failed: tk.status === 'failed',
                        onReveal: () => tk.file && window.plucker.revealFile(tk.file),
                        onRedownload: () =>
                          tk.videoId && redownload(watchUrl(tk.videoId), entry.folder),
                        onDelete: () => deleteTrack(entry.id, i)
                      })
                    )
                  }}
```

`watchUrl` already exists in this file.

- [ ] **Step 3: Cache view — reveal/copy/edit/delete**

In `src/renderer/src/cache-view.tsx`, add the same two imports. The view has
`remove(hash)`, `setEditing`, and items with `file`/`videoId`/`title`. On the cache
`<TrackRow … />` add:

```tsx
                  onContextMenu={(e) => {
                    e.preventDefault()
                    void showContextMenu(
                      trackRowMenuItems({
                        t,
                        variant: 'cache',
                        track: { title: it.title, file: it.file, videoId: it.videoId },
                        missing: false,
                        failed: false,
                        onReveal: () => it.file && window.plucker.revealFile(it.file),
                        onEditTags: () => setEditing(it.hash),
                        onDelete: () => remove(it.hash)
                      })
                    )
                  }}
```

(Match the actual field names on the cache item — `it` is illustrative; confirm
`title`/`file`/`videoId`/`hash` against `CachedTrack` in `src/shared/types.ts`.)

- [ ] **Step 4: Typecheck + run the view tests**

Run: `pnpm typecheck:web && pnpm vitest run src/renderer/src/transport-deck.test.tsx src/renderer/src/track-row.test.tsx`
Expected: PASS. Then `pnpm lint` to catch unused vars.
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/download-view.tsx src/renderer/src/history-view.tsx src/renderer/src/cache-view.tsx
git commit -m "feat(menu): add right-click menus to track rows in all views"
```

---

## Task 8: History-card menu factory + wiring

**Files:**
- Create: `src/renderer/src/history-card-menu.ts`
- Test: `src/renderer/src/history-card-menu.test.ts`
- Modify: `src/renderer/src/history-view.tsx`

- [ ] **Step 1: Write the failing test**

`src/renderer/src/history-card-menu.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { historyCardMenuItems } from './history-card-menu'

const t = ((k: string) => k) as never

describe('historyCardMenuItems', () => {
  it('produces open/redownload/copy/delete items', () => {
    const items = historyCardMenuItems({
      t,
      url: 'https://list',
      onOpenFolder: vi.fn(),
      onRedownload: vi.fn(),
      onDelete: vi.fn()
    })
    const labels = items.filter((i) => i.type !== 'separator').map((i) => i.label)
    expect(labels).toEqual([
      'context.openFolder',
      'context.redownloadAll',
      'context.copyPlaylistUrl',
      'context.deleteEntry'
    ])
  })

  it('omits Copy playlist URL when there is no url', () => {
    const items = historyCardMenuItems({
      t,
      url: '',
      onOpenFolder: vi.fn(),
      onRedownload: vi.fn(),
      onDelete: vi.fn()
    })
    expect(items.some((i) => i.label === 'context.copyPlaylistUrl')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/renderer/src/history-card-menu.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the factory**

`src/renderer/src/history-card-menu.ts`:

```ts
// Context-menu items for a history playlist card (the entry header).
import type { TFunction } from 'i18next'
import type { MenuItem } from './ui/context-menu'

export function historyCardMenuItems(opts: {
  t: TFunction
  url: string
  onOpenFolder: () => void
  onRedownload: () => void
  onDelete: () => void
}): MenuItem[] {
  const { t, url } = opts
  const items: MenuItem[] = [
    { label: t('context.openFolder'), onClick: opts.onOpenFolder },
    { label: t('context.redownloadAll'), onClick: opts.onRedownload }
  ]
  if (url) {
    items.push({ label: t('context.copyPlaylistUrl'), onClick: () => void window.plucker.copyText(url) })
  }
  items.push({ type: 'separator' }, { label: t('context.deleteEntry'), onClick: opts.onDelete })
  return items
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/renderer/src/history-card-menu.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into the card header**

In `src/renderer/src/history-view.tsx`, add the import:

```ts
import { historyCardMenuItems } from './history-card-menu'
```

On the card header container (`<div className="flex items-center gap-3 border-b border-line bg-panel …">`), add:

```tsx
              onContextMenu={(e) => {
                e.preventDefault()
                void showContextMenu(
                  historyCardMenuItems({
                    t,
                    url: entry.url,
                    onOpenFolder: () => window.plucker.openFolder(entry.folder),
                    onRedownload: () => redownload(entry.url, entry.folder),
                    onDelete: () => deleteEntry(entry.id)
                  })
                )
              }}
```

`showContextMenu` is already imported from Task 7. `deleteEntry` already exists.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm typecheck:web && pnpm vitest run src/renderer/src/history-card-menu.test.ts`
Expected: PASS.

```bash
git add src/renderer/src/history-card-menu.ts src/renderer/src/history-card-menu.test.ts src/renderer/src/history-view.tsx
git commit -m "feat(menu): add right-click menu to history cards"
```

---

## Task 9: Cache empty-space + console-line menus

**Files:**
- Create: `src/renderer/src/console-line-menu.ts`
- Test: `src/renderer/src/console-line-menu.test.ts`
- Modify: `src/renderer/src/cache-view.tsx`
- Modify: `src/renderer/src/console-drawer.tsx`

- [ ] **Step 1: Write the failing test for the console-line factory**

`src/renderer/src/console-line-menu.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { consoleLineMenuItems } from './console-line-menu'

const t = ((k: string) => k) as never

describe('consoleLineMenuItems', () => {
  it('copies the given line, copies all, and reveals the log', () => {
    const copy = vi.fn()
    vi.stubGlobal('window', { plucker: { copyText: copy, revealLog: vi.fn() } } as never)
    const items = consoleLineMenuItems({ t, line: 'one line', allText: 'all\nlines' })
    const labels = items.filter((i) => i.type !== 'separator').map((i) => i.label)
    expect(labels).toEqual(['context.copyLine', 'context.copyAll', 'context.revealLog'])
    items.find((i) => i.label === 'context.copyLine')?.onClick?.()
    expect(copy).toHaveBeenCalledWith('one line')
    vi.restoreAllMocks()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/renderer/src/console-line-menu.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the console-line factory**

`src/renderer/src/console-line-menu.ts`:

```ts
// Context-menu items for a single console log line in the developer drawer.
import type { TFunction } from 'i18next'
import type { MenuItem } from './ui/context-menu'

export function consoleLineMenuItems(opts: {
  t: TFunction
  line: string
  allText: string
}): MenuItem[] {
  const { t, line, allText } = opts
  return [
    { label: t('context.copyLine'), onClick: () => void window.plucker.copyText(line) },
    { label: t('context.copyAll'), onClick: () => void window.plucker.copyText(allText) },
    { type: 'separator' },
    { label: t('context.revealLog'), onClick: () => void window.plucker.revealLog() }
  ]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/renderer/src/console-line-menu.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the console-line menu**

In `src/renderer/src/console-drawer.tsx`, add imports:

```ts
import { showContextMenu } from './ui/context-menu'
import { consoleLineMenuItems } from './console-line-menu'
```

The drawer already builds the "copy all" string in `copyVisible` as:
`filtered.map((e) => \`${formatTime(e.time)} [${e.level}] [${e.scope}] ${e.message}\`).join('\n')`.
Extract that into a `const allText = filtered.map(…).join('\n')` near the lines
render, and on each rendered log line (`filtered.map((e, i) => ( <div …> ))`), add:

```tsx
              onContextMenu={(ev) => {
                ev.preventDefault()
                const line = `${formatTime(e.time)} [${e.level}] [${e.scope}] ${e.message}`
                void showContextMenu(consoleLineMenuItems({ t, line, allText }))
              }}
```

- [ ] **Step 6: Add the cache "Clear cache" empty-space menu**

In `src/renderer/src/cache-view.tsx`, on the scroll/list container element, add an
`onContextMenu` that only fires for clicks on empty space (not a row, which already
`preventDefault`s its own menu):

```tsx
            onContextMenu={(e) => {
              if (e.defaultPrevented) return
              e.preventDefault()
              void showContextMenu([
                { label: t('context.clearCache'), enabled: items.length > 0, onClick: clearAll }
              ])
            }}
```

`clearAll` and `items` already exist in this view; `showContextMenu` was imported in Task 7.

- [ ] **Step 7: Typecheck, test, lint**

Run: `pnpm typecheck:web && pnpm vitest run src/renderer/src/console-line-menu.test.ts && pnpm lint`
Expected: PASS / clean.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/console-line-menu.ts src/renderer/src/console-line-menu.test.ts src/renderer/src/console-drawer.tsx src/renderer/src/cache-view.tsx
git commit -m "feat(menu): add console-line and cache clear context menus"
```

---

## Task 10: Text-input Edit menu fallback + final verification

**Files:**
- Modify: `src/renderer/src/app.tsx`

A single root-level `onContextMenu` provides Cut/Copy/Paste/Select All for text
inputs and selected text, using **role** items (OS-localized, no new strings). It
only fires when a surface menu has not already handled the event
(`e.defaultPrevented`).

- [ ] **Step 1: Add the fallback to the app root**

In `src/renderer/src/app.tsx`, add imports:

```ts
import { showContextMenu, type MenuItem } from './ui/context-menu'
```

Attach to the outermost container (`<div className="flex h-screen flex-col bg-surface text-ink">`):

```tsx
    <div
      className="flex h-screen flex-col bg-surface text-ink"
      onContextMenu={(e) => {
        if (e.defaultPrevented) return
        const target = e.target as HTMLElement
        const editable =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        const hasSelection = !!window.getSelection()?.toString()
        if (!editable && !hasSelection) return
        e.preventDefault()
        const items: MenuItem[] = editable
          ? [
              { role: 'cut' },
              { role: 'copy' },
              { role: 'paste' },
              { type: 'separator' },
              { role: 'selectAll' }
            ]
          : [{ role: 'copy' }]
        void showContextMenu(items)
      }}
    >
```

Role items need no labels (Electron supplies localized ones).

- [ ] **Step 2: Full verification suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all PASS / clean.

- [ ] **Step 3: Build to confirm main + renderer bundle**

Run: `pnpm build`
Expected: completes without errors (icon build + typecheck + electron-vite build).

- [ ] **Step 4: Manual smoke test (electron-vite dev)**

Run: `pnpm dev`
Verify by right-clicking:
- a track row in Download / History / Cache → reveal/copy/YouTube (+ delete/edit/re-download per variant);
- a history card → open folder / re-download all / copy URL / delete;
- empty space in Cache → Clear cache;
- a console log line → copy line / copy all / reveal log;
- the URL field and search box → Cut/Copy/Paste/Select All.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/app.tsx
git commit -m "feat(menu): add native Cut/Copy/Paste menu for text inputs"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** mechanism (Tasks 1–4), per-surface menus (Tasks 6–9), text-input Edit menu (Task 10), clipboard-via-main (`copyText`, Task 3), `context.*` i18n (Task 5), logging (`scope: 'menu'` in Task 1 — popup/click/dismiss/clipboard-length/error), testing (factory + serializer + template tests throughout). All spec sections are covered.
- **Type consistency:** `MenuItem` (renderer) / `MenuItemDescriptor` (shared) are used consistently; `serializeMenu`/`showContextMenu`/`buildMenuTemplate`/`registerContextMenuIpc`/`popupMenu`/`copyText`/`trackRowMenuItems`/`historyCardMenuItems`/`consoleLineMenuItems` names are stable across tasks.
- **Illustrative variable names:** in Tasks 7 & 9 the map-callback variable names (`tk`, `it`, `e`) and exact container elements must be matched to the actual code in each view; the field names on cache items must be confirmed against `CachedTrack` in `src/shared/types.ts`.
