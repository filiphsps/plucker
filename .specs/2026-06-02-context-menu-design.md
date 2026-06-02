# Context-menu abstraction — design

**Date:** 2026-06-02
**Status:** Approved, ready for implementation plan

## Problem

Plucker exposes per-item actions only as hover buttons and a left-click that
reveals a file. There is no right-click context menu anywhere in the app. Users
expect right-click menus on list items (tracks, history playlists, cache rows,
console log lines) and on text fields (Cut/Copy/Paste). We want one small
abstraction that makes adding a native context menu to any surface trivial, and
to wire it into the surfaces that need it.

## Mechanism: native Electron menus

Context menus are rendered with **native Electron menus** (`Menu.popup()` in the
main process), matching the existing application menu (`src/main/menu.ts`) and the
approach in Electron's context-menu tutorial. This gives OS-native look,
automatic role localization, and correct platform behavior, at the cost of not
matching the custom dark theme (an accepted trade-off).

## Architecture: one pipeline, handler-closure API

Everything flows through a **single IPC channel**. We deliberately do **not** use
the main-side `webContents 'context-menu'` event: it is not cancelable from the
renderer, so it would double up with our custom menus. Instead the renderer drives
every menu explicitly.

```
renderer: showContextMenu(items)          // items carry onClick closures
   → serialize to a descriptor             // assign an id to each clickable item
   → plucker.popupMenu(descriptor)         // ipcRenderer.invoke
main:   buildMenuTemplate(descriptor)      // → Electron template
   → Menu.popup()                          // resolves invoke with clicked id | null
renderer: dispatch the matching item.onClick()
```

Key properties:

- **Handlers never cross IPC.** Only serializable data (labels, ids, types, roles,
  enabled flags) is sent to main. The renderer keeps the `onClick` closures and
  invokes the one whose id main returns.
- **Localization happens in the renderer** (it already runs i18next) before
  serializing. Main is a dumb popup service and needs no i18n runtime — unlike
  `menu.ts`, which resolves its own language.
- **Role items are handled natively.** An item carrying a `role` (`copy`, `paste`,
  `cut`, `selectAll`, …) is executed by Electron against the focused
  `webContents` and is OS-localized. Role items have no `id` and no renderer
  handler.
- **Dismissal** (clicking away / Escape) resolves the invoke with `null`; no
  handler runs.

## Files

| File | Responsibility |
| --- | --- |
| `src/shared/context-menu.ts` | Shared descriptor types: `MenuItemDescriptor`, `MenuDescriptor`. |
| `src/main/context-menu.ts` | `registerContextMenuIpc(getWindow)` and a pure, testable `buildMenuTemplate(descriptor, onClick)` that maps a descriptor to an Electron `MenuItemConstructorOptions[]`. |
| `src/renderer/src/ui/context-menu.ts` | `showContextMenu(items)` — serialize → invoke → dispatch. Exports the renderer-facing `MenuItem` type (label + optional `onClick`, `type`, `role`, `enabled`). Optional `useContextMenu` helper returning an `onContextMenu` handler. |
| co-located item factories | Small pure functions `(data) => MenuItem[]` for each surface (track row, history card, cache row, console line). Unit-tested for labels, `enabled` states, and ordering. |
| `src/preload/index.ts` | Add `popupMenu(descriptor): Promise<string \| null>` and `copyText(text): Promise<void>`. |
| `src/main/index.ts` | Call `registerContextMenuIpc(...)` during setup (alongside the other IPC registrations). |

### Descriptor shape

```ts
// src/shared/context-menu.ts
export interface MenuItemDescriptor {
  /** Present on clickable custom items; absent on separators and role items. */
  id?: string
  label?: string
  type?: 'normal' | 'separator'
  role?: 'copy' | 'cut' | 'paste' | 'selectAll' | 'undo' | 'redo'
  enabled?: boolean
  accelerator?: string
}
export type MenuDescriptor = MenuItemDescriptor[]
```

The renderer-facing `MenuItem` is the same shape but with `onClick?: () => void`
instead of `id`. `showContextMenu` assigns stable ids while stripping `onClick`.

## Per-surface menus

All labels come from a new `context.*` i18n namespace (en + de), reusing existing
`actions.*` keys where they already exist (e.g. `actions.openFolder`).

- **Track row** (`download` / `history` / `cache` variants):
  Reveal in Finder · Copy title · Copy YouTube URL · Open on YouTube ·
  *(history)* Re-download · *(cache)* Edit tags · Delete file.
  Failed rows append Copy error code.
  Items are `enabled: false` when their precondition is missing (file gone → no
  Reveal/Delete; no `videoId` → no Copy URL / Open on YouTube).
- **History card** (playlist entry header):
  Open folder · Re-download all · Copy playlist URL · Delete entry.
- **Cache view**:
  Row → Reveal · Copy · Edit tags · Delete.
  Empty space → Clear cache.
- **Console log line** (developer console drawer):
  Copy line · Copy all · Reveal log file.

## Text-input Edit menu

A root-level `onContextMenu` fallback (wired once near the app root) handles text
fields: if the event target is an `<input>` / `<textarea>` (or there is a non-empty
text selection) and no surface already handled the event (`defaultPrevented`),
show a **roles-based** menu — Cut / Copy / Paste / Select All — which is
OS-localized and needs no new strings. Surface handlers call `preventDefault()`
(and `stopPropagation()` where needed) so this fallback does not also fire.

## Clipboard

Copy actions (title, URL, error code, log line) route through a small
`clipboard:write` IPC calling Electron's `clipboard.writeText`, rather than
`navigator.clipboard`, to avoid focus/permission quirks in the renderer. Exposed
as `plucker.copyText(text)`.

## Logging

The main-side handler is the one place that sees every menu interaction, so it
carries the instrumentation, using the app's existing `log` facility (scope
`menu`) which already streams to the developer console via `log:line`:

- `log.debug('menu', 'popup: N items')` when a menu is requested.
- `log.debug('menu', 'clicked: <id>')` / `log.debug('menu', 'dismissed')` on close.
- `log.debug('menu', 'clipboard write (N chars)')` on `clipboard:write` — log the
  **length only**, never the clipboard contents (may contain URLs / titles).
- `log.error('menu', 'popup failed:', err)` if building/popping the menu throws.

Renderer-side action closures already call logged main APIs (`revealFile`,
`openExternal`, `startDownload`, history/cache mutations), so their effects are
traced without extra renderer logging.

## Testing

Vitest, following existing patterns:

- **Serializer** (`showContextMenu` internals): strips `onClick`, assigns stable
  unique ids to clickable items, preserves separators, roles, and `enabled`
  flags, and dispatches the correct `onClick` for a returned id (and nothing for
  `null`).
- **`buildMenuTemplate`**: descriptor → Electron template mapping, including role
  passthrough and the `onClick(id)` wiring for clickable items.
- **Item factories**: each surface's factory produces the expected items, labels,
  ordering, and `enabled` states for representative inputs (e.g. a missing-file
  track disables Reveal/Delete; a failed track adds Copy error code).

The thin `Menu.popup()` call itself is not unit-tested.

## Non-goals

- No custom/HTML-rendered menus (native only).
- No global keyboard accelerators for these actions (role items get their OS
  accelerators automatically; custom items show none).
- No changes to the existing application menu (`menu.ts` / `menu-strings.ts`)
  beyond leaving it untouched.
