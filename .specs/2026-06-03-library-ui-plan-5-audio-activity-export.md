# Library UI — Plan 5: Audio Preview + Activity Dock + Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the headline **hover audio preview** feature (real playback, waveform synced to playback, on by default with a Settings toggle), wire playback into the gallery tiles, track rows, and the editor transport, and finish the two remaining surfaces — the collapsible **Activity dock** and the **export confirmation toast**.

**Architecture:** A privileged `plucker-audio://<hash>` scheme in main streams a blob (range-capable) so the renderer can play it. A single shared **preview engine** (one `HTMLAudioElement`, hover-intent, single-active, eased fades, rAF position) drives every preview; the same engine powers the editor's transport. An `audioPreviews` setting (default on) gates it. Activity becomes a bottom dock; export shows a transient toast.

**Tech Stack:** TypeScript, Electron `protocol`/`net`, React 19, Web Audio via `<audio>`, Tailwind v4. **pnpm only.** Behaviour source of truth: `.superpowers/brainstorm/13600-1780446128/content/gallery-live-audio-v3.html` (fades, 220 ms intent, single-active, scroll-synced).

**Spec:** `.specs/2026-06-03-library-page-ui-design.md` §4 (audio preview), §6 (editor transport), §9 (activity dock), §10 (export), §12 (motion/a11y).

**Depends on:** Plans 1–4.

---

## File Structure

- **Modify** `src/shared/types.ts` (Settings), `src/shared/defaults.ts`, `src/main/settings.ts` (`mergeDefaults`) — add `library.audioPreviews`.
- **Modify** `src/renderer/src/settings-panel.tsx` + i18n — the "Audio previews" toggle.
- **Modify** `src/main/index.ts` — register the `plucker-audio` scheme (module scope) + `protocol.handle` (in `registerIpc`).
- **Create** `src/renderer/src/library/preview-settings.ts` — renderer cache of the `audioPreviews` flag.
- **Create** `src/renderer/src/library/preview-player.ts` (+ `.test.ts` for pure helpers) — the shared preview/transport engine.
- **Modify** `collection-tile.tsx` + `collection-waveform.tsx` — hover plays audio + scrolls in sync (gated).
- **Modify** `library-track-row.tsx` — hover preview with a synced mini waveform.
- **Modify** `editor-player.tsx` — real transport (play/pause + moving playhead).
- **Create** `src/renderer/src/library/activity-dock.tsx` (+ `.test.tsx`) — collapsible bottom dock; replace inline `ActivityLog` in `app.tsx`.
- **Create** `src/renderer/src/ui/toast.tsx` — minimal transient toast; wire export completion in `app.tsx`.

---

## Task 1: `audioPreviews` setting + toggle

**Files:** `src/shared/types.ts`, `src/shared/defaults.ts`, `src/main/settings.ts`, `src/renderer/src/settings-panel.tsx`, i18n.

- [ ] **Step 1: Type + default + merge**

In `src/shared/types.ts`, add to the `Settings` interface (after `updates`):

```ts
  /** Library hover audio previews (on by default; disable to silence the gallery). */
  library: { audioPreviews: boolean }
```

In `src/shared/defaults.ts`, add to `DEFAULT_SETTINGS` (after `updates`):

```ts
  library: { audioPreviews: true },
```

In `src/main/settings.ts` `mergeDefaults` (the object it returns, ~lines 63-85), add:

```ts
    library: { ...d.library, ...(p.library ?? {}) },
```

This back-fills the group for existing configs (no `version` bump needed).

- [ ] **Step 2: Settings panel toggle**

In `src/renderer/src/settings-panel.tsx`, mirror the existing `perPlaylistSubfolder` Switch row (the `Panel`/`PanelRow`/`Switch` at ~lines 165-173). Add inside the **audio** `Panel` (`title={t('settings.sections.audio')}`) a new row:

```tsx
          <PanelRow name={t('settings.audio.previews')} desc={t('settings.audio.previewsDesc')}>
            <Switch
              checked={settings.library.audioPreviews}
              onChange={(v) => update({ library: { ...settings.library, audioPreviews: v } })}
            />
          </PanelRow>
```

