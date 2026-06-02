# Undockable Floating Console — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the developer console undock into its own floating OS window and redock back into the main window, toggleable and persisted across restarts.

**Architecture:** A second `BrowserWindow` loads the same renderer bundle with a `#console` route marker and renders only the console UI. The console's inner UI is extracted into a shared `ConsolePanel` used by both the docked drawer and the floating window. The main process owns the console-window lifecycle and the docked/floating mode, broadcasts the live `log:line` stream to all windows, and persists mode + always-on-top + floating geometry.

**Tech Stack:** Electron (main + preload + renderer), React 19, TypeScript, Tailwind, vitest, react-i18next, lucide-react, pnpm.

---

## Git / workflow constraints (read first)

- Work **inline on the current branch** (`master`). Do **not** create branches or worktrees.
- Do **not** run `git stash`, `git reset`, `git checkout`, `git branch`, or anything that touches state outside this feature.
- Before each commit, run `git status --porcelain` and **confirm no files are already staged that you did not stage in this task**. If something unexpected is staged, stop and report — do not commit.
- Each commit is exactly one combined command: `git add <explicit paths> && git commit -m "..."`. Stage only the specific files named in the task; never `git add -A` / `git add .`.
- Conventional Commits required (see `CLAUDE.md`).

## File Structure

- `src/shared/types.ts` — add `ConsoleMode` + `ConsoleWindowState`; extend `developer` settings.
- `src/shared/defaults.ts` — default `developer.consoleWindow`.
- `src/main/settings.ts` — deep-merge `developer.consoleWindow`.
- `src/renderer/src/i18n/locales/en.ts`, `de.ts` — `console.undock` / `console.dock` / `console.pin`.
- `src/renderer/src/console-panel.tsx` — **new**, the shared console UI (toolbar + filters + log list), `variant: 'docked' | 'floating'`.
- `src/renderer/src/console-drawer.tsx` — becomes a thin docked wrapper around `ConsolePanel` (keeps resize/height), gains an Undock action.
- `src/renderer/src/console-panel.test.tsx` — **new**, renders both variants.
- `src/renderer/src/console-window.tsx` — **new**, floating-window root.
- `src/renderer/src/main.tsx` — route on `location.hash === '#console'`.
- `src/renderer/src/app.tsx` — console mode state, drawer gating, undock wiring, ⌘J branch.
- `src/preload/index.ts` — new IPC methods/events (`index.d.ts` derives from `typeof api`, no manual edit).
- `src/main/index.ts` — console-window lifecycle, IPC handlers, broadcast log transport, launch restore, close-with-main.

---

## Task 1: Settings shape, default, and deep-merge for `developer.consoleWindow`

**Files:**
- Modify: `src/shared/types.ts:54-55` (the `developer` field)
- Modify: `src/shared/defaults.ts:49`
- Modify: `src/main/settings.ts:77`
- Test: `src/main/settings.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/main/settings.test.ts` inside the `describe('loadSettings', …)` block (after the existing tests in it):

```ts
  it('defaults developer.consoleWindow when absent', () => {
    writeFileSync(file, JSON.stringify({ version: 2, developer: { console: true } }))
    const s = loadSettings(file)
    expect(s.developer.console).toBe(true)
    expect(s.developer.consoleWindow).toEqual({ mode: 'docked', alwaysOnTop: false })
  })

  it('preserves a persisted floating consoleWindow', () => {
    writeFileSync(
      file,
      JSON.stringify({
        version: 2,
        developer: { console: true, consoleWindow: { mode: 'floating', alwaysOnTop: true } }
      })
    )
    const s = loadSettings(file)
    expect(s.developer.consoleWindow).toEqual({ mode: 'floating', alwaysOnTop: true })
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/main/settings.test.ts`
Expected: FAIL — `consoleWindow` is `undefined` (typecheck/assertion error).

- [ ] **Step 3: Extend the `developer` type**

In `src/shared/types.ts`, replace the `developer` field (line ~54-55) and add the supporting types above the `Settings` interface or near it:

```ts
/** Docked = inline drawer; floating = its own window. */
export type ConsoleMode = 'docked' | 'floating'

/** Persisted console-window preferences. */
export interface ConsoleWindowState {
  mode: ConsoleMode
  alwaysOnTop: boolean
}
```

And change the field inside `Settings`:

