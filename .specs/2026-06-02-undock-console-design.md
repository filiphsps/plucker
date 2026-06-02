# Undockable (floating) console — design

## Summary

Make the developer console undockable into its own floating OS window, and
redockable back into the main window. The console can live in one of two modes:

- **Docked** — the existing bottom drawer inside the main window (unchanged
  default).
- **Floating** — a separate `BrowserWindow` showing only the console UI.

The mode is toggleable via explicit **Undock** / **Dock** buttons in the console
header. The state (mode, always-on-top, floating geometry) persists across app
restarts.

## Goals

- A second `BrowserWindow` that renders only the console, fed by the same live
  log stream as the docked drawer.
- Explicit undock/redock controls; no functional regression to the docked drawer.
- `⌘J` (and the header console button) keep working in both modes.
- Persist docked-vs-floating, the always-on-top pin, and the floating window's
  geometry.

## Non-goals

- No change to what the console shows or how logs are produced/filtered.
- No multi-monitor snapping beyond the existing on-screen restore guard.
- No detachment of any panel other than the console.

## Architecture

The floating console is a separate Electron `BrowserWindow` that loads the **same
renderer bundle** with a `#console` route marker. `main.tsx` inspects
`location.hash`: `#console` mounts `<ConsoleWindow>`, everything else mounts
`<App>` as today.

The **main process owns the console-window lifecycle** and is the source of truth
for the mode: the console is "floating" exactly when `consoleWindow` exists.
The main process mirrors that fact to the main window (via a `console:mode`
event) so the main window knows whether to render the inline drawer.

```
                 log transport (broadcast log:line to ALL windows)
                        │
        ┌───────────────┴────────────────┐
        ▼                                 ▼
  main window (App)                console window (ConsoleWindow)
   - inline drawer                  - fills viewport
     when mode==docked              - own log buffer
   - undock button                  - dock + pin buttons
        │  undock/redock/pin IPC          │  redock/pin IPC
        └───────────────┬────────────────┘
                        ▼
                main process
         consoleWindow: BrowserWindow|null
         open/close + persist geometry & prefs
```

## Components

### 1. `ConsolePanel` (extracted from `console-drawer.tsx`)

The current `ConsoleDrawer` inner UI — toolbar, filter bar, log list — is
extracted into a reusable `ConsolePanel` so the docked drawer and the floating
window render identical console UI. A `variant: 'docked' | 'floating'` prop
drives the differences:

- **docked**: existing toolbar buttons **plus an Undock icon**; the component is
  wrapped by the drawer's resize handle + `height` (unchanged behavior).
- **floating**: same toolbar buttons **plus a Dock icon and a Pin
  (always-on-top) toggle**; fills the viewport, **no resize handle** (the OS
  window resizes instead).

`ConsoleDrawer` becomes a thin docked wrapper around `ConsolePanel` (keeps the
resize/height logic and passes `variant="docked"` + `onUndock`).

### 2. `ConsoleWindow` (new renderer component)

Root component for the floating window. Responsibilities:

- Owns its own bounded log buffer (max 1000), seeded with `getLogTail()` and
  appended via `onLog` — identical buffering to `App`.
- Reuses the shared theme / accent / i18n bootstrap (same setup `App` performs).
- Reads initial `{ mode, alwaysOnTop }` via `getConsoleState()` to seed the pin.
- Renders `<ConsolePanel variant="floating">`. Dock button → `redockConsole()`.
  Pin toggle → `setConsoleAlwaysOnTop(on)`.

### 3. Renderer routing (`main.tsx`)

Detect `location.hash === '#console'` and mount `<ConsoleWindow>`; otherwise
mount `<App>`. Factor the shared startup (accent subscription, language apply,
CSS import) so both roots run it.

### 4. Main-process console window

A module-level `consoleWindow: BrowserWindow | null` with helpers:

- `openConsoleWindow()` — create the window if absent (frame style consistent
  with the main window), restore geometry from `console-window-state.json` and
  always-on-top from settings, load the renderer with `#console`, persist
  geometry on move/resize/close. If it already exists, focus/raise it instead.
- `closeConsoleWindow()` — destroy it and null the ref.

The console window is closed when the main window closes, and when the console
feature is disabled (see Edge cases).

## Data flow

- **Log broadcast**: the live-stream transport changes from
  `getWindow()?.webContents.send('log:line', e)` to broadcasting to every open
  `BrowserWindow`, so the floating console receives the stream too. `log:tail`
  is an `invoke` and already works from any window.