(Use whatever the file names its settings object + setter — match the `perPlaylistSubfolder` row exactly; `settings`/`update` here stand in for that pattern.)

- [ ] **Step 3: i18n**

Add `settings.audio.previews: 'Audio previews'`, `settings.audio.previewsDesc: 'Play a short snippet when you hover a collection or track.'` (en) + German.

- [ ] **Step 4: Verify + commit**

Run: `pnpm run typecheck && pnpm test`
Expected: PASS (existing `settings`/`defaults` tests still pass; `mergeDefaults` fills the new group).
```bash
git add src/shared/types.ts src/shared/defaults.ts src/main/settings.ts src/renderer/src/settings-panel.tsx src/renderer/src/i18n/locales
git commit -m "feat(settings): add Library audio-previews toggle (default on)"
```

---

## Task 2: `plucker-audio://` protocol

**Files:** `src/main/index.ts`

- [ ] **Step 1: Import + register the privileged scheme (module scope)**

In `src/main/index.ts`, extend the electron import (line 1) and add `pathToFileURL`:

```ts
import { app, shell, BrowserWindow, ipcMain, dialog, systemPreferences, screen, protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
```

After `app.setName('Plucker')` (line 74), add (must run before `app.whenReady`):

```ts
// Privileged scheme so the renderer can stream library blobs (range-capable) for the
// hover-preview player and the editor transport, without exposing file paths.
protocol.registerSchemesAsPrivileged([
  { scheme: 'plucker-audio', privileges: { stream: true, supportFetchAPI: true, secure: true, bypassCSP: true } }
])
```

- [ ] **Step 2: Handle requests in `registerIpc`**

In `registerIpc`, right after `libraryStore` is created (~line 146), add:

```ts
  // plucker-audio://<sha256> → stream that blob. Only well-formed hashes that exist.
  protocol.handle('plucker-audio', (request) => {
    const hash = new URL(request.url).hostname
    if (!/^[0-9a-f]{64}$/.test(hash)) return new Response(null, { status: 400 })
    const file = libraryStore.pathFor(hash)
    if (!existsSync(file)) return new Response(null, { status: 404 })
    // net.fetch of a file:// URL honours the forwarded Range header (seek/scrub).
    return net.fetch(pathToFileURL(file).toString(), { headers: request.headers })
  })
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm run typecheck`
Manual: `pnpm dev`, open DevTools console, run `new Audio('plucker-audio://<a real hash from your library>').play()` → audio plays.
```bash
git add src/main/index.ts
git commit -m "feat(library): add plucker-audio:// blob streaming protocol"
```

---

## Task 3: shared preview engine

**Files:**
- Create: `src/renderer/src/library/preview-settings.ts`
- Create: `src/renderer/src/library/preview-player.ts`
- Test: `src/renderer/src/library/preview-player.test.ts`

- [ ] **Step 1: Settings cache**

```ts
// src/renderer/src/library/preview-settings.ts
let enabled = true
/** Initialise from settings + subscribe to live changes. Returns an unsubscribe fn. */
export function initPreviewSettings(): () => void {
  void window.plucker.getSettings().then((s) => (enabled = s.library.audioPreviews))
  return window.plucker.onSettingsChanged((s) => (enabled = s.library.audioPreviews))
}
export const previewsEnabled = (): boolean => enabled
```

- [ ] **Step 2: Write the failing test (pure helpers)**

```ts
// src/renderer/src/library/preview-player.test.ts
import { describe, it, expect } from 'vitest'
import { easeInOut, loopPosition } from './preview-player'

describe('preview-player helpers', () => {
  it('easeInOut is a smooth 0→1 S-curve', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5)
    expect(easeInOut(0.25)).toBeLessThan(0.25) // eased-in
  })
  it('loopPosition wraps currentTime within [t0, t1) → 0..1', () => {
    expect(loopPosition(6, 6, 22)).toBeCloseTo(0, 5)
    expect(loopPosition(14, 6, 22)).toBeCloseTo(0.5, 5)
    expect(loopPosition(23, 6, 22)).toBeCloseTo(0, 5) // past the window → wrapped
  })
})
```

- [ ] **Step 3: Run it (expect failure)**