```ts
  /** Developer/diagnostics options. */
  developer: { console: boolean; consoleWindow: ConsoleWindowState }
```

- [ ] **Step 4: Set the default**

In `src/shared/defaults.ts`, change line 49:

```ts
  developer: { console: false, consoleWindow: { mode: 'docked', alwaysOnTop: false } }
```

- [ ] **Step 5: Deep-merge `consoleWindow` in mergeDefaults**

In `src/main/settings.ts`, replace line 77:

```ts
    developer: {
      ...d.developer,
      ...(p.developer ?? {}),
      consoleWindow: {
        ...d.developer.consoleWindow,
        ...((p.developer as { consoleWindow?: Partial<Settings['developer']['consoleWindow']> })
          ?.consoleWindow ?? {})
      }
    }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run src/main/settings.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

Verify nothing unexpected is staged first:

```bash
git status --porcelain
git add src/shared/types.ts src/shared/defaults.ts src/main/settings.ts src/main/settings.test.ts && git commit -m "feat(settings): persist console dock mode and always-on-top"
```

---

## Task 2: i18n strings for undock / dock / pin

**Files:**
- Modify: `src/renderer/src/i18n/locales/en.ts` (console block, ~line 120)
- Modify: `src/renderer/src/i18n/locales/de.ts` (console block, ~line 114)

- [ ] **Step 1: Add English strings**

In `src/renderer/src/i18n/locales/en.ts`, inside the `console: { … }` object, add three keys (after `toggle`):

```ts
    undock: 'Undock',
    dock: 'Dock',
    pin: 'Keep on top',
```

- [ ] **Step 2: Add German strings**

In `src/renderer/src/i18n/locales/de.ts`, inside the `console: { … }` object, add:

```ts
    undock: 'Abdocken',
    dock: 'Andocken',
    pin: 'Im Vordergrund',
```

- [ ] **Step 3: Typecheck (locale key parity)**

Run: `pnpm typecheck`
Expected: no errors (the locale types stay in parity — both files gained the same keys).

- [ ] **Step 4: Commit**

```bash
git status --porcelain
git add src/renderer/src/i18n/locales/en.ts src/renderer/src/i18n/locales/de.ts && git commit -m "feat(i18n): console undock/dock/pin strings"
```

---

## Task 3: Extract `ConsolePanel` and add the Undock action

This refactors `console-drawer.tsx`: the inner UI moves into a new `ConsolePanel` with a `variant` prop; `ConsoleDrawer` becomes a thin docked wrapper that keeps the resize/height behavior and passes an `onUndock` handler.

**Files:**
- Create: `src/renderer/src/console-panel.tsx`
- Create: `src/renderer/src/console-panel.test.tsx`
- Modify: `src/renderer/src/console-drawer.tsx` (replace whole file)

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/console-panel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import './i18n'
import { ConsolePanel } from './console-panel'
import type { LogEntry } from '../../shared/types'

const entries: LogEntry[] = [
  { time: 0, level: 'info', scope: 'app', message: 'hello' }
]

describe('ConsolePanel', () => {
  it('docked variant shows the Undock control and no Dock control', () => {
    const html = renderToStaticMarkup(
      <ConsolePanel variant="docked" entries={entries} onClear={() => {}} onUndock={() => {}} />
    )
    expect(html).toContain('Undock')
    expect(html).not.toContain('Keep on top')
  })

  it('floating variant shows the Dock and Pin controls', () => {
    const html = renderToStaticMarkup(
      <ConsolePanel
        variant="floating"
        entries={entries}
        onClear={() => {}}
        onDock={() => {}}
        alwaysOnTop={false}
        onToggleAlwaysOnTop={() => {}}
      />
    )
    expect(html).toContain('Dock')
    expect(html).toContain('Keep on top')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/renderer/src/console-panel.test.tsx`
Expected: FAIL — `./console-panel` does not exist.

- [ ] **Step 3: Create `console-panel.tsx`**

Create `src/renderer/src/console-panel.tsx` with the full content below (this is the former drawer body, generalized over `variant`):

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  X,
  Trash2,
  Copy,
  FolderOpen,
  ArrowDownToLine,
  PictureInPicture2,
  PictureInPicture,
  Pin
} from 'lucide-react'
import type { LogEntry, LogLevel } from '../../shared/types'
import { filterEntries, logScopes } from './console-filter'
import { LogMessage } from './log-value-view'
import { showContextMenu } from './ui/context-menu'
import { consoleLineMenuItems } from './console-line-menu'

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']

