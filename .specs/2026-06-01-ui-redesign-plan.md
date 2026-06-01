# Plucker UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Plucker's generic dark UI with a flat, DAW-inspired (Traktor Pro 4) "studio" interface — labeled top tabs, a persistent transport-style status deck, a shared expandable track item, and a preferences rack whose transform chain reads like an insert rack — all accented by the user's live OS accent color.

**Architecture:** Renderer-layer rewrite plus one small main-process addition (accent color). Design tokens live as CSS variables wired into Tailwind v4 `@theme`; the OS accent is read in main, bridged through preload, and injected at runtime onto `:root` so every `*-accent` utility tracks it. A small set of themed primitives (Switch, Segmented, Stepper, Panel) is shared across views. One `TrackRow` component serves both Download and History via a `variant` prop.

**Tech Stack:** Electron 39, React 19, Tailwind CSS v4 (`@tailwindcss/vite`), Vitest, `lucide-react`, `@fontsource/geist` + `@fontsource/geist-mono`, Electron `systemPreferences.getAccentColor()`.

**Visual source of truth:** the approved mockups in `.specs/redesign/mockups/` —
`download.html`, `history.html`, `settings.html`. When a step says "match the mockup,"
open the corresponding file and replicate its layout, spacing, colors, and icon choices.

**Design spec:** `.specs/2026-06-01-ui-redesign-design.md`.

**Conventions:** pnpm only. Conventional Commits. Component files kebab-case, exported
component PascalCase.

---

## File Structure

**Create:**

- `src/main/accent.ts` — platform accent-color util (macOS now; win/nix stubs)
- `src/main/accent.test.ts` — tests for hex normalization/fallback
- `src/renderer/src/theme.ts` — applies `--color-accent` from the bridge at startup
- `src/renderer/src/ui/switch.tsx` — toggle switch primitive
- `src/renderer/src/ui/segmented.tsx` — segmented control primitive
- `src/renderer/src/ui/stepper.tsx` — numeric stepper primitive
- `src/renderer/src/ui/stepper-utils.ts` — pure clamp helper
- `src/renderer/src/ui/stepper-utils.test.ts`
- `src/renderer/src/ui/panel.tsx` — settings panel + header primitive
- `src/renderer/src/transport-deck.tsx` — bottom active-job status deck
- `src/renderer/src/transport-deck.test.tsx`

**Modify:**

- `package.json` — add deps
- `src/renderer/src/index.css` — fonts + `@theme` tokens + base/custom CSS
- `src/main/index.ts` — register `accent:get` IPC, push `accent:changed`
- `src/preload/index.ts` — expose `getAccentColor` + `onAccentChanged`
- `src/renderer/src/main.tsx` — call theme bootstrap
- `src/renderer/src/app.tsx` — tabs + deck + settings-as-view shell
- `src/renderer/src/header.tsx` — toolbar with labeled tabs + settings button
- `src/renderer/src/track-row.tsx` — shared expandable item with `variant`
- `src/renderer/src/track-row.test.tsx` — new
- `src/renderer/src/download-view.tsx` — command bar + browser + deck wiring
- `src/renderer/src/history-view.tsx` — search + job cards reusing `TrackRow`
- `src/renderer/src/settings-panel.tsx` — full-page preferences rack + save bar
- `src/renderer/src/transforms-section.tsx` — insert/effects rack
- `src/renderer/src/schema-form.tsx` — themed fields
- `src/renderer/src/i18n/locales/en.ts`, `de.ts` — new labels

---

## Phase 0 — Foundation

### Task 1: Dependencies, fonts, and theme tokens

**Files:**

- Modify: `package.json`
- Modify: `src/renderer/src/index.css`

- [ ] **Step 1: Add dependencies**

Run:

```bash
pnpm add lucide-react @fontsource/geist @fontsource/geist-mono
```

Expected: the three packages appear under `dependencies` in `package.json`.

- [ ] **Step 2: Replace `index.css` with fonts, tokens, and base styles**

Overwrite `src/renderer/src/index.css` with:

```css
@import 'tailwindcss';

/* Bundled fonts (offline desktop app — no CDN) */
@import '@fontsource/geist/400.css';
@import '@fontsource/geist/500.css';
@import '@fontsource/geist/600.css';
@import '@fontsource/geist/700.css';
@import '@fontsource/geist-mono/400.css';
@import '@fontsource/geist-mono/500.css';
@import '@fontsource/geist-mono/600.css';

/* Design tokens → Tailwind utilities (bg-surface, text-ink, border-line, text-accent, …).
   --color-accent is overridden at runtime in theme.ts from the OS accent color. */
@theme {
  --font-sans: 'Geist', system-ui, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, monospace;

  --color-surface: #0d0e11;
  --color-panel: #15171b;
  --color-panel2: #101216;
  --color-raise: #1c1f24;
  --color-line: #23262c;
  --color-line2: #1a1d22;
  --color-ink: #c9ced6;
  --color-ink-dim: #7c838f;
  --color-ink-faint: #4b515b;
  --color-ok: #3fc97f;
  --color-bad: #ff5b52;
  --color-warn: #e8a23a;

  --color-accent: #0a84ff; /* default; replaced at runtime */
  --color-accent-dim: rgba(10, 132, 255, 0.16);
}

:root {
  color-scheme: dark;
}

html,
body,
#root {
  height: 100%;
  margin: 0;
}

body {
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  user-select: none;
}

/* Custom select chevron (used by themed <select>) */
.pl-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237c838f' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 9px center;
  padding-right: 30px;
}

/* Tabular numerics for meters/counters */
.tnum {
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 3: Verify the app still builds and fonts load**

Run: `pnpm dev`
Expected: app launches with no console errors; default font is now Geist (the existing
UI will look unstyled-ish — that's fine, later tasks restyle it).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/renderer/src/index.css
git commit -m "build: add lucide, geist fonts, and DAW theme tokens"
```

---

### Task 2: OS accent color (main → preload → renderer)

**Files:**

- Create: `src/main/accent.ts`
- Test: `src/main/accent.test.ts`
- Create: `src/renderer/src/theme.ts`
- Modify: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/main.tsx`

- [ ] **Step 1: Write the failing test for the accent util**

Create `src/main/accent.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  systemPreferences: {
    getAccentColor: vi.fn(() => '')
  }
}))

import { systemPreferences } from 'electron'
import { getAccentColor, DEFAULT_ACCENT } from './accent'