Run: `pnpm test -- src/renderer/src/library/preview-player.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement** (port the proven behaviour from `gallery-live-audio-v3.html`)

```ts
// src/renderer/src/library/preview-player.ts
import { previewsEnabled } from './preview-settings'

export const FADE_IN = 850
export const FADE_OUT = 650
const VOL = 0.9
const INTENT_MS = 220

export function easeInOut(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
}
/** currentTime → 0..1 within the loop window [t0,t1). */
export function loopPosition(ct: number, t0: number, t1: number): number {
  const win = t1 - t0
  const p = (ct - t0) % win
  return ((p % win) + win) % win / win
}

export interface PreviewHandle {
  /** 0..1 playback position within the snippet, updated each frame. */
  onFrame?: (pos: number) => void
  onState?: (state: 'buffering' | 'playing' | 'stopped') => void
}

let audio: HTMLAudioElement | null = null
let token = 0 // identifies the active preview; bumping it cancels older callbacks
let raf = 0

function fade(el: HTMLAudioElement, to: number, ms: number, done?: () => void): void {
  const from = el.volume
  const start = performance.now()
  const step = (now: number): void => {
    const k = Math.min(1, (now - start) / ms)
    el.volume = Math.max(0, Math.min(1, from + (to - from) * easeInOut(k)))
    if (k < 1) requestAnimationFrame(step)
    else done?.()
  }
  requestAnimationFrame(step)
}

/** Stop whatever is previewing (eased), if anything. */
export function stopPreview(): void {
  token++
  if (raf) cancelAnimationFrame(raf)
  const el = audio
  if (el && !el.paused) fade(el, 0, FADE_OUT, () => el.pause())
}

/**
 * Play a looping snippet of a blob, eased in, scrolling via `onFrame`. Single-active:
 * a new call stops the previous. No-op when previews are disabled in settings.
 * Returns a stop fn for the caller (mouseleave).
 */
export function playPreview(hash: string, window: [number, number], h: PreviewHandle = {}): () => void {
  if (!previewsEnabled() || !hash) return () => {}
  const [t0, t1] = window
  const mine = ++token
  stopPreviousKeepToken(mine)
  if (!audio) audio = new Audio()
  const el = audio
  el.src = `plucker-audio://${hash}`
  el.volume = 0
  h.onState?.('buffering')
  el.currentTime = t0
  void el.play().then(() => h.onState?.('playing')).catch(() => h.onState?.('stopped'))
  fade(el, VOL, FADE_IN)
  const loop = (): void => {
    if (token !== mine) return
    if (el.currentTime < t0 || el.currentTime > t1) el.currentTime = t0
    h.onFrame?.(loopPosition(el.currentTime, t0, t1))
    raf = requestAnimationFrame(loop)
  }
  loop()
  return () => {
    if (token === mine) stopPreview()
  }
}

function stopPreviousKeepToken(mine: number): void {
  if (raf) cancelAnimationFrame(raf)
  const el = audio
  if (el && !el.paused && token === mine) fade(el, 0, 120, () => el.pause())
}

/** Hover-intent wrapper: only starts after the cursor dwells `INTENT_MS`. */
export function hoverPreview(hash: string, window: [number, number], h: PreviewHandle = {}): {
  enter: () => void
  leave: () => void
} {
  let timer: ReturnType<typeof setTimeout> | null = null
  let stop: (() => void) | null = null
  return {
    enter: () => {
      timer = setTimeout(() => {
        stop = playPreview(hash, window, h)
      }, INTENT_MS)
    },
    leave: () => {
      if (timer) clearTimeout(timer)
      stop?.()
      h.onState?.('stopped')
    }
  }
}
```

- [ ] **Step 5: init in `app.tsx`**

In `src/renderer/src/app.tsx`, add an effect:

```tsx
  useEffect(() => initPreviewSettings(), [])