/** Tailwind text color per log level (shared by lines and level chips). */
const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: 'text-ink-faint',
  info: 'text-ink',
  warn: 'text-warn',
  error: 'text-bad'
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * The console UI shared by the docked drawer and the floating window. `variant`
 * controls the chrome: the docked variant has a drag-to-resize title bar plus an
 * Undock + Close control; the floating variant fills its window and has Dock + Pin
 * controls instead (the OS frame handles close/resize).
 */
export function ConsolePanel({
  entries,
  onClear,
  variant,
  height,
  onResizeStart,
  onUndock,
  onClose,
  onDock,
  alwaysOnTop,
  onToggleAlwaysOnTop
}: {
  entries: LogEntry[]
  onClear: () => void
  variant: 'docked' | 'floating'
  height?: number
  onResizeStart?: (e: React.PointerEvent) => void
  onUndock?: () => void
  onClose?: () => void
  onDock?: () => void
  alwaysOnTop?: boolean
  onToggleAlwaysOnTop?: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  // Filters track which values are *off* (default: everything on).
  const [levelsOff, setLevelsOff] = useState<Set<LogLevel>>(() => new Set())
  const [scopesOff, setScopesOff] = useState<Set<string>>(() => new Set())
  const [copied, setCopied] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const scopes = useMemo(() => logScopes(entries), [entries])
  const filtered = useMemo(
    () => filterEntries(entries, levelsOff, scopesOff),
    [entries, levelsOff, scopesOff]
  )

  useEffect(() => {
    const el = scrollRef.current
    if (el && autoScroll) el.scrollTop = el.scrollHeight
  }, [filtered, autoScroll])

  function onScroll(e: React.UIEvent<HTMLDivElement>): void {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    setAutoScroll((prev) => (prev === atBottom ? prev : atBottom))
  }

  function toggle<T>(set: Set<T>, value: T, apply: (s: Set<T>) => void): void {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    apply(next)
  }

  async function copyVisible(): Promise<void> {
    const text = filtered
      .map((e) => `${formatTime(e.time)} [${e.level}] [${e.scope}] ${e.message}`)
      .join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const chip = (
    label: string,
    on: boolean,
    color: string,
    onClick: () => void
  ): React.JSX.Element => (
    <button
      key={label}
      onClick={onClick}
      className={
        'rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ' +
        (on ? `bg-raise ${color}` : 'bg-transparent text-ink-faint line-through opacity-60')
      }
    >
      {label}
    </button>
  )

  const docked = variant === 'docked'
  const containerClass = docked
    ? 'flex shrink-0 flex-col border-t border-line bg-[#0a0b0e]'
    : 'flex h-screen flex-col bg-[#0a0b0e]'

  return (
    <div className={containerClass} style={docked ? { height } : undefined}>
      {/* title bar (drag handle / resize handle when docked) */}
      <div
        onPointerDown={docked ? onResizeStart : undefined}
        className={
          'flex h-7 items-center gap-2 border-b border-line2 px-3 select-none ' +
          (docked ? 'cursor-ns-resize' : '')
        }
      >
        <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-ink-faint">
          {t('console.title')}
        </span>
        <span className="font-mono text-[10px] text-ink-faint">
          {t('console.counts', { shown: filtered.length, total: entries.length })}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setAutoScroll((v) => !v)}
          aria-pressed={autoScroll}
          title={t('console.autoScroll')}
          className={
            'flex h-5 items-center gap-1 px-1 ' +
            (autoScroll ? 'text-accent' : 'text-ink-faint hover:text-ink')
          }
        >
          <ArrowDownToLine size={12} />
          <span className="font-mono text-[10px]">{t('console.autoScroll')}</span>
        </button>
        <button
          onClick={() => void copyVisible()}
          title={t('console.copy')}
          className="flex h-5 items-center gap-1 px-1 text-ink-faint hover:text-ink"
        >
          <Copy size={12} />
          <span className="font-mono text-[10px]">
            {copied ? t('console.copied') : t('console.copy')}
          </span>
        </button>
        <button
          onClick={() => void window.plucker.revealLog()}
          title={t('console.reveal')}
          className="flex h-5 items-center px-1 text-ink-faint hover:text-ink"
        >
          <FolderOpen size={12} />
        </button>
        <button
          onClick={onClear}
          title={t('console.clear')}
          className="flex h-5 items-center px-1 text-ink-faint hover:text-ink"
        >
          <Trash2 size={12} />
        </button>
        {docked ? (
          <button
            onClick={onUndock}
            title={t('console.undock')}
            aria-label={t('console.undock')}
            className="flex h-5 items-center px-1 text-ink-faint hover:text-ink"
          >
            <PictureInPicture2 size={13} />
          </button>
        ) : (
          <>
            <button
              onClick={onToggleAlwaysOnTop}
              aria-pressed={alwaysOnTop}
              title={t('console.pin')}
              aria-label={t('console.pin')}
              className={
                'flex h-5 items-center px-1 ' +
                (alwaysOnTop ? 'text-accent' : 'text-ink-faint hover:text-ink')
              }
            >
              <Pin size={13} />
            </button>
            <button
              onClick={onDock}
              title={t('console.dock')}
              aria-label={t('console.dock')}
              className="flex h-5 items-center px-1 text-ink-faint hover:text-ink"
            >
              <PictureInPicture size={13} />
            </button>
          </>
        )}
        {docked && onClose && (
          <button
            onClick={onClose}
            aria-label={t('console.toggle')}
            className="flex h-5 items-center px-1 text-ink-faint hover:text-ink"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line2 px-3 py-1.5">
        <div className="flex items-center gap-1">
          {LEVELS.map((lvl) =>
            chip(lvl, !levelsOff.has(lvl), LEVEL_COLOR[lvl], () =>
              toggle(levelsOff, lvl, setLevelsOff)
            )
          )}
        </div>
        {scopes.length > 0 && <span className="h-3 w-px bg-line2" />}
        <div className="flex flex-wrap items-center gap-1">
          {scopes.map((sc) =>
            chip(sc, !scopesOff.has(sc), 'text-accent', () => toggle(scopesOff, sc, setScopesOff))
          )}
        </div>
      </div>

      {/* log lines */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed"
      >
        {filtered.length === 0 ? (
          <div className="text-ink-faint">{t('console.empty')}</div>
        ) : (
          filtered.map((e, i) => (
            <div
              key={i}
              className="flex gap-2 break-all"
              onContextMenu={(ev) => {
                ev.preventDefault()
                const fmt = (x: LogEntry): string =>
                  `${formatTime(x.time)} [${x.level}] [${x.scope}] ${x.message}`
                void showContextMenu(
                  consoleLineMenuItems({ t, line: fmt(e), allText: filtered.map(fmt).join('\n') })
                )
              }}
            >
              <span className="shrink-0 text-ink-faint">{formatTime(e.time)}</span>
              <span className="shrink-0 text-ink-faint">[{e.scope}]</span>
              <span className="min-w-0 whitespace-pre-wrap">
                <LogMessage message={e.message} level={e.level} args={e.args} />
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Replace `console-drawer.tsx` with a thin docked wrapper**

Replace the **entire** contents of `src/renderer/src/console-drawer.tsx` with:

```tsx
import React from 'react'
import type { LogEntry } from '../../shared/types'
import { ConsolePanel } from './console-panel'

const MIN_HEIGHT = 120
const MAX_HEIGHT = 640

/**
 * The docked bottom console drawer: a resizable wrapper around the shared
 * ConsolePanel. Dragging the title bar resizes it; the Undock control pops the
 * console out into its own floating window.
 */
export function ConsoleDrawer({
  entries,
  height,
  onHeightChange,
  onClose,
  onClear,
  onUndock
}: {
  entries: LogEntry[]
  height: number
  onHeightChange: (h: number) => void
  onClose: () => void
  onClear: () => void
  onUndock: () => void
}): React.JSX.Element {
  // Drag the top edge to resize. Height grows as the pointer moves up.
  function onResizeStart(e: React.PointerEvent): void {
    e.preventDefault()
    const startY = e.clientY
    const startH = height
    const move = (ev: PointerEvent): void => {
      const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startH + (startY - ev.clientY)))
      onHeightChange(next)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <ConsolePanel
      variant="docked"
      entries={entries}
      onClear={onClear}
      height={height}
      onResizeStart={onResizeStart}
      onClose={onClose}
      onUndock={onUndock}
    />
  )
}
```

- [ ] **Step 5: Run the panel test + the existing console tests**

Run: `pnpm vitest run src/renderer/src/console-panel.test.tsx src/renderer/src/console-filter.test.ts src/renderer/src/console-line-menu.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: errors in `app.tsx` are acceptable here **only if** they are about the new required `onUndock` prop on `ConsoleDrawer` (fixed in Task 8). If you see that error, note it and continue; otherwise there should be no errors. (To keep this task self-contained you may instead defer running typecheck until Task 8 — either is fine.)

- [ ] **Step 7: Commit**

```bash
git status --porcelain
git add src/renderer/src/console-panel.tsx src/renderer/src/console-panel.test.tsx src/renderer/src/console-drawer.tsx && git commit -m "refactor(console): extract shared ConsolePanel with docked/floating variants"
```

---

## Task 4: `ConsoleWindow` floating-window root

**Files:**
- Create: `src/renderer/src/console-window.tsx`

- [ ] **Step 1: Create the component**

Create `src/renderer/src/console-window.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import type { LogEntry } from '../../shared/types'
import { ConsolePanel } from './console-panel'

/**
 * Root of the floating console window (loaded via the `#console` route). Holds its
 * own bounded log buffer fed by the same broadcast log stream as the main window,
 * and renders the floating ConsolePanel. Dock returns to the in-app drawer; Pin
 * toggles always-on-top.
 */
export function ConsoleWindow(): React.JSX.Element {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)

  useEffect(() => {
    const off = window.plucker.onLog((e) =>
      setEntries((prev) => [...prev, e].slice(-1000))
    )
    window.plucker.getLogTail().then((tail) => setEntries((prev) => (prev.length ? prev : tail)))
    window.plucker.getConsoleState().then((s) => setAlwaysOnTop(s.alwaysOnTop))
    return off
  }, [])

  function togglePin(): void {
    const next = !alwaysOnTop
    setAlwaysOnTop(next)
    void window.plucker.setConsoleAlwaysOnTop(next)
  }

  return (
    <ConsolePanel
      variant="floating"
      entries={entries}
      onClear={() => setEntries([])}
      onDock={() => void window.plucker.redockConsole()}
      alwaysOnTop={alwaysOnTop}
      onToggleAlwaysOnTop={togglePin}
    />
  )
}
```

(`window.plucker.getConsoleState`, `redockConsole`, `setConsoleAlwaysOnTop` are added in Task 6; this file will not typecheck until then. That is expected — typecheck runs green at Task 6/8.)

- [ ] **Step 2: Commit**

```bash
git status --porcelain
git add src/renderer/src/console-window.tsx && git commit -m "feat(console): floating console window root component"
```

---

## Task 5: Route the renderer on `#console`

**Files:**
- Modify: `src/renderer/src/main.tsx` (replace whole file)

- [ ] **Step 1: Replace `main.tsx`**

Replace the **entire** contents of `src/renderer/src/main.tsx` with:

```tsx
import './index.css'
import './i18n'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app'
import { ConsoleWindow } from './console-window'
import { TooltipProvider } from './ui/tooltip'
import { initAccent } from './theme'

initAccent()

// The same bundle backs both the main window and the floating console window;
// the `#console` hash selects which root to mount.
const isConsoleWindow = window.location.hash === '#console'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>{isConsoleWindow ? <ConsoleWindow /> : <App />}</TooltipProvider>
  </StrictMode>
)
```

- [ ] **Step 2: Commit**

```bash
git status --porcelain
git add src/renderer/src/main.tsx && git commit -m "feat(console): mount floating console root on #console route"
```

---

## Task 6: Preload IPC surface

**Files:**
- Modify: `src/preload/index.ts` (imports + new api methods)

- [ ] **Step 1: Import the shared type**

In `src/preload/index.ts`, add `ConsoleWindowState` to the `import type { … } from '../shared/types'` block (it already imports many types).

- [ ] **Step 2: Add the console-window API methods**

In `src/preload/index.ts`, inside the `api` object, add (place near the existing console block around `onToggleConsole`):

```ts
  // Undock / redock the console into its own floating window.
  undockConsole: (): Promise<void> => ipcRenderer.invoke('console:undock'),
  redockConsole: (): Promise<void> => ipcRenderer.invoke('console:redock'),
  // Show/hide the floating console window (⌘J while floating).
  toggleConsoleWindow: (): Promise<void> => ipcRenderer.invoke('console:toggleWindow'),
  // Pin the floating console above other windows.
  setConsoleAlwaysOnTop: (on: boolean): Promise<void> =>
    ipcRenderer.invoke('console:alwaysOnTop', on),
  // Initial { mode, alwaysOnTop } for whichever window asks.
  getConsoleState: (): Promise<ConsoleWindowState> => ipcRenderer.invoke('console:getState'),
  // Main → main-window: the console moved between docked and floating.
  onConsoleMode: (cb: (mode: ConsoleWindowState['mode']) => void): (() => void) => {
    const fn = (_: unknown, mode: ConsoleWindowState['mode']): void => cb(mode)
    ipcRenderer.on('console:mode', fn)
    return () => ipcRenderer.removeListener('console:mode', fn)
  },
```

- [ ] **Step 3: Typecheck the preload**

Run: `pnpm typecheck:node`
Expected: no errors (the renderer may still error until Task 7/8 — that is `typecheck:web`).

- [ ] **Step 4: Commit**

```bash
git status --porcelain
git add src/preload/index.ts && git commit -m "feat(ipc): console undock/redock/pin/getState bridge"
```

---

## Task 7: Main-process console-window lifecycle

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add module-level state**

In `src/main/index.ts`, near the other module-level lets (around line 61-67), add:

```ts
let consoleWindow: BrowserWindow | null = null
// When the console window is destroyed we normally redock (mode → docked). The app
// shutdown / main-window-close path sets this false so a floating console is
// remembered and reopens floating next launch.
let consoleRedockOnClose = true
```

- [ ] **Step 2: Add lifecycle helpers**

Add these functions to `src/main/index.ts` (place them just above `function createWindow()` near line 428). They reuse the already-imported `loadWindowBounds`, `saveWindowBounds`, `isOnScreen`, `screen`, `pluckerDir`, `loadSettings`, `saveSettings`, `settingsPath`:

```ts
/** Path of the persisted floating-console geometry under the plucker app-data dir. */
function consoleWindowStatePath(): string {
  return join(pluckerDir(), 'console-window-state.json')
}

/** Patch and persist the console-window preferences (mode / alwaysOnTop). */
function setConsoleSettings(patch: Partial<Settings['developer']['consoleWindow']>): void {
  const s = loadSettings()
  const consoleWindow = { ...s.developer.consoleWindow, ...patch }
  saveSettings(settingsPath(), { ...s, developer: { ...s.developer, consoleWindow } })
}

/** Create (or focus) the floating console window. */
function openConsoleWindow(getMain: () => BrowserWindow | null): void {
  if (consoleWindow) {
    consoleWindow.show()
    consoleWindow.focus()
    return
  }
  const saved = loadWindowBounds(consoleWindowStatePath())
  const onScreen =
    saved && isOnScreen(saved, screen.getAllDisplays().map((d) => d.workArea)) ? saved : null
  const alwaysOnTop = loadSettings().developer.consoleWindow.alwaysOnTop

  const win = new BrowserWindow({
    width: onScreen?.width ?? 560,
    height: onScreen?.height ?? 440,
    ...(onScreen ? { x: onScreen.x, y: onScreen.y } : {}),
    show: false,
    title: 'Console',
    backgroundColor: '#0a0b0e',
    alwaysOnTop,
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  consoleWindow = win
  consoleRedockOnClose = true

  win.on('ready-to-show', () => win.show())
  const persist = (): void => saveWindowBounds(consoleWindowStatePath(), win.getBounds())
  win.on('moved', persist)
  win.on('resized', persist)
  win.on('close', persist)
  win.on('closed', () => {
    consoleWindow = null
    // A user-initiated close (OS X button or the Dock control) redocks; an app/main
    // shutdown leaves the persisted mode as 'floating' so it reopens next launch.
    if (consoleRedockOnClose) {
      setConsoleSettings({ mode: 'docked' })
      getMain()?.webContents.send('console:mode', 'docked')
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#console`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'console' })
  }
}

/** Close the floating console window if one is open. */
function closeConsoleWindow(): void {
  consoleWindow?.close()
}
```

- [ ] **Step 3: Broadcast the log stream to all windows**

In `applyConsoleLogging` (around line 93-94), replace the single-window IPC transport:

```ts
  if (enabled && !detachIpcLog) {
    detachIpcLog = addLogTransport((e) => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('log:line', e)
      }
    })
  } else if (!enabled && detachIpcLog) {
```

- [ ] **Step 4: Close the console window when the feature is disabled**

In the `settings:save` handler (around line 111-117), after the existing `applyConsoleLogging(getWindow)` call and before/after the `settings:changed` send, add:

```ts
    // Disabling the developer console pulls down any floating console window too.
    if (app.isPackaged && !loadSettings().developer.console) closeConsoleWindow()
```

- [ ] **Step 5: Register the console IPC handlers**

Inside `registerIpc(getWindow)`, add these handlers (place them near the existing `log:tail` / `log:reveal` handlers around line 138-139):

```ts
  ipcMain.handle('console:undock', () => {
    setConsoleSettings({ mode: 'floating' })
    openConsoleWindow(getWindow)
    getWindow()?.webContents.send('console:mode', 'floating')
  })
  ipcMain.handle('console:redock', () => closeConsoleWindow())
  ipcMain.handle('console:toggleWindow', () => {
    if (!consoleWindow) {
      openConsoleWindow(getWindow)
      return
    }
    if (consoleWindow.isVisible() && consoleWindow.isFocused()) consoleWindow.hide()
    else {
      consoleWindow.show()
      consoleWindow.focus()
    }
  })
  ipcMain.handle('console:alwaysOnTop', (_e, on: boolean) => {
    consoleWindow?.setAlwaysOnTop(on)
    setConsoleSettings({ alwaysOnTop: on })
  })
  ipcMain.handle('console:getState', () => loadSettings().developer.consoleWindow)
```

- [ ] **Step 6: Close the console window with the main window**

In `createWindow`, alongside the existing `win.on('close', persistBounds)` (around line 480), add:

```ts
  // The floating console must not outlive the main window; keep the persisted mode
  // (don't redock) so a remembered floating console reopens next launch.
  win.on('close', () => {
    consoleRedockOnClose = false
    closeConsoleWindow()
  })
```

- [ ] **Step 7: Restore a floating console at launch**

In `app.whenReady().then(…)`, after `applyConsoleLogging(() => mainWindow)` (around line 539) add:

```ts
  // Reopen the console floating if that's how the user left it (and the feature is on).
  const consoleEnabled = !app.isPackaged || loadSettings().developer.console
  if (consoleEnabled && loadSettings().developer.consoleWindow.mode === 'floating') {
    openConsoleWindow(() => mainWindow)
  }
```

- [ ] **Step 8: Keep floating mode across an explicit quit**

In the `before-quit` handler (around line 565), add as the first line of the handler body:

```ts
  consoleRedockOnClose = false
```

- [ ] **Step 9: Typecheck**

Run: `pnpm typecheck:node`
Expected: no errors. (`Settings` is already imported in `index.ts`.)

- [ ] **Step 10: Commit**

```bash
git status --porcelain
git add src/main/index.ts && git commit -m "feat(main): floating console window lifecycle and log broadcast"
```

---

## Task 8: Wire the console mode into `App`

**Files:**
- Modify: `src/renderer/src/app.tsx`

- [ ] **Step 1: Add mode state and seed it**

In `src/renderer/src/app.tsx`, add a state next to the other console state (around line 29-31):

```ts
  const [consoleMode, setConsoleMode] = useState<'docked' | 'floating'>('docked')
```

In the initial settings effect (the `useEffect` calling `window.plucker.getSettings()` around line 37-43), add a line to seed the mode:

```ts
    window.plucker.getConsoleState().then((s) => setConsoleMode(s.mode))
```

- [ ] **Step 2: React to mode changes from main**

Add a new effect (near the `onToggleConsole` effect around line 70):

```ts
  // Main process reports docked/floating transitions (undock, redock, OS-close of
  // the float). Returning to docked reopens the inline drawer so the console isn't lost.
  useEffect(
    () =>
      window.plucker.onConsoleMode((mode) => {
        setConsoleMode(mode)
        if (mode === 'docked') setConsoleOpen(true)
      }),
    []
  )
```

- [ ] **Step 3: Define a mode-aware toggle and use it for ⌘J + the header**

Replace the existing `onToggleConsole` menu effect (around line 69-70):

```ts
  // Toggle the console from the application menu (⌘J): docked → flip the drawer;
  // floating → show/hide the floating window.
  useEffect(
    () =>
      window.plucker.onToggleConsole(() => {
        if (consoleMode === 'floating') void window.plucker.toggleConsoleWindow()
        else setConsoleOpen((v) => !v)
      }),
    [consoleMode]
  )
```

And update the `Header`'s `onToggleConsole` prop (around line 165) to be mode-aware:

```tsx
        onToggleConsole={() => {
          if (consoleMode === 'floating') void window.plucker.toggleConsoleWindow()
          else setConsoleOpen((v) => !v)
        }}
```

- [ ] **Step 4: Gate the drawer on docked mode and pass `onUndock`**

Replace the drawer render block (around line 244-252):

```tsx
      {consoleAvailable && consoleOpen && consoleMode === 'docked' && (
        <ConsoleDrawer
          entries={logEntries}
          height={consoleHeight}
          onHeightChange={setConsoleHeight}
          onClose={() => setConsoleOpen(false)}
          onClear={() => setLogEntries([])}
          onUndock={() => void window.plucker.undockConsole()}
        />
      )}
```

- [ ] **Step 5: Full typecheck + test + lint**

Run: `pnpm typecheck && pnpm vitest run && pnpm lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git status --porcelain
git add src/renderer/src/app.tsx && git commit -m "feat(console): undock/redock wiring and mode-aware toggle in App"
```

---

## Task 9: Manual verification in the running app

No code changes — exercise the feature end-to-end. (The console is available in dev automatically.)

- [ ] **Step 1: Launch**

Run: `pnpm dev`
Expected: app opens; no errors in the terminal.

- [ ] **Step 2: Dock → float**

Open the console (header terminal button or ⌘J). Click the **Undock** icon. Expected: the inline drawer disappears and a separate console window appears showing the live log stream.

- [ ] **Step 3: Live stream in both contexts**

Trigger some logging (e.g. resolve/start a small download). Expected: lines appear live in the floating window.

- [ ] **Step 4: ⌘J while floating**

Press ⌘J with the floating window focused → it hides. Press ⌘J again (from the main window) → it shows/focuses. Expected: show/hide toggles, the window is not destroyed (its filters/scroll persist).

- [ ] **Step 5: Pin**

Click the **Pin** icon, bring the main window forward. Expected: the console stays above. Toggle pin off → it can go behind.

- [ ] **Step 6: Redock via Dock button and via OS close**

Click **Dock** → console returns to the inline drawer. Undock again, then close the floating window with the OS close button → it also returns to the inline drawer. Expected: both paths redock.

- [ ] **Step 7: Persistence**

Undock, move/resize the floating window, quit the app, relaunch (`pnpm dev` — or build). Expected: the console reopens floating at the same geometry. Redock, quit, relaunch → it opens docked (closed) as before.

- [ ] **Step 8: No commit** (verification only). If you changed anything to fix a bug, commit it under an appropriate `fix(...)` message following the per-task git rules.

---

## Self-Review Notes (already reconciled)

- **Spec coverage:** second window + `#console` route (T4/T5), shared `ConsolePanel` (T3), broadcast log (T7§3), IPC surface (T6), toggle semantics (T8§3 + T7 `console:toggleWindow`), OS-close = redock (T7§2 `closed` handler), persistence of mode/pin/geometry (T1, T7), launch restore (T7§7), feature-disabled close (T7§4), close-with-main (T7§6) — all mapped.
- **Type consistency:** `ConsoleMode` / `ConsoleWindowState` defined in T1 and reused in preload (T6) and main (`Settings['developer']['consoleWindow']`, T7). Method names (`undockConsole`, `redockConsole`, `toggleConsoleWindow`, `setConsoleAlwaysOnTop`, `getConsoleState`, `onConsoleMode`) are identical across preload (T6), `ConsoleWindow` (T4), and `App` (T8).
- **Known minor limitation:** on macOS, closing the *main* window (without quitting) closes the console too and it won't auto-reopen on dock-reactivate; this is acceptable and out of scope.
</content>
</invoke>