describe('getAccentColor', () => {
  it('normalizes an 8-digit RGBA hex to #rrggbb', () => {
    ;(systemPreferences.getAccentColor as ReturnType<typeof vi.fn>).mockReturnValue('0a84ffff')
    expect(getAccentColor()).toBe('#0a84ff')
  })

  it('accepts a 6-digit hex and lowercases with leading #', () => {
    ;(systemPreferences.getAccentColor as ReturnType<typeof vi.fn>).mockReturnValue('FF5B52')
    expect(getAccentColor()).toBe('#ff5b52')
  })

  it('falls back to the default when the API returns empty', () => {
    ;(systemPreferences.getAccentColor as ReturnType<typeof vi.fn>).mockReturnValue('')
    expect(getAccentColor()).toBe(DEFAULT_ACCENT)
  })

  it('falls back to the default when the API throws (e.g. Linux)', () => {
    ;(systemPreferences.getAccentColor as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('not available')
    })
    expect(getAccentColor()).toBe(DEFAULT_ACCENT)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm test -- src/main/accent.test.ts`
Expected: FAIL — cannot find module `./accent`.

- [ ] **Step 3: Implement `src/main/accent.ts`**

```ts
import { systemPreferences } from 'electron'

/** macOS blue — used until Windows/Linux sourcing is wired and when no API is available. */
export const DEFAULT_ACCENT = '#0a84ff'

/**
 * The user's OS accent color as `#rrggbb`.
 *
 * `systemPreferences.getAccentColor()` returns an RGBA hex string (e.g. "0a84ffff") on
 * macOS + Windows. Linux has no API and throws — callers get DEFAULT_ACCENT. Extracted
 * here so per-platform sourcing can evolve without touching the IPC layer.
 */
export function getAccentColor(): string {
  try {
    const raw = systemPreferences.getAccentColor?.() ?? ''
    const hex = raw.replace(/^#/, '').trim()
    if (hex.length >= 6) return `#${hex.slice(0, 6).toLowerCase()}`
    return DEFAULT_ACCENT
  } catch {
    return DEFAULT_ACCENT
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm test -- src/main/accent.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Register the IPC handler and change event in `src/main/index.ts`**

Add the import near the other `./` imports (line ~9):

```ts
import { getAccentColor } from './accent'
```

Inside `registerIpc(...)`, next to the other `ipcMain.handle` calls (after the
`app:locale` handler ~line 27), add:

```ts
ipcMain.handle('accent:get', () => getAccentColor())
```

After `app.whenReady()` has created the window (where other one-time main setup lives,
near the menu/updater wiring), add a subscription that forwards accent changes to the
renderer:

```ts
// Push OS accent-color changes to the renderer so --color-accent updates live.
systemPreferences.subscribeNotification?.('AppleColorPreferencesChangedNotification', () =>
  getWindow()?.webContents.send('accent:changed', getAccentColor())
)
```

Add `systemPreferences` to the existing `electron` import at the top of the file:

```ts
import { app, shell, BrowserWindow, ipcMain, dialog, systemPreferences } from 'electron'
```

- [ ] **Step 6: Expose the bridge in `src/preload/index.ts`**

Inside the `api` object add:

```ts
  getAccentColor: (): Promise<string> => ipcRenderer.invoke('accent:get'),
  onAccentChanged: (cb: (hex: string) => void): (() => void) => {
    const fn = (_: unknown, hex: string): void => cb(hex)
    ipcRenderer.on('accent:changed', fn)
    return () => ipcRenderer.removeListener('accent:changed', fn)
  },
```

(`PluckerApi` is `typeof api`, so the renderer type updates automatically.)

- [ ] **Step 7: Implement `src/renderer/src/theme.ts`**

```ts
/** Convert `#rrggbb` to `rgba(r, g, b, alpha)`. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Write the accent hex (and its dim variant) onto :root so all *-accent utilities track it. */
export function applyAccent(hex: string): void {
  const root = document.documentElement
  root.style.setProperty('--color-accent', hex)
  root.style.setProperty('--color-accent-dim', withAlpha(hex, 0.16))
}

/** Fetch the OS accent once and subscribe to live changes. Returns an unsubscribe fn. */
export function initAccent(): () => void {
  window.plucker.getAccentColor().then(applyAccent)
  return window.plucker.onAccentChanged(applyAccent)
}
```

- [ ] **Step 8: Call the bootstrap in `src/renderer/src/main.tsx`**

Add `import { initAccent } from './theme'` and call `initAccent()` once before/after
`createRoot(...).render(...)` (top level, module scope is fine).

- [ ] **Step 9: Verify live accent in the running app**

Run: `pnpm dev`. In macOS System Settings → Appearance, change the Accent color.
Expected: no crash; `getComputedStyle(document.documentElement).getPropertyValue('--color-accent')`
in DevTools reflects the chosen color (and updates on change).

- [ ] **Step 10: Commit**

```bash
git add src/main/accent.ts src/main/accent.test.ts src/main/index.ts \
        src/preload/index.ts src/renderer/src/theme.ts src/renderer/src/main.tsx
git commit -m "feat: drive accent color from the OS accent color"
```

---

## Phase 1 — Primitives

### Task 3: Themed UI primitives (Switch, Segmented, Stepper, Panel)

**Files:**

- Create: `src/renderer/src/ui/stepper-utils.ts`
- Test: `src/renderer/src/ui/stepper-utils.test.ts`
- Create: `src/renderer/src/ui/switch.tsx`, `segmented.tsx`, `stepper.tsx`, `panel.tsx`

- [ ] **Step 1: Write the failing test for the clamp helper**

Create `src/renderer/src/ui/stepper-utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { clampStep } from './stepper-utils'

describe('clampStep', () => {
  it('increments within range', () => {
    expect(clampStep(4, +1, 1, 16)).toBe(5)
  })
  it('does not exceed max', () => {
    expect(clampStep(16, +1, 1, 16)).toBe(16)
  })
  it('does not go below min', () => {
    expect(clampStep(1, -1, 1, 16)).toBe(1)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm test -- src/renderer/src/ui/stepper-utils.test.ts`
Expected: FAIL — cannot find module `./stepper-utils`.

- [ ] **Step 3: Implement `src/renderer/src/ui/stepper-utils.ts`**

```ts
/** Clamp `value + delta` into the inclusive range [min, max]. */
export function clampStep(value: number, delta: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value + delta))
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm test -- src/renderer/src/ui/stepper-utils.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement `src/renderer/src/ui/switch.tsx`**

```tsx
import React from 'react'

/** A small toggle switch. Track turns accent when on; knob slides right. */
export function Switch({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label?: string
}): React.JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={
        'relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ' +
        (checked ? 'bg-accent' : 'bg-[#262a31]')
      }
    >
      <span
        className={
          'absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-all ' +
          (checked ? 'left-[18px]' : 'left-0.5')
        }
      />
    </button>
  )
}
```

- [ ] **Step 6: Implement `src/renderer/src/ui/segmented.tsx`**

```tsx
import React from 'react'

export interface SegmentedOption<T extends string | number> {
  value: T
  label: string
}

/** A segmented control. The selected segment fills with the accent color. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (next: T) => void
}): React.JSX.Element {
  return (
    <div className="flex rounded-md border border-line bg-[#0a0b0e] p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={
            'rounded px-3 py-[5px] font-mono text-xs tnum transition-colors ' +
            (o.value === value ? 'bg-accent text-white' : 'text-ink-dim hover:text-ink')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: Implement `src/renderer/src/ui/stepper.tsx`**

```tsx
import React from 'react'
import { Minus, Plus } from 'lucide-react'
import { clampStep } from './stepper-utils'

/** A `− value +` numeric stepper clamped to [min, max]. */
export function Stepper({
  value,
  min,
  max,
  onChange
}: {
  value: number
  min: number
  max: number
  onChange: (next: number) => void
}): React.JSX.Element {
  const step = (delta: number): void => onChange(clampStep(value, delta, min, max))
  const btn =
    'flex h-8 w-[30px] items-center justify-center text-ink-dim hover:bg-raise hover:text-ink'
  return (
    <div className="flex items-center overflow-hidden rounded-md border border-line bg-[#0a0b0e]">
      <button className={btn} onClick={() => step(-1)} aria-label="decrement">
        <Minus size={15} />
      </button>
      <span className="h-8 w-[42px] border-x border-line text-center font-mono text-[13px] leading-8 tnum text-ink">
        {value}
      </span>
      <button className={btn} onClick={() => step(+1)} aria-label="increment">
        <Plus size={15} />
      </button>
    </div>
  )
}
```

- [ ] **Step 8: Implement `src/renderer/src/ui/panel.tsx`**

```tsx
import React from 'react'
import type { LucideIcon } from 'lucide-react'

/** A settings rack panel: bordered card with a mono uppercase header + icon. */
export function Panel({
  icon: Icon,
  title,
  aside,
  children
}: {
  icon: LucideIcon
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="mb-3.5 overflow-hidden rounded-[10px] border border-line bg-panel2">
      <header className="flex items-center gap-2 border-b border-line bg-panel px-3.5 py-2.5 font-mono text-[10px] uppercase tracking-[1.5px] text-ink-faint">
        <Icon size={13} />
        {title}
        {aside && <span className="ml-auto normal-case tracking-normal">{aside}</span>}
      </header>
      {children}
    </section>
  )
}

/** A `label + description ⟶ control` row inside a Panel. */
export function PanelRow({
  name,
  desc,
  children
}: {
  name: string
  desc?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-4 border-b border-line2 px-3.5 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-ink">{name}</div>
        {desc && <div className="mt-0.5 text-[11.5px] text-ink-faint">{desc}</div>}
      </div>
      {children}
    </div>
  )
}
```

- [ ] **Step 9: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors in the new files).

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/ui
git commit -m "feat: add themed UI primitives (switch, segmented, stepper, panel)"
```

---

## Phase 2 — Shell

### Task 4: Toolbar with labeled tabs + settings button

**Files:**

- Modify: `src/renderer/src/header.tsx`

Match `.specs/redesign/mockups/download.html` `.top` region.

- [ ] **Step 1: Rewrite `src/renderer/src/header.tsx`**

```tsx
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Download, History as HistoryIcon, SlidersHorizontal, type LucideIcon } from 'lucide-react'

export type View = 'download' | 'history'

export function Header({
  view,
  onNavigate,
  onOpenSettings,
  settingsActive = false
}: {
  view: View
  onNavigate: (v: View) => void
  onOpenSettings: () => void
  settingsActive?: boolean
}): React.JSX.Element {
  const { t } = useTranslation()

  const tab = (v: View, label: string, Icon: LucideIcon): React.JSX.Element => {
    const on = view === v && !settingsActive
    return (
      <button
        onClick={() => onNavigate(v)}
        className={
          'flex h-8 items-center gap-[7px] rounded-md px-3.5 text-[13px] font-medium transition-colors ' +
          (on ? 'bg-accent-dim text-accent' : 'text-ink-dim hover:bg-raise hover:text-ink')
        }
      >
        <Icon size={16} />
        {label}
      </button>
    )
  }

  return (
    <header className="flex h-12 items-center gap-4 border-b border-line bg-panel px-3.5">
      <span className="font-mono text-xs font-semibold tracking-[3px] text-[#e7ebef]">
        PL<span className="text-accent">U</span>CKER
      </span>
      <span className="h-[22px] w-px bg-line" />
      <nav className="flex gap-0.5">
        {tab('download', t('nav.download'), Download)}
        {tab('history', t('nav.history'), HistoryIcon)}
      </nav>
      <div className="flex-1" />
      <button
        onClick={onOpenSettings}
        aria-label={t('app.settings')}
        className={
          'flex h-8 w-8 items-center justify-center rounded-md transition-colors ' +
          (settingsActive
            ? 'bg-accent-dim text-accent'
            : 'text-ink-faint hover:bg-raise hover:text-ink')
        }
      >
        <SlidersHorizontal size={18} />
      </button>
    </header>
  )
}
```

- [ ] **Step 2: Typecheck (App will be updated in Task 6; expect a temporary prop mismatch only if you run it now — that's fine.)**

Run: `pnpm typecheck`
Expected: errors only in `app.tsx` referencing the old Header API (resolved in Task 6).
If you want a clean checkpoint, do Task 6 before committing; otherwise commit now.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/header.tsx
git commit -m "feat: toolbar with labeled tabs and settings button"
```

---

### Task 5: Transport deck (active-job status bar)

**Files:**

- Create: `src/renderer/src/transport-deck.tsx`
- Test: `src/renderer/src/transport-deck.test.tsx`

Match `.specs/redesign/mockups/download.html` `.deck` region. The deck shows the
currently-downloading track, a segmented JOB PROGRESS meter, a `done/total` counter, and
a Cancel button. No playback controls.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/transport-deck.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TransportDeck } from './transport-deck'
import type { JobProgress } from '../../shared/types'

afterEach(cleanup)

const base: JobProgress = {
  jobTitle: 'Mix',
  total: 24,
  folder: '/tmp',
  url: 'u',
  overall: 0.5,
  tracks: [
    { index: 1, title: 'Avril 14th', status: 'downloading', percent: 64, artist: 'Aphex Twin' },
    { index: 2, title: 'Stratus', status: 'done' }
  ]
}

describe('TransportDeck', () => {
  it('shows the active (downloading) track title and the done/total counter', () => {
    render(<TransportDeck progress={base} onCancel={() => {}} />)
    expect(screen.getByText('Avril 14th')).toBeTruthy()
    expect(screen.getByText('1/24')).toBeTruthy() // 1 done, 24 total
  })

  it('invokes onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(<TransportDeck progress={base} onCancel={onCancel} />)
    fireEvent.click(screen.getByLabelText('Cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
```

> If `@testing-library/react` is not yet a dev dependency, add it:
> `pnpm add -D @testing-library/react @testing-library/dom` and ensure `vitest` runs with
> the `jsdom` environment. Check `vitest`/electron-vite config for an existing DOM env; the
> repo already has `.tsx` tests (`schema-form.test.tsx`) so the environment is configured —
> reuse the same setup.

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm test -- src/renderer/src/transport-deck.test.tsx`
Expected: FAIL — cannot find module `./transport-deck`.

- [ ] **Step 3: Implement `src/renderer/src/transport-deck.tsx`**

```tsx
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Music, X } from 'lucide-react'
import type { JobProgress } from '../../shared/types'

const SEGMENTS = 32

/** Segmented horizontal meter: `filled` of `SEGMENTS` cells lit with the accent. */
function Meter({ value }: { value: number }): React.JSX.Element {
  const filled = Math.round(value * SEGMENTS)
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={'h-3.5 flex-1 rounded-[1px] ' + (i < filled ? 'bg-accent' : 'bg-[#16191e]')}
        />
      ))}
    </div>
  )
}

/**
 * Bottom status deck for the active job. Render only while a job is running
 * (the caller decides visibility).
 */
export function TransportDeck({
  progress,
  onCancel
}: {
  progress: JobProgress
  onCancel: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const active =
    progress.tracks.find((x) => x.status === 'downloading' || x.status === 'transforming') ??
    progress.tracks.find((x) => x.status === 'queued')
  const done = progress.tracks.filter((x) => x.status === 'done').length
  const subtitle = [active?.artist, active?.album].filter(Boolean).join(' · ')

  return (
    <div className="flex h-[92px] items-center gap-4 border-t border-line bg-panel px-[18px]">
      <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[7px] border border-line bg-[#23272e] text-ink-faint">
        <Music size={20} />
      </div>
      <div className="w-[220px]">
        <div className="font-mono text-[9px] tracking-[1.5px] text-ink-faint">
          {t('deck.nowPlucking')}
        </div>
        <div className="mt-0.5 truncate text-[15px] font-semibold text-[#e7ebef]">
          {active?.title ?? '—'}
        </div>
        <div className="truncate font-mono text-[11px] text-accent">{subtitle}</div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Meter value={progress.overall} />
        <div className="flex justify-between font-mono text-[9px] tracking-[0.5px] text-ink-faint">
          <span>{t('deck.jobProgress')}</span>
          <span>{Math.round(progress.overall * 100)}%</span>
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-2xl font-semibold leading-none tnum text-accent">
          {done}/{progress.total}
        </div>
        <div className="mt-1 font-mono text-[9px] tracking-[1.5px] text-ink-faint">
          {t('deck.tracks')}
        </div>
      </div>
      <button
        onClick={onCancel}
        aria-label={t('download.cancel')}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-raise text-bad"
      >
        <X size={15} />
      </button>
    </div>
  )
}
```

> Note: the `deck.*` i18n keys are added in Task 13. To keep this task's test green without
> i18n wiring, the test renders raw `t(...)` keys as fallback strings — that's fine; the
> assertions only check the track title and counter.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm test -- src/renderer/src/transport-deck.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/transport-deck.tsx src/renderer/src/transport-deck.test.tsx
git commit -m "feat: transport deck status bar for the active job"
```

---

### Task 6: App shell (tabs + deck + settings-as-view)

**Files:**

- Modify: `src/renderer/src/app.tsx`

The shell owns the active view (`download` | `history`), a `settingsOpen` flag (Settings
becomes a full-page view layered over content), and the live `JobProgress` so the deck can
persist across tab switches.

- [ ] **Step 1: Rewrite `src/renderer/src/app.tsx`**

```tsx
import React, { useEffect, useState } from 'react'
import { DownloadView } from './download-view'
import { HistoryView } from './history-view'
import { SettingsPanel } from './settings-panel'
import { TransportDeck } from './transport-deck'
import { Header, type View } from './header'
import { applyLanguage } from './i18n'
import type { JobProgress } from '../../shared/types'

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('download')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    window.plucker.getSettings().then((s) => applyLanguage(s.language))
  }, [])

  useEffect(() => window.plucker.onProgress(setProgress), [])

  useEffect(
    () =>
      window.plucker.onMenuNavigate((target) => {
        if (target === 'settings') setSettingsOpen(true)
        else {
          setSettingsOpen(false)
          setView(target)
        }
      }),
    []
  )

  const deckVisible = running && progress !== null

  return (
    <div className="flex h-screen flex-col bg-surface text-ink">
      <Header
        view={view}
        settingsActive={settingsOpen}
        onNavigate={(v) => {
          setSettingsOpen(false)
          setView(v)
        }}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="min-h-0 flex-1">
        {settingsOpen ? (
          <SettingsPanel onClose={() => setSettingsOpen(false)} />
        ) : view === 'download' ? (
          <DownloadView progress={progress} onProgress={setProgress} onRunningChange={setRunning} />
        ) : (
          <HistoryView
            onNavigateDownload={() => {
              setSettingsOpen(false)
              setView('download')
            }}
          />
        )}
      </div>

      {deckVisible && progress && (
        <TransportDeck progress={progress} onCancel={() => window.plucker.cancel()} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck (expect errors in DownloadView/HistoryView/SettingsPanel props until their tasks land)**

Run: `pnpm typecheck`
Expected: type errors only about `DownloadView`/`SettingsPanel` props — resolved in Tasks
8 and 12. Do not commit a broken typecheck; if you are executing strictly in order,
proceed to Task 7+ and commit the shell together with Task 8. Otherwise temporarily keep
the old view signatures.

- [ ] **Step 3: Commit (after Task 8 compiles, or now if batching)**

```bash
git add src/renderer/src/app.tsx
git commit -m "feat: app shell with persistent deck and settings view"
```

---

## Phase 3 — Shared track item

### Task 7: `TrackRow` — shared, expandable, variant-aware

**Files:**

- Modify: `src/renderer/src/track-row.tsx`
- Test: `src/renderer/src/track-row.test.tsx`

One component for both views. `variant="download"` shows a segmented progress meter +
status; `variant="history"` shows duration + hover actions. Both expand to a detail panel.
Match the row + detail markup in `download.html` and `history.html`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/track-row.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TrackRow } from './track-row'

beforeEach(() => {
  // @ts-expect-error test stub
  global.window.plucker = { getCover: vi.fn(() => Promise.resolve(null)), revealFile: vi.fn() }
})
afterEach(cleanup)

describe('TrackRow', () => {
  it('shows the percent status in the download variant', () => {
    render(
      <TrackRow
        variant="download"
        index={1}
        track={{ title: 'Avril 14th', artist: 'Aphex Twin', status: 'downloading', percent: 64 }}
      />
    )
    expect(screen.getByText('64%')).toBeTruthy()
  })

  it('reveals the detail grid when expanded', () => {
    render(
      <TrackRow
        variant="download"
        index={1}
        track={{ title: 'Avril 14th', status: 'downloading', percent: 64, file: '/a/01.mp3' }}
        detail={{ Source: 'youtube.com/watch?v=x', Format: 'MP3 · 320 kbps' }}
      />
    )
    expect(screen.queryByText('youtube.com/watch?v=x')).toBeNull()
    fireEvent.click(screen.getByLabelText('expand'))
    expect(screen.getByText('youtube.com/watch?v=x')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm test -- src/renderer/src/track-row.test.tsx`
Expected: FAIL — current `TrackRow` has a different API (no `variant`/`index`/`detail`).

- [ ] **Step 3: Rewrite `src/renderer/src/track-row.tsx`**

```tsx
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Music, ChevronRight, ChevronDown, Check, X } from 'lucide-react'
import type { TrackStatus } from '../../shared/types'

export interface TrackRowData {
  title: string
  artist?: string
  album?: string
  year?: string
  status?: TrackStatus
  percent?: number
  transformPercent?: number
  file?: string
  /** Mono duration string for the history variant, e.g. "3:32". */
  duration?: string
  reason?: string
}

const METER_CELLS = 14

function Meter({ value, done }: { value: number; done?: boolean }): React.JSX.Element {
  const filled = Math.round((value / 100) * METER_CELLS)
  return (
    <div className="flex w-[188px] items-center gap-0.5">
      {Array.from({ length: METER_CELLS }, (_, i) => (
        <span
          key={i}
          className={
            'h-2 flex-1 rounded-[1px] ' +
            (done ? 'bg-ok/50' : i < filled ? 'bg-accent' : 'bg-[#1c2026]')
          }
        />
      ))}
    </div>
  )
}

/** Shared, expandable track line used by both Download and History. */
export function TrackRow({
  variant,
  index,
  track,
  detail,
  actions
}: {
  variant: 'download' | 'history'
  index: number
  track: TrackRowData
  /** key→value pairs rendered in the expanded detail grid. */
  detail?: Record<string, string>
  /** Trailing hover actions (history variant). */
  actions?: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [cover, setCover] = useState<{ file: string; url: string | null } | null>(null)

  useEffect(() => {
    const file = track.file
    if (!file) return
    let active = true
    window.plucker.getCover(file).then((url) => active && setCover({ file, url }))
    return () => {
      active = false
    }
  }, [track.file])

  const coverUrl = cover && cover.file === track.file ? cover.url : null
  const subtitle =
    track.status === 'failed'
      ? (track.reason ?? t('status.failed'))
      : [track.artist, track.album, track.year].filter(Boolean).join(' · ')
  const failed = track.status === 'failed'

  const statusEl = (): React.JSX.Element => {
    if (track.status === 'done')
      return (
        <span className="flex w-16 items-center justify-end gap-1.5 font-mono text-[11px] text-ok">
          <Check size={13} strokeWidth={3} />
          {t('status.done').toUpperCase()}
        </span>
      )
    if (track.status === 'downloading')
      return (
        <span className="w-16 text-right font-mono text-[11px] text-accent">
          {Math.round(track.percent ?? 0)}%
        </span>
      )
    if (track.status === 'transforming')
      return (
        <span className="w-16 text-right font-mono text-[11px] text-accent">
          {Math.round(track.transformPercent ?? 0)}%
        </span>
      )
    return (
      <span className="w-16 text-right font-mono text-[11px] text-ink-faint">
        {t(`status.${track.status ?? 'queued'}`).toUpperCase()}
      </span>
    )
  }

  return (
    <div
      className={
        'border-b border-line2 ' +
        (variant === 'download' &&
        (track.status === 'downloading' || track.status === 'transforming')
          ? 'bg-accent-dim shadow-[inset_2px_0_0_var(--color-accent)]'
          : 'hover:bg-white/[0.018]')
      }
    >
      <div className="group flex h-12 items-center gap-3 pl-1.5 pr-4">
        <button
          aria-label="expand"
          onClick={() => setOpen((v) => !v)}
          className="flex h-12 w-[30px] items-center justify-center text-ink-faint hover:text-ink"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="w-[22px] text-center font-mono text-[11px] text-ink-faint">
          {String(index).padStart(2, '0')}
        </span>
        <div
          className={
            'flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-[5px] border bg-[#23272e] ' +
            (failed ? 'border-bad/30' : 'border-line')
          }
        >
          {coverUrl ? (
            <img src={coverUrl} alt={t('track.coverAlt')} className="h-full w-full object-cover" />
          ) : failed ? (
            <X size={15} className="text-bad" />
          ) : (
            <Music size={15} className="text-ink-faint" />
          )}
        </div>
        <button
          type="button"
          disabled={!track.file}
          onClick={() => track.file && window.plucker.revealFile(track.file)}
          className="min-w-0 flex-1 text-left disabled:cursor-default"
        >
          <div
            className={'truncate text-[13px] font-medium ' + (failed ? 'text-ink-dim' : 'text-ink')}
          >
            {track.title}
          </div>
          {subtitle && (
            <div className={'truncate text-[11px] ' + (failed ? 'text-bad' : 'text-ink-dim')}>
              {subtitle}
            </div>
          )}
        </button>

        {variant === 'download' ? (
          <>
            <Meter
              value={track.percent ?? (track.status === 'done' ? 100 : 0)}
              done={track.status === 'done'}
            />
            {statusEl()}
          </>
        ) : (
          <>
            <span className="w-12 text-right font-mono text-[11px] text-ink-faint">
              {track.duration ?? '—'}
            </span>
            {actions && (
              <div className="flex w-[84px] justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {actions}
              </div>
            )}
          </>
        )}
      </div>

      {open && detail && (
        <div className="grid grid-cols-4 gap-x-[22px] gap-y-3 bg-gradient-to-b from-accent-dim to-transparent px-4 pb-4 pl-[42px] pt-1">
          {Object.entries(detail).map(([k, v]) => (
            <div key={k}>
              <div className="mb-[3px] font-mono text-[9px] uppercase tracking-[1px] text-ink-faint">
                {k}
              </div>
              <div className="truncate font-mono text-[12px] text-ink">{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm test -- src/renderer/src/track-row.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/track-row.tsx src/renderer/src/track-row.test.tsx
git commit -m "feat: shared expandable track row with download/history variants"
```

---

## Phase 4 — Download view

### Task 8: Download view (command bar + browser + deck wiring)

**Files:**

- Modify: `src/renderer/src/download-view.tsx`

The view becomes controlled by `App` (progress + running). Match `download.html`: command
bar, column header, browser rows via `TrackRow variant="download"`.

- [ ] **Step 1: Rewrite `src/renderer/src/download-view.tsx`**

```tsx
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import type { JobProgress } from '../../shared/types'
import { TrackRow } from './track-row'

export function DownloadView({
  progress,
  onProgress,
  onRunningChange
}: {
  progress: JobProgress | null
  onProgress: (p: JobProgress | null) => void
  onRunningChange: (running: boolean) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  async function start(): Promise<void> {
    if (!url.trim()) return
    setBusy(true)
    onRunningChange(true)
    try {
      await window.plucker.startDownload(url.trim())
    } finally {
      setBusy(false)
      onRunningChange(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* command bar */}
      <div className="flex gap-2.5 border-b border-line bg-panel2 px-4 py-3">
        <div className="flex flex-1 items-center gap-2.5 rounded-[7px] border border-line bg-[#0a0b0e] px-3">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && start()}
            placeholder={t('download.urlPlaceholder')}
            className="h-9 w-full bg-transparent font-mono text-[12px] text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
        <button
          onClick={start}
          disabled={busy}
          className="flex h-9 items-center gap-[7px] rounded-[7px] bg-accent px-[22px] text-[13px] font-semibold text-white disabled:opacity-50"
        >
          <Download size={15} strokeWidth={2.2} />
          {busy ? t('download.plucking') : t('download.pluck')}
        </button>
      </div>

      {progress && (
        <>
          {/* column header */}
          <div className="flex items-center gap-3 border-b border-line bg-panel2 py-[7px] pl-[42px] pr-4 font-mono text-[9.5px] uppercase tracking-[1px] text-ink-faint">
            <span className="w-[22px]">#</span>
            <span className="flex-1">{t('download.colTrack')}</span>
            <span className="w-[188px]">{t('download.colProgress')}</span>
            <span className="w-16 text-right">{t('download.colStatus')}</span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {progress.tracks.map((tr) => (
              <TrackRow
                key={tr.index}
                variant="download"
                index={tr.index}
                track={tr}
                detail={{
                  [t('download.colSource')]: tr.videoId ? `youtube.com/watch?v=${tr.videoId}` : '—',
                  [t('download.colDest')]: tr.file ?? '—'
                }}
              />
            ))}
          </div>
        </>
      )}

      {!progress && (
        <div className="flex flex-1 items-center justify-center text-ink-faint">
          {t('download.emptyHint')}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS for `app.tsx` + `download-view.tsx` (History/Settings may still error until
their tasks — if executing in order, continue; the renderer compiles fully after Task 12).

- [ ] **Step 3: Run the app and compare to the mockup**

Run: `pnpm dev`, paste a playlist URL, click Pluck.
Expected: command bar, column header, rows with segmented meters, and the bottom deck
appear and update; layout matches `download.html`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/download-view.tsx src/renderer/src/app.tsx
git commit -m "feat: redesigned download view with browser and deck wiring"
```

---

## Phase 5 — History view

### Task 9: History view (search + job cards reusing `TrackRow`)

**Files:**

- Modify: `src/renderer/src/history-view.tsx`

Match `history.html`: optional search, job cards with header (cover, title, meta, status
badge, actions) and `TrackRow variant="history"` bodies. Failed-track state shown via
`track.status === 'failed'`.

- [ ] **Step 1: Rewrite `src/renderer/src/history-view.tsx`**

```tsx
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Music, Folder, RotateCw, Trash2, Search, Check } from 'lucide-react'
import type { HistoryEntry } from '../../shared/types'
import { TrackRow } from './track-row'

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export function HistoryView({
  onNavigateDownload
}: {
  onNavigateDownload: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    window.plucker.getHistory().then(setHistory)
    return window.plucker.onHistoryChanged(() => window.plucker.getHistory().then(setHistory))
  }, [])

  function redownload(url: string, folder: string): void {
    onNavigateDownload()
    window.plucker.startDownload(url, folder)
  }
  async function deleteEntry(id: string): Promise<void> {
    if (!window.confirm(t('actions.confirmDelete'))) return
    setHistory(await window.plucker.removeHistoryEntry(id, true))
  }
  async function deleteTrack(id: string, file: string): Promise<void> {
    if (!window.confirm(t('actions.confirmDelete'))) return
    setHistory(await window.plucker.removeHistoryTrack(id, file, true))
  }

  const filtered = history.filter((e) =>
    query.trim() ? e.title.toLowerCase().includes(query.trim().toLowerCase()) : true
  )

  if (history.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-ink-faint">
        {t('history.empty')}
      </div>
    )
  }

  const ra =
    'flex h-7 w-7 items-center justify-center rounded-md text-ink-faint hover:bg-raise hover:text-ink'
  const jbtn =
    'flex h-[30px] items-center gap-1.5 rounded-md border border-line bg-raise px-2.5 text-[12px] text-ink-dim hover:text-ink'

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-4 flex h-[34px] items-center gap-2.5 rounded-[7px] border border-line bg-[#0a0b0e] px-3 text-ink-faint">
        <Search size={14} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('history.search')}
          className="h-full w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-faint"
        />
      </div>

      {filtered.map((entry) => {
        const failed = entry.tracks.filter(
          (tk) => (tk as { status?: string }).status === 'failed'
        ).length
        return (
          <div
            key={entry.id}
            className="mb-3.5 overflow-hidden rounded-[10px] border border-line bg-panel2"
          >
            <div className="flex items-center gap-3 border-b border-line bg-panel px-3.5 py-[11px]">
              <button
                onClick={() => window.plucker.openFolder(entry.folder)}
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-md border border-line bg-[#23272e] text-ink-faint"
                title={t('actions.openFolder')}
              >
                <Music size={20} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-[#e7ebef]">
                  {entry.title}
                </div>
                <div className="mt-[3px] font-mono text-[10.5px] tracking-[0.3px] text-ink-faint">
                  {new Date(entry.completedAt).toLocaleString()} ·{' '}
                  {t('download.tracks', { count: entry.tracks.length })}
                </div>
              </div>
              {failed > 0 ? (
                <span className="rounded-md border border-warn/30 bg-warn/[0.08] px-[7px] py-[3px] font-mono text-[10px] text-warn">
                  {t('history.failedBadge', { count: failed })}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-md border border-ok/30 bg-ok/[0.08] px-[7px] py-[3px] font-mono text-[10px] text-ok">
                  <Check size={11} strokeWidth={3} />
                  {t('history.completeBadge')}
                </span>
              )}
              <div className="flex gap-1.5">
                <button className={jbtn} onClick={() => window.plucker.openFolder(entry.folder)}>
                  <Folder size={14} />
                  {t('actions.openFolder')}
                </button>
                <button className={jbtn} onClick={() => redownload(entry.url, entry.folder)}>
                  <RotateCw size={14} />
                  {t('actions.redownload')}
                </button>
                <button
                  className={
                    jbtn + ' w-[30px] justify-center px-0 hover:border-bad/40 hover:text-bad'
                  }
                  title={t('actions.delete')}
                  onClick={() => deleteEntry(entry.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {entry.tracks.map((tk, i) => (
              <TrackRow
                key={tk.file || i}
                variant="history"
                index={i + 1}
                track={tk}
                detail={{
                  [t('history.colFile')]: tk.file?.split('/').pop() ?? '—',
                  [t('download.colSource')]: tk.videoId ? watchUrl(tk.videoId) : '—'
                }}
                actions={
                  <>
                    <button
                      className={ra}
                      title={t('actions.reveal')}
                      onClick={() => tk.file && window.plucker.revealFile(tk.file)}
                    >
                      <Folder size={15} />
                    </button>
                    {tk.videoId && (
                      <button
                        className={ra}
                        title={t('actions.redownload')}
                        onClick={() => redownload(watchUrl(tk.videoId!), entry.folder)}
                      >
                        <RotateCw size={15} />
                      </button>
                    )}
                    <button
                      className={ra + ' hover:text-bad'}
                      title={t('actions.delete')}
                      onClick={() => deleteTrack(entry.id, tk.file)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                }
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
```

> `HistoryTrack` has no `status`/`duration` fields today; `TrackRow` treats them as
> optional, so completed history rows simply show no failure state and `—` for duration.
> The `failed` badge counts any tracks that carry a `status: 'failed'` (forward-compatible
> if history starts recording failures). No type change required.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS for `history-view.tsx`.

- [ ] **Step 3: Run the app and compare to the mockup**

Run: `pnpm dev` → History tab.
Expected: job cards with badges, hover row actions, expandable rows; matches `history.html`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/history-view.tsx
git commit -m "feat: redesigned history view reusing the track row component"
```

---

## Phase 6 — Settings

### Task 10: Themed schema-form fields

**Files:**

- Modify: `src/renderer/src/schema-form.tsx`

Keep the existing field-type logic (boolean/number/enum/text); restyle to the token system
and use the `Switch` primitive for booleans. Match the `.mcfg` area of `settings.html`.

- [ ] **Step 1: Rewrite `src/renderer/src/schema-form.tsx`**

```tsx
import React from 'react'
import type { ConfigField } from '../../shared/transforms'
import { Switch } from './ui/switch'

export function SchemaForm({
  fields,
  config,
  onChange,
  t
}: {
  fields: ConfigField[]
  config: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  t: (key: string) => string
}): React.JSX.Element {
  const set = (key: string, value: unknown): void => onChange({ ...config, [key]: value })
  const klass = 'mb-[5px] font-mono text-[9px] uppercase tracking-[1px] text-ink-faint'
  const input =
    'flex h-[30px] items-center rounded-md border border-line bg-[#0a0b0e] px-2.5 font-mono text-[12px] text-ink outline-none'

  return (
    <div className="grid grid-cols-2 gap-x-[18px] gap-y-3 px-3.5 pb-3.5 pl-[41px]">
      {fields.map((f) => {
        const value = config[f.key] ?? f.default
        const label = t(f.labelKey)
        if (f.type === 'boolean') {
          return (
            <label key={f.key} className="flex items-center gap-2.5">
              <Switch checked={Boolean(value)} onChange={(v) => set(f.key, v)} label={label} />
              <span className="text-[12.5px] text-ink">{label}</span>
            </label>
          )
        }
        if (f.type === 'number') {
          return (
            <div key={f.key}>
              <div className={klass}>{label}</div>
              <input
                type="number"
                className={input + ' w-full'}
                value={Number(value)}
                min={f.min}
                max={f.max}
                onChange={(e) => set(f.key, Number(e.target.value))}
              />
            </div>
          )
        }
        if (f.type === 'enum') {
          return (
            <div key={f.key}>
              <div className={klass}>{label}</div>
              <select
                className={input + ' pl-select w-full'}
                value={String(value)}
                onChange={(e) => set(f.key, e.target.value)}
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          )
        }
        return (
          <div key={f.key}>
            <div className={klass}>{label}</div>
            <input
              className={input + ' w-full'}
              value={String(value)}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify existing schema-form test still passes**

Run: `pnpm test -- src/renderer/src/schema-form.test.tsx`
Expected: PASS. If the test asserts on the old checkbox markup, update the assertion to
query by `role="switch"` / label text (booleans now use `Switch`). Keep behavior identical.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/schema-form.tsx src/renderer/src/schema-form.test.tsx
git commit -m "refactor: theme schema-form fields with design tokens"
```

---

### Task 11: Transform chain as an insert rack

**Files:**

- Modify: `src/renderer/src/transforms-section.tsx`

Preserve all behavior (enable, reorder via `move`, add via `addInstance`/`canAdd`, remove,
config via `SchemaForm`). Restyle as module strips. Match the Transform Chain panel in
`settings.html`. Keep ↑/↓ buttons (accessible) and add a grip glyph for visual affordance;
real drag-and-drop is optional polish, out of scope here.

- [ ] **Step 1: Rewrite `src/renderer/src/transforms-section.tsx`**

```tsx
import React, { useState } from 'react'
import { GripVertical, ChevronUp, ChevronDown, X, Plus } from 'lucide-react'
import type { TransformInstance, TransformManifest } from '../../shared/transforms'
import { SchemaForm } from './schema-form'
import { Switch } from './ui/switch'
import { move, addInstance, canAdd } from './transform-list-utils'

export function TransformsSection({
  instances,
  catalog,
  onChange,
  t
}: {
  instances: TransformInstance[]
  catalog: TransformManifest[]
  onChange: (next: TransformInstance[]) => void
  t: (key: string) => string
}): React.JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const byType = (type: string): TransformManifest | undefined =>
    catalog.find((m) => m.type === type)
  const newId = (): string => crypto.randomUUID()
  const update = (id: string, patch: Partial<TransformInstance>): void =>
    onChange(instances.map((i) => (i.instanceId === id ? { ...i, ...patch } : i)))

  const tool =
    'flex h-7 w-7 items-center justify-center rounded-md text-ink-faint hover:bg-raise hover:text-ink'

  return (
    <div>
      {instances.map((inst, idx) => {
        const manifest = byType(inst.type)
        const label = manifest ? t(manifest.labelKey) : inst.type
        const isOpen = open === inst.instanceId
        return (
          <div key={inst.instanceId} className="border-b border-line2">
            <div className="flex items-center gap-[11px] px-3.5 py-[11px]">
              <span className="flex cursor-grab text-ink-faint">
                <GripVertical size={14} />
              </span>
              <span className="w-4 font-mono text-[10px] text-ink-faint">{idx + 1}</span>
              <Switch
                checked={inst.enabled}
                onChange={(v) => update(inst.instanceId, { enabled: v })}
                label={label}
              />
              <span
                className={
                  'flex-1 text-[13px] font-medium ' + (inst.enabled ? 'text-ink' : 'text-ink-faint')
                }
              >
                {label}
              </span>
              <div className="flex gap-0.5">
                <button
                  aria-label="up"
                  className={tool}
                  onClick={() => onChange(move(instances, idx, idx - 1))}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  aria-label="down"
                  className={tool}
                  onClick={() => onChange(move(instances, idx, idx + 1))}
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  aria-label="configure"
                  className={tool + (isOpen ? ' text-accent' : '')}
                  onClick={() => setOpen(isOpen ? null : inst.instanceId)}
                >
                  <ChevronDown size={15} />
                </button>
                <button
                  aria-label="remove"
                  className={tool + ' hover:text-bad'}
                  onClick={() =>
                    onChange(instances.filter((i) => i.instanceId !== inst.instanceId))
                  }
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            {isOpen && manifest && (
              <SchemaForm
                fields={manifest.configSchema}
                config={inst.config}
                onChange={(config) => update(inst.instanceId, { config })}
                t={t}
              />
            )}
          </div>
        )
      })}

      <label className="m-3.5 flex h-10 cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-dashed border-line font-mono text-[12px] tracking-[0.5px] text-ink-faint hover:border-accent hover:text-accent">
        <Plus size={14} />
        {t('settings.transforms.add')}
        <select
          className="absolute h-10 w-[calc(100%-1.75rem)] cursor-pointer opacity-0"
          value=""
          onChange={(e) => {
            const m = byType(e.target.value)
            if (m) onChange(addInstance(instances, m, newId))
          }}
        >
          <option value="" />
          {catalog.map((m) => (
            <option key={m.type} value={m.type} disabled={!canAdd(instances, m)}>
              {t(m.labelKey)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
```

- [ ] **Step 2: Verify the existing transforms-section test still passes**

Run: `pnpm test -- src/renderer/src/transforms-section.test.tsx`
Expected: PASS. If it queries the old `▲/▼/⚙/✕` glyphs or checkbox, update the queries to
`getByLabelText('up'|'down'|'configure'|'remove')` and `role="switch"`. Behavior (move,
add, remove, enable, config) is unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/transforms-section.tsx src/renderer/src/transforms-section.test.tsx
git commit -m "feat: render transform chain as a DAW insert rack"
```

---

### Task 12: Settings as a full-page preferences rack

**Files:**

- Modify: `src/renderer/src/settings-panel.tsx`

Convert the right-side slide-over into a full-page rack using `Panel`/`PanelRow`,
`Segmented`, `Switch`, `Stepper`, themed selects, and the rack from Task 11. Add a sticky
save bar. Match `settings.html`. Keep the exact settings surface and save/close behavior.

- [ ] **Step 1: Rewrite `src/renderer/src/settings-panel.tsx`**

```tsx
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Globe,
  Download as DownloadIcon,
  AudioLines,
  Cookie,
  Blocks,
  Gauge,
  RefreshCw
} from 'lucide-react'
import type { Settings, Bitrate, MinBitrate, CookieSource, Language } from '../../shared/types'
import type { TransformManifest } from '../../shared/transforms'
import { TransformsSection } from './transforms-section'
import { Panel, PanelRow } from './ui/panel'
import { Switch } from './ui/switch'
import { Segmented } from './ui/segmented'
import { Stepper } from './ui/stepper'
import { applyLanguage } from './i18n'
import { version as appVersion } from '../../../package.json'

const BITRATES: Bitrate[] = [320, 256, 192, 128]
const MIN_BITRATES: MinBitrate[] = [64, 96, 128, 160]
const SOURCES: CookieSource[] = ['auto', 'none', 'chrome', 'edge', 'safari', 'firefox', 'brave']
const LANGUAGES: Language[] = ['system', 'en', 'de']

export function SettingsPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const [s, setS] = useState<Settings | null>(null)
  const [catalog, setCatalog] = useState<TransformManifest[]>([])
  useEffect(() => {
    window.plucker.getSettings().then(setS)
    window.plucker.getTransformCatalog().then(setCatalog)
  }, [])
  if (!s) return <div />

  const set = (patch: Partial<Settings>): void => setS({ ...s, ...patch })
  async function save(): Promise<void> {
    if (!s) return
    await window.plucker.saveSettings(s)
    await applyLanguage(s.language)
    onClose()
  }
  async function chooseFolder(): Promise<void> {
    const f = await window.plucker.chooseFolder()
    if (f) set({ downloads: { ...s!.downloads, baseFolder: f } })
  }

  const cookieLabel = (src: CookieSource): string =>
    src === 'auto' ? t('settings.cookies.auto') : src === 'none' ? t('settings.cookies.none') : src
  const languageLabel = (lang: Language): string =>
    lang === 'system' ? t('settings.language.system') : lang === 'de' ? 'Deutsch' : 'English'
  const sel =
    'pl-select h-8 rounded-md border border-line bg-[#0a0b0e] pl-[11px] text-[12.5px] text-ink outline-none'

  return (
    <div className="relative h-full">
      <div className="h-full overflow-auto px-5 pb-[90px] pt-[18px]">
        <h1 className="mb-4 text-[19px] font-semibold text-[#e7ebef]">{t('settings.title')}</h1>

        <Panel icon={Globe} title={t('settings.sections.language')}>
          <PanelRow name={t('settings.language.label')} desc={t('settings.language.desc')}>
            <select
              className={sel}
              value={s.language}
              onChange={(e) => set({ language: e.target.value as Language })}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {languageLabel(l)}
                </option>
              ))}
            </select>
          </PanelRow>
        </Panel>

        <Panel icon={DownloadIcon} title={t('settings.sections.downloads')}>
          <PanelRow name={t('settings.downloads.folder')} desc={t('settings.downloads.folderDesc')}>
            <div className="flex max-w-[420px] flex-1 items-center gap-2">
              <div className="flex h-8 flex-1 items-center truncate rounded-md border border-line bg-[#0a0b0e] px-[11px] font-mono text-[11.5px] text-ink-dim">
                {s.downloads.baseFolder}
              </div>
              <button
                onClick={chooseFolder}
                className="h-8 rounded-md border border-line bg-raise px-[13px] text-[12px] text-ink-dim hover:text-ink"
              >
                {t('settings.downloads.choose')}
              </button>
            </div>
          </PanelRow>
          <PanelRow
            name={t('settings.downloads.perPlaylistSubfolder')}
            desc={t('settings.downloads.subfolderDesc')}
          >
            <Switch
              checked={s.downloads.perPlaylistSubfolder}
              onChange={(v) => set({ downloads: { ...s.downloads, perPlaylistSubfolder: v } })}
            />
          </PanelRow>
        </Panel>

        <Panel icon={AudioLines} title={t('settings.sections.audio')}>
          <PanelRow
            name={t('settings.audio.preferredBitrate')}
            desc={t('settings.audio.preferredDesc')}
          >
            <Segmented
              options={BITRATES.map((b) => ({ value: b, label: String(b) }))}
              value={s.audio.preferredBitrate}
              onChange={(b) => set({ audio: { ...s.audio, preferredBitrate: b } })}
            />
          </PanelRow>
          <PanelRow name={t('settings.audio.minQuality')} desc={t('settings.audio.minDesc')}>
            <select
              className={sel}
              value={s.audio.minBitrate ?? ''}
              onChange={(e) =>
                set({
                  audio: {
                    ...s.audio,
                    minBitrate: e.target.value ? (Number(e.target.value) as MinBitrate) : null
                  }
                })
              }
            >
              <option value="">{t('settings.audio.off')}</option>
              {MIN_BITRATES.map((b) => (
                <option key={b} value={b}>
                  {b}K
                </option>
              ))}
            </select>
          </PanelRow>
        </Panel>

        <Panel icon={Cookie} title={t('settings.sections.cookies')}>
          <PanelRow name={t('settings.cookies.label')} desc={t('settings.cookies.desc')}>
            <select
              className={sel}
              value={s.cookies.source}
              onChange={(e) => set({ cookies: { source: e.target.value as CookieSource } })}
            >
              {SOURCES.map((src) => (
                <option key={src} value={src}>
                  {cookieLabel(src)}
                </option>
              ))}
            </select>
          </PanelRow>
        </Panel>

        <Panel
          icon={Blocks}
          title={t('settings.sections.transforms')}
          aside={t('settings.transforms.runsNote')}
        >
          <TransformsSection
            instances={s.transforms}
            catalog={catalog}
            onChange={(transforms) => set({ transforms })}
            t={(key) => t(key as never)}
          />
        </Panel>

        <Panel icon={Gauge} title={t('settings.sections.performance')}>
          <PanelRow
            name={t('settings.performance.parallel')}
            desc={t('settings.performance.parallelDesc')}
          >
            <Stepper
              value={s.performance.parallel}
              min={1}
              max={16}
              onChange={(n) => set({ performance: { parallel: n } })}
            />
          </PanelRow>
        </Panel>

        <Panel icon={RefreshCw} title={t('settings.sections.updates')}>
          <PanelRow
            name={t('settings.updates.checkOnLaunch')}
            desc={t('settings.updates.desc', { version: appVersion })}
          >
            <Switch
              checked={s.updates.checkOnLaunch}
              onChange={(v) => set({ updates: { ...s.updates, checkOnLaunch: v } })}
            />
          </PanelRow>
        </Panel>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2.5 border-t border-line bg-panel px-5 py-3">
        <button
          onClick={onClose}
          className="h-[34px] rounded-md border border-line px-4 text-[13px] text-ink-dim"
        >
          {t('settings.cancel')}
        </button>
        <button
          onClick={save}
          className="h-[34px] rounded-md bg-accent px-5 text-[13px] font-semibold text-white"
        >
          {t('settings.save')}
        </button>
      </div>
    </div>
  )
}
```

> `appVersion` import: the main process already imports `version` from `../../package.json`.
> For the renderer, `electron-vite`/Vite allows importing JSON; the relative path from
> `src/renderer/src/` to the repo root `package.json` is `../../../package.json`. If Vite
> rejects deep JSON imports, fall back to surfacing the version via an existing/desktop IPC
> or hardcode the label without the version. Verify in Step 2.

- [ ] **Step 2: Typecheck and run**

Run: `pnpm typecheck`
Expected: PASS. Then `pnpm dev` → Settings: a full-page rack matching `settings.html`,
with working language/folder/bitrate/min/cookies/transform-chain/parallel/updates controls
and a sticky Cancel / Save bar. Confirm Save persists and closes.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/settings-panel.tsx
git commit -m "feat: full-page settings rack with themed controls"
```

---

## Phase 7 — i18n, cleanup, verification

### Task 13: i18n labels (en + de)

**Files:**

- Modify: `src/renderer/src/i18n/locales/en.ts`, `src/renderer/src/i18n/locales/de.ts`

- [ ] **Step 1: Add the new keys to `en.ts`**

Merge these into the existing default-export object (preserving structure):

```ts
  deck: {
    nowPlucking: 'NOW PLUCKING',
    jobProgress: 'JOB PROGRESS',
    tracks: 'TRACKS'
  },
  // download.* — add to the existing download block:
  // colTrack: 'TRACK', colProgress: 'PROGRESS', colStatus: 'STATUS',
  // colSource: 'SOURCE', colDest: 'DESTINATION',
  // emptyHint: 'Paste a playlist or video URL above and press Pluck.'
  // history.* — add: search: 'Search history…', completeBadge: 'COMPLETE',
  //   failedBadge_one: '{{count}} FAILED', failedBadge_other: '{{count}} FAILED',
  //   colFile: 'FILE'
  // settings.* — add the label/desc keys referenced in settings-panel.tsx:
  //   language.label/desc, downloads.folder/folderDesc/subfolderDesc,
  //   audio.preferredDesc/minDesc, cookies.label/desc, transforms.runsNote,
  //   performance.parallelDesc, updates.desc ('… · current v{{version}}'),
  //   cancel: 'Cancel', save: 'Save changes'
```

Add each as a real key/value (no comments) under the correct nested block. Example for the
new `download` keys:

```ts
  download: {
    urlLabel: 'Paste a YouTube playlist or video URL',
    urlPlaceholder: 'https://youtube.com/playlist…',
    pluck: 'Pluck',
    plucking: 'Plucking…',
    cancel: 'Cancel',
    clear: 'Clear',
    colTrack: 'TRACK',
    colProgress: 'PROGRESS',
    colStatus: 'STATUS',
    colSource: 'SOURCE',
    colDest: 'DESTINATION',
    emptyHint: 'Paste a playlist or video URL above and press Pluck.',
    tracks_one: '{{count}} track',
    tracks_other: '{{count}} tracks'
  },
```

- [ ] **Step 2: Add the same keys to `de.ts` with German translations**

e.g. `deck: { nowPlucking: 'WIRD GEPFLÜCKT', jobProgress: 'FORTSCHRITT', tracks: 'TITEL' }`,
`history.search: 'Verlauf durchsuchen…'`, `settings.save: 'Änderungen speichern'`,
`settings.cancel: 'Abbrechen'`, etc. Keep keys identical to `en.ts`.

- [ ] **Step 3: Verify i18n tests pass (they assert en/de key parity)**

Run: `pnpm test -- src/renderer/src/i18n`
Expected: PASS. If a parity test fails, it lists the missing key — add it to the other
locale.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/i18n/locales/en.ts src/renderer/src/i18n/locales/de.ts
git commit -m "feat(i18n): labels for redesigned views, deck, and settings"
```

---

### Task 14: Final verification pass

**Files:** none (verification + any cleanup found).

- [ ] **Step 1: Grep for leftover emojis in the renderer**

Run:

```bash
grep -RnP "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2190}-\x{21FF}\x{2300}-\x{23FF}]" src/renderer/src || echo "no emojis found"
```

Expected: `no emojis found`. Replace any stragglers with Lucide icons.

- [ ] **Step 2: Full typecheck**

Run: `pnpm typecheck`
Expected: PASS (node + web).

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: PASS (fix any unused imports left from the old components).

- [ ] **Step 4: Full test suite**

Run: `pnpm test`
Expected: PASS (existing + new tests).

- [ ] **Step 5: Manual run-through against all three mockups**

Run: `pnpm dev`. Verify against `.specs/redesign/mockups/`:

- Download: toolbar tabs, command bar, browser rows + segmented meters, expandable detail, bottom deck appears/cancels.
- History: search, job cards + badges, hover actions, expandable rows, failed-track styling.
- Settings: full-page rack, segmented bitrate, switches, stepper, transform insert rack (reorder/add/remove/config), save bar.
- Change the OS accent color → UI accent follows live.

- [ ] **Step 6: Commit any cleanup**

```bash
git add -A
git commit -m "chore: redesign cleanup and verification fixes"
```

---

## Self-Review notes (author)

- **Spec coverage:** theme/always-dark (Task 1), system accent + util (Task 2), Geist fonts
  (Task 1), Lucide icons (all view tasks + Task 14 grep), labeled tabs + settings button
  (Task 4), persistent contextual deck without playback (Tasks 5–6), shared expandable
  TrackRow with download/history variants and segmented meter — no waveform (Task 7),
  command bar/browser (Task 8), history job cards reusing TrackRow (Task 9), settings rack
  - transform insert rack covering the full settings surface (Tasks 10–12), i18n (Task 13).
- **THRUPUT meter** from the mockups is intentionally deferred/optional (design spec marks
  it droppable); not wired in this plan to avoid inventing an aggregate-activity signal.
  Add later if desired.
- **Ordering caveat:** Tasks 4 and 6 reference each other's APIs; the renderer fully
  compiles only after Task 8 (download), Task 9 (history), and Task 12 (settings). When
  executing strictly task-by-task, expect transient typecheck errors between Task 4 and
  Task 12; the per-task commits are still cohesive. If you require a green typecheck at
  every commit, batch Tasks 4–12 behind a single checkpoint.
- **Test env:** `.tsx` component tests assume the repo's existing jsdom Vitest setup (used
  by `schema-form.test.tsx`). Confirm `@testing-library/react` is installed (Task 5 note).