```

and `import { initPreviewSettings } from './library/preview-settings'`.

- [ ] **Step 6: Run + typecheck + commit**

Run: `pnpm test -- src/renderer/src/library/preview-player.test.ts && pnpm run typecheck`
Expected: PASS.
```bash
git add src/renderer/src/library/preview-settings.ts src/renderer/src/library/preview-player.ts src/renderer/src/library/preview-player.test.ts src/renderer/src/app.tsx
git commit -m "feat(library): shared hover-preview audio engine"
```

---

## Task 4: Wire audio + synced scroll into the gallery + rows

The window comes from a small per-track offset (snippet `[t0, t1]`); use `[6, 22]` for the gallery and `[8, 24]` for rows (matching the prototype). The hash comes from `useTrackBlob` (extend it to also expose `hash`).

**Files:** `collection-waveform.tsx`, `collection-tile.tsx`, `use-track-blob.ts`, `library-track-row.tsx`.

- [ ] **Step 1: Expose `hash` from `useTrackBlob`**

In `src/renderer/src/library/use-track-blob.ts`, add `hash` to the returned object (it's already resolved in `blob.current`): track it in state so consumers re-render when it arrives.

```ts
  const [hash, setHash] = useState<string | null>(null)
  // …inside the resolve .then(): setHash(b.hash)
  return { cover, hash, loadWaveform }
```

- [ ] **Step 2: Drive `CollectionWaveform` scroll from playback when active**

In `src/renderer/src/library/collection-waveform.tsx`, accept an optional `posRef` (a `MutableRefObject<number>` updated by the engine) and, when present, translate the strip from it via rAF instead of the CSS marquee. Keep the CSS marquee class only as the reduced-motion / no-audio fallback:

```tsx
// add prop: posRef?: React.MutableRefObject<number>
// the scrolling inner div: ref={stripRef}, and an effect that, while active && posRef,
// sets stripRef.current.style.transform = `translateX(${-pos * (scrollWidth - clientWidth)}px)`
// each frame; otherwise fall back to the existing animate-[wave-marquee_…] class.
```

(Implementation mirrors the prototype's `loop()` in `gallery-live-audio-v3.html`: read `posRef.current`, map to `translateX`.)

- [ ] **Step 3: Hover audio in `CollectionTile`**

In `src/renderer/src/library/collection-tile.tsx`, replace the bare `setHover` handlers with the engine, gated and synced:

```tsx
  const { hash, loadWaveform } = useTrackBlob(first)
  const posRef = useRef(0)
  const hover = useRef<{ enter: () => void; leave: () => void } | null>(null)
  const [active, setActive] = useState(false)
  // build the hover controller when the hash is known
  useEffect(() => {
    if (!hash) return
    hover.current = hoverPreview(hash, [6, 22], {
      onState: (s) => setActive(s === 'playing' || s === 'buffering'),
      onFrame: (p) => (posRef.current = p)
    })
  }, [hash])
