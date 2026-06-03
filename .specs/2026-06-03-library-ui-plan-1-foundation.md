# Library UI — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the shared, design-independent groundwork the rest of the Library UI redesign depends on — a generic `Button` primitive, the Library nav icon, and an optional-waveform switch on the reusable metadata visualizer.

**Architecture:** Three small, isolated renderer changes. No main-process or IPC work. Each is behavior-preserving or additive, so nothing downstream breaks and the app keeps working after every task. Later plans (Gallery, Collection page, Editor + Version graph, Audio preview + Activity + Export) build on these.

**Tech Stack:** TypeScript, React 19, electron-vite renderer, Tailwind v4 (`@theme` tokens in `src/renderer/src/index.css`), `lucide-react`, Vitest + `react-dom/server` `renderToStaticMarkup` (the repo's renderer test style). Commands via **pnpm** only.

**Spec:** `.specs/2026-06-03-library-page-ui-design.md` (§8 generic button, §2 nav rename, §6 metadata drawer).

**Commit types:** these are internal groundwork not yet wired into a user-facing surface, so they use non-bumping types (`chore`/`refactor`); the later user-facing Library surfaces commit as `feat`.

---

## File Structure

- **Create** `src/renderer/src/ui/button.tsx` — the single reusable button (`default` | `primary` variants), matching the existing Settings/tag-edit button styling. One responsibility: a styled `<button>` pass-through.
- **Create** `src/renderer/src/ui/button.test.tsx` — colocated test.
- **Modify** `src/renderer/src/header.tsx` — swap the clock `History` icon on the Library tab for a library icon. (Label already reads "Library" via `nav.history`.)
- **Modify** `src/renderer/src/ui/meta/track-detail.tsx` — add a `showWaveform?: boolean` prop (default `true`) so the editor can reuse the visualizer without its waveform.
- **Modify** `src/renderer/src/ui/meta/track-detail.test.tsx` — add a case proving the waveform is suppressed when `showWaveform={false}`.

---

## Task 1: Generic `Button` primitive

**Files:**
- Create: `src/renderer/src/ui/button.tsx`
- Test: `src/renderer/src/ui/button.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/src/ui/button.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from './button'

describe('Button', () => {
  it('renders a default (raise + line) button with its label', () => {
    const html = renderToStaticMarkup(<Button>Rename</Button>)
    expect(html).toContain('Rename')
    expect(html).toContain('bg-raise')
    expect(html).toContain('border-line')
    expect(html).not.toContain('bg-accent')
  })

  it('renders a flat-accent primary variant', () => {
    const html = renderToStaticMarkup(<Button variant="primary">Apply transforms</Button>)
    expect(html).toContain('Apply transforms')
    expect(html).toContain('bg-accent')
  })

  it('forwards native button props (onClick type, disabled) and extra classes', () => {
    const html = renderToStaticMarkup(
      <Button disabled className="ml-2">
        Export
      </Button>
    )
    expect(html).toContain('disabled')
    expect(html).toContain('ml-2')
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/renderer/src/ui/button.test.tsx`
Expected: FAIL — cannot resolve `./button`.

- [ ] **Step 3: Implement the button**

```tsx
// src/renderer/src/ui/button.tsx
import React from 'react'

/**
 * The app's single reusable button. Two variants matching the existing
 * Settings / tag-edit buttons:
 *  - default: bordered raise surface, dim ink that brightens on hover
 *  - primary: flat accent fill, white label
 * Pass-through for all native <button> props; extra `className` is appended.
 */
export function Button({
  variant = 'default',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary'
}): React.JSX.Element {
  const base =
    'inline-flex h-[30px] items-center gap-1.5 rounded-md px-3.5 text-[12.5px] font-medium transition-colors disabled:cursor-default disabled:opacity-50'
  const variantCls =
    variant === 'primary'
      ? 'bg-accent font-semibold text-white hover:brightness-110'
      : 'border border-line bg-raise text-ink-dim hover:text-ink'
  return <button className={`${base} ${variantCls} ${className}`.trim()} {...props} />
}
```

- [ ] **Step 4: Run it (expect pass) + typecheck**

Run: `pnpm test -- src/renderer/src/ui/button.test.tsx && pnpm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/ui/button.tsx src/renderer/src/ui/button.test.tsx
git commit -m "chore(ui): add reusable Button primitive"
```

---

## Task 2: Library nav icon

The Library tab already shows the label "Library" (`nav.history: 'Library'` in `en.ts` / `'Bibliothek'` in `de.ts`). Only the icon is still a clock. Swap it for a library icon.

**Files:**
- Modify: `src/renderer/src/header.tsx`

- [ ] **Step 1: Swap the icon import**

In `src/renderer/src/header.tsx`, change the lucide import (line ~3-9) from `History as HistoryIcon` to `Library`:

```tsx
import {
  Download,
  Library,
  SlidersHorizontal,
  Terminal,
  type LucideIcon
} from 'lucide-react'
```

- [ ] **Step 2: Use it on the Library tab**

In the same file, change the tab call (currently `tab('history', t('nav.history'), HistoryIcon)`) to use `Library`:

```tsx
        {tab('download', t('nav.download'), Download)}
        {tab('history', t('nav.history'), Library)}
```

(Leave the internal view id `'history'` unchanged — only the icon changes. A later plan may rename the `View` union.)

- [ ] **Step 3: Verify nothing broke**

Run: `pnpm run typecheck && pnpm test -- src/renderer/src`
Expected: typecheck PASS; existing renderer tests PASS (no test asserts the clock icon).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/header.tsx
git commit -m "refactor: use a library icon for the Library nav tab"
```

---

## Task 3: Optional waveform on `TrackDetail`

The editor reuses `TrackDetail` as its metadata drawer but must omit the waveform (already shown in the player). Add a `showWaveform` prop (default `true`, so every current caller is unchanged).

**Files:**
- Modify: `src/renderer/src/ui/meta/track-detail.tsx`
- Test: `src/renderer/src/ui/meta/track-detail.test.tsx`

- [ ] **Step 1: Add the failing test**

Append this case inside the existing `describe('TrackDetail', …)` block in `src/renderer/src/ui/meta/track-detail.test.tsx`:

```tsx
  it('omits the waveform when showWaveform is false, even if peaks are provided', () => {
    const wf: Waveform = { peaks: Array.from({ length: 120 }, () => 0.5), durationSec: 243 }
    const html = renderToStaticMarkup(<TrackDetail meta={META} waveform={wf} showWaveform={false} />)
    expect(html).not.toContain('data-wave-bar')
  })
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/renderer/src/ui/meta/track-detail.test.tsx`
Expected: FAIL — `showWaveform` is not a prop yet, so the waveform still renders (`data-wave-bar` present) and the assertion fails. (TypeScript will also flag the unknown prop.)

- [ ] **Step 3: Add the prop and guard the strip**

In `src/renderer/src/ui/meta/track-detail.tsx`, add `showWaveform` to the destructured props and its type:

```tsx
export function TrackDetail({
  meta,
  source,
  file,
  state = 'ready',
  editing = false,
  onSave,
  onCancel,
  onOpenExternal,
  waveform,
  showWaveform = true,
  onContextMenu
}: {
  meta: TrackMetadata | null
  source?: TrackSource
  file?: string
  state?: 'loading' | 'ready' | 'unavailable'
  editing?: boolean
  onSave?: (tags: TrackTags) => void
  onCancel?: () => void
  onOpenExternal?: (url: string) => void
  waveform?: Waveform
  /** When false, the waveform strip is suppressed even if peaks are supplied
   *  (e.g. the editor, which shows the waveform in its player instead). */
  showWaveform?: boolean
  onContextMenu?: (e: React.MouseEvent) => void
}): React.JSX.Element {
```

Then change the strip guard near the end of the non-editing return from:

```tsx
      {waveform && (
        <WaveformStrip
```

to:

```tsx
      {showWaveform && waveform && (
        <WaveformStrip
```

- [ ] **Step 4: Run it (expect pass) + full meta suite + typecheck**

Run: `pnpm test -- src/renderer/src/ui/meta/track-detail.test.tsx && pnpm run typecheck`
Expected: PASS (the new case passes; the existing waveform-present/absent/edit cases still pass because the default is `true`).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/ui/meta/track-detail.tsx src/renderer/src/ui/meta/track-detail.test.tsx
git commit -m "refactor(meta): allow TrackDetail to suppress its waveform strip"
```

---

## Final verification

- [ ] **Step 1: Whole suite + typecheck + lint**

Run: `pnpm run lint && pnpm run typecheck && pnpm test`
Expected: all PASS.

---

## Self-Review

**Spec coverage (this plan's slice):**
- §8 generic button → Task 1.
- §2 nav rename (label already done; icon) → Task 2.
- §6 editor metadata drawer "omits the `WaveformStrip`" → Task 3 (the mechanism; the editor wires it in Plan 4).

**Placeholder scan:** none — every step has exact files, code, commands, and expected output.

**Type consistency:** `Button` props are `React.ButtonHTMLAttributes<HTMLButtonElement> & { variant }`; the test only relies on `variant` + native props. `showWaveform?: boolean` added to `TrackDetail`'s inline prop type and destructure; default `true` preserves all existing call sites (`track-row.tsx`, the editor will pass `false`). `Library` is a valid `lucide-react` export.

**Not in this plan (deliberately):** the Gallery, Collection page, Editor, Version graph, the `plucker-audio://` protocol, the `audioPreviews` setting, the Activity dock, and Export — each is its own plan below.

---

## Roadmap — subsequent plans

Each is a separate, independently-shippable plan, authored when reached (so the main-process signatures are read and quoted accurately rather than guessed):

- **Plan 2 — Gallery:** `library-view.tsx` → collections grid (T1 cinematic tiles, 2×2 playlist cover mosaic, search + `Recent/A–Z/Kind` sort, hover lift + Export/Delete chips, empty/loading). The **hover waveform visual** (bloom + scroll, reduced-motion static) using real peaks. Requires new library IPC to fetch a track's **cover** and **waveform peaks** by `trackId`/version hash (reusing the existing cover/waveform machinery against blob paths) — read `src/main/index.ts`, `src/main/library/service.ts`, `src/preload/index.ts` first.
- **Plan 3 — Collection page:** new `library/collection-view.tsx` (cinematic hero from cover/mosaic, dense `track-row`-style rows, version/branch chips), and the gallery→collection→editor routing state in `app.tsx`.
- **Plan 4 — Editor + version graph:** rework `track-editor.tsx` (unified eyebrow→title→identity header, real player/transport, the metadata pull-tab drawer using `TrackDetail showWaveform={false}`, recipe line, `Button`-based action bar, inline branch-name input replacing `window.prompt`); rebuild `version-graph.tsx` as the **collision-proof grid** git-graph of waveform cards (column=depth, row=branch lane, colored fork edges, branch refs, fading intro).
- **Plan 5 — Audio preview + Activity + Export:** the `plucker-audio://<hash>` protocol + blob resolution; the `audioPreviews` setting (default on) + Settings toggle; a shared `library/preview-player.ts` engine (220 ms intent, single active, eased fades, rAF scroll synced to `currentTime`) wired into gallery tiles + track rows; the collapsible Activity dock; the export confirmation toast.

---

## Execution Handoff

Plan complete and saved to `.specs/2026-06-03-library-ui-plan-1-foundation.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task with review between tasks.
2. **Inline Execution** — execute the three tasks in this session with checkpoints.

Which approach?