- **Mode**: the main process broadcasts `console:mode` (`'docked' | 'floating'`)
  to the main window whenever the console window opens or closes. The main
  window renders the inline drawer only when `mode === 'docked'`.

## IPC additions

Preload `plucker` API (and matching `ipcMain` handlers):

| API | Direction | Effect |
| --- | --- | --- |
| `undockConsole()` | renderer→main | open/focus console window; broadcast mode `floating` |
| `redockConsole()` | renderer→main | close console window; broadcast mode `docked` |
| `setConsoleAlwaysOnTop(on)` | renderer→main | `consoleWindow.setAlwaysOnTop(on)` + persist |
| `getConsoleState()` | renderer→main | returns `{ mode, alwaysOnTop }` |
| `toggleConsoleWindow()` | renderer→main | show/raise if hidden/blurred, `hide()` if focused |
| `onConsoleMode(cb)` | main→renderer | main window reacts to docked/floating |

The existing `menu:toggle-console` (⌘J) and `log:line` / `log:tail` channels are
reused.

## Toggle semantics (⌘J / header console button)

- **Docked**: toggles the inline drawer (unchanged).
- **Floating**: **show/hides** the console window — raise + focus if hidden or
  blurred, `hide()` if currently focused. The window stays alive, so `⌘J` is a
  quick peek toggle. Undock/redock remain explicit buttons.

The main window's `⌘J` handler branches on the current mode: docked → toggle
drawer as today; floating → call `toggleConsoleWindow()`.

## Persistence

- Settings gains `developer.consoleWindow = { mode: 'docked' | 'floating',
  alwaysOnTop: boolean }`, default `{ mode: 'docked', alwaysOnTop: false }`.
  The settings default-merge already spreads `developer`, so the field is
  additive; the default object provides the fallback.
- On launch, if `mode === 'floating'` **and** the console feature is enabled,
  `openConsoleWindow()` is called after the main window is created.
- Floating-window geometry persists to a new `console-window-state.json` under
  the plucker app-data dir, reusing the existing tested `loadWindowBounds` /
  `saveWindowBounds` / `isOnScreen` helpers. The existing 480×400 floor applies
  and is acceptable for a log window.

## Edge cases

- **OS close button (X) on the floating window = redock.** Closing the window
  returns the console to docked mode (persisted mode → `docked`) and broadcasts
  `console:mode = docked`, so the console is never silently lost. This is
  distinct from the `⌘J` show/hide, which uses `hide()` and keeps the window
  alive.
- **Console feature disabled** (`developer.console` off in production): hide the
  Undock button, and `closeConsoleWindow()` if one is open. Re-enabling restores
  the buttons but does not auto-reopen.
- **Main window closes**: close the console window too, so it can't outlive the
  app/main window.
- **Persisted-floating but feature disabled at launch**: do not open the console
  window; leave mode effectively docked until the feature is re-enabled.

## Testing

- `ConsolePanel`: renders both variants with the correct toolbar buttons
  (docked shows Undock; floating shows Dock + Pin). Existing `console-filter`
  and `console-line-menu` tests carry over unchanged.
- Settings: default-merge test covers a missing/partial `consoleWindow`.
- Window glue stays thin and mostly Electron-bound; testable logic (geometry
  validation, on-screen guard) is already covered by `window-state` tests and is
  reused as-is.

## Files touched (anticipated)

- `src/renderer/src/console-drawer.tsx` — extract `ConsolePanel`; drawer becomes
  a docked wrapper; add Undock action.
- `src/renderer/src/console-panel.tsx` (new) — shared console UI.
- `src/renderer/src/console-window.tsx` (new) — floating-window root.
- `src/renderer/src/main.tsx` — route on `#console`; shared bootstrap.
- `src/renderer/src/app.tsx` — mode state, hide drawer when floating, undock
  wiring, `⌘J` branch.
- `src/preload/index.ts` + `index.d.ts` — new IPC methods/events.
- `src/main/index.ts` — console window lifecycle, broadcast log transport,
  mode broadcast, launch-time restore, close-with-main.
- `src/main/console-window-state.ts` (optional) or reuse `window-state.ts` with a
  new state path.
- `src/shared/types.ts` — extend `developer` settings shape.
- `src/main/settings.ts` — default `consoleWindow`.
- i18n locale files — strings for Undock / Dock / Pin.
</content>
</invoke>