```

`onMouseEnter={() => { setActive(true); hover.current?.enter() }}`,
`onMouseLeave={() => { setActive(false); hover.current?.leave() }}`,
and pass `active` + `posRef` to `<CollectionWaveform>`. (The cover-fade still keys off `active`.)

- [ ] **Step 4: Row preview in `LibraryTrackRow`**

Add the same hover engine to the row: on hover-intent, play `[8,24]`, swap the artist line for a mini synced waveform (a compact `CollectionWaveform` variant or an inline strip reading `posRef`), and a green live dot. Reuse `hoverPreview` + `useTrackBlob().hash`. Static when idle (no animation).

- [ ] **Step 5: Run + typecheck + commit**

Run: `pnpm run typecheck && pnpm test -- src/renderer/src/library`
Expected: PASS (component tests render structure; audio/effects don't run under SSR).
```bash
git add src/renderer/src/library
git commit -m "feat(library): hover audio previews on gallery tiles + rows"
```

- [ ] **Step 6: Manual verification (`pnpm dev`)**

Hover a tile → after ~220 ms a snippet fades in and the waveform scrolls in sync; moving to another tile hands off (single-active); leaving fades out. Toggle `Settings → Audio previews` off → silent static waveform. Confirms §4.

---

## Task 5: Editor transport (play/pause + playhead)

**Files:** `editor-player.tsx`

- [ ] **Step 1: Add transport state + controls**

In `EditorPlayer`, take the current version's `hash` (via `useTrackBlob`) and add a play/pause button + a moving playhead over the existing `WaveformStrip`. Use `playPreview(hash, [0, durationSec])` for full-track playback (not the snippet window) with `onFrame` driving a playhead `left%`; `stopPreview()` on pause/unmount. The flat-accent circular button toggles. Reduced-motion still renders the static waveform.

```tsx
// const { hash } = useTrackBlob(trackId)
// const [playing, setPlaying] = useState(false)
// const [pos, setPos] = useState(0)
// toggle: playing ? stopPreview() : playPreview(hash, [0, wave?.durationSec ?? 0], { onFrame: setPos, onState: (s)=>setPlaying(s!=='stopped') })
// render: a 34px accent circle (Play/Pause from lucide) + the WaveformStrip + an absolute playhead at `${pos*100}%`
```

- [ ] **Step 2: Run + typecheck + commit**

Run: `pnpm run typecheck && pnpm test -- src/renderer/src/library`
Expected: PASS.
```bash
git add src/renderer/src/library/editor-player.tsx
git commit -m "feat(library): editor transport (play/scrub the current version)"
```

---

## Task 6: Activity dock

**Files:**
- Create: `src/renderer/src/library/activity-dock.tsx` (+ `.test.tsx`)
- Modify: `src/renderer/src/app.tsx` (replace inline `<ActivityLog>`)
- Delete: keep `activity-log.tsx` only if reused; otherwise fold its rendering into the dock.

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/src/library/activity-dock.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { ActivityDock } from './activity-dock'
import type { ActivityEvent } from '../../../shared/library'

const events: ActivityEvent[] = [
  { id: 'a1', type: 'ingested', ts: '2026-06-02T10:00:00.000Z', summary: 'Downloaded “Mix” (3 tracks)' },
  { id: 'a2', type: 'edited', ts: '2026-06-02T11:00:00.000Z', summary: 'Edited “Song A”' }
]

describe('ActivityDock', () => {
  it('collapsed: shows only the most recent summary', () => {
    const html = renderToStaticMarkup(<ActivityDock events={events} />)
    expect(html).toContain('Edited “Song A”') // most recent (events[1])
  })
  it('empty: shows a no-activity hint', () => {
    const html = renderToStaticMarkup(<ActivityDock events={[]} />)
    expect(html.toLowerCase()).toContain('no activity')
  })
})
```

- [ ] **Step 2: Run it (expect failure)** → `pnpm test -- src/renderer/src/library/activity-dock.test.tsx` → FAIL.

- [ ] **Step 3: Implement** (most-recent-first; collapsed one-liner; expands upward)

```tsx
// src/renderer/src/library/activity-dock.tsx
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronUp } from 'lucide-react'
import type { ActivityEvent } from '../../../shared/library'

export function ActivityDock({ events }: { events: ActivityEvent[] }): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const latest = events[0] // service returns most-recent-first
  return (
    <div className="flex-none border-t border-line bg-panel2">
      {open && (
        <ul className="max-h-[240px] overflow-auto border-b border-line2">
          {events.map((e) => (
            <li key={e.id} className={`flex items-center gap-2 border-b border-line2 px-[18px] py-1.5 text-[11px] text-ink-dim activity-${e.type}`}>
              <span className="h-1 w-1 rounded-full bg-ok" />
              <span className="truncate">{e.summary}</span>
              <time dateTime={e.ts} className="ml-auto font-mono text-[10px] text-ink-faint">
                {new Date(e.ts).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => setOpen((v) => !v)} className="flex h-[34px] w-full items-center gap-2.5 px-[18px] text-left">
        <span className="font-mono text-[9px] uppercase tracking-[1.3px] text-ink-faint">{t('activity.title')}</span>
        <span className="flex items-center gap-1.5 truncate text-[11px] text-ink-dim">
          {latest ? latest.summary : t('activity.empty')}
        </span>
        <ChevronUp size={13} className={'ml-auto text-ink-faint transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
    </div>
  )
}
```

- [ ] **Step 4: i18n + wire into `app.tsx`**

Add `activity.title: 'Activity'` (en/de; `activity.empty` already exists). In `app.tsx`, replace `<ActivityLog events={activity} />` inside the Library `<Page>` with `<ActivityDock events={activity} />` (and drop the `ActivityLog` import if now unused; delete `activity-log.tsx` + test if fully replaced).

- [ ] **Step 5: Run + typecheck + commit**

Run: `pnpm test -- src/renderer/src/library/activity-dock.test.tsx && pnpm run typecheck`
```bash
git add src/renderer/src/library src/renderer/src/app.tsx src/renderer/src/i18n/locales
git commit -m "feat(library): collapsible activity dock"
```

---

## Task 7: Export confirmation toast

**Files:**
- Create: `src/renderer/src/ui/toast.tsx`
- Modify: `src/renderer/src/app.tsx`

- [ ] **Step 1: Implement a minimal toast**

```tsx
// src/renderer/src/ui/toast.tsx
import React, { useEffect } from 'react'

/** A single transient toast, bottom-centre, auto-dismissing. */
export function Toast({ message, onDone, ms = 3200 }: { message: string; onDone: () => void; ms?: number }): React.JSX.Element {
  useEffect(() => {
    const id = setTimeout(onDone, ms)
    return () => clearTimeout(id)
  }, [message, ms, onDone])
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="rounded-lg border border-line bg-raise px-4 py-2.5 text-[12.5px] text-ink shadow-[0_12px_30px_rgba(0,0,0,.5)]">
        {message}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire export completion in `app.tsx`**

Add `const [toast, setToast] = useState<string | null>(null)` and update `exportTrackIds` to surface the result:

```tsx
  const exportTrackIds = async (trackIds: string[]): Promise<void> => {
    const folder = await window.plucker.chooseFolder()
    if (!folder) return
    const written = await window.plucker.exportLibraryTracks(trackIds, folder)
    setToast(t('library.exportDone', { count: written.length }))
  }
```

Render `{toast && <Toast message={toast} onDone={() => setToast(null)} />}` near the end of the root tree. Add `library.exportDone: 'Exported {{count}} track(s)'` (en/de). Ensure `t` is available (`const { t } = useTranslation()` in `App`).

- [ ] **Step 3: Run + typecheck + lint + commit**

Run: `pnpm run lint && pnpm run typecheck && pnpm test`
```bash
git add src/renderer/src/ui/toast.tsx src/renderer/src/app.tsx src/renderer/src/i18n/locales
git commit -m "feat(library): export confirmation toast"
```

---

## Final verification

- [ ] Run: `pnpm run lint && pnpm run typecheck && pnpm test` → all PASS.
- [ ] Manual (`pnpm dev`) — the full spec walk:
  1. Hover gallery tiles/rows → snippet plays, waveform scrolls in sync, single-active, eased fades; toggle off in Settings → silent static.
  2. Open the editor → play/pause the current version with a moving playhead.
  3. Activity dock collapses to one line and expands upward.
  4. Export a collection/track → files land + a toast confirms.

---

## Self-Review

**Spec coverage:** §4 hover audio preview (real playback, synced scroll, on-by-default, Settings toggle, 220 ms intent, single-active, eased fades, reduced-motion) → Tasks 1–4; §6 editor transport → Task 5; §9 activity dock → Task 6; §10 export toast → Task 7; the `plucker-audio://` protocol → Task 2.

**Placeholder scan:** Tasks 4 Steps 2/4 and Task 5 describe the wiring with concrete prop/effect snippets and cite the prototype (`gallery-live-audio-v3.html`) as the exact behaviour to port — these are integration steps, not undefined references; every symbol (`hoverPreview`, `playPreview`, `stopPreview`, `posRef`, `useTrackBlob().hash`) is defined in this plan or earlier ones. Audio sync feel is verified manually (Task 4 Step 6 / final walk), as visual+audio timing isn't unit-testable.

**Type consistency:** `Settings.library.audioPreviews` flows through types → defaults → `mergeDefaults` → `previewsEnabled()` gate. `playPreview(hash, [t0,t1], handle)` / `hoverPreview(...)` / `stopPreview()` signatures are stable across tile/row/editor call sites. `useTrackBlob` now returns `{ cover, hash, loadWaveform }` — consumers updated. `ActivityDock`/`Toast` props match their `app.tsx` call sites.

**Completes the redesign:** with Plans 1–5 done, the Library is the cinematic, audio-forward centerpiece the spec describes.
