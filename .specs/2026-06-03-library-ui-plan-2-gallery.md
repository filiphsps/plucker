# Library UI — Plan 2: Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare `LibraryView` with the cinematic **collections Gallery** (cover tiles, 2×2 playlist mosaics, search + sort, hover waveform *visual*, Export/Delete chips, empty/loading) plus a minimal **collection track list** and the **gallery → collection → editor** routing, so the Library is browsable end-to-end. Audio on hover is deferred to Plan 5; this plan ships the silent waveform-bloom visual.

**Architecture:** One tiny main-process resolver (`library:getTrackBlob`) returns a track's current-version blob `{ file, hash }` by walking `repo → active branch tip → version.blobHash → store.pathFor`. The renderer reuses the existing `getCover(file)` and `getWaveform(file, hash)` IPC against that path. New renderer components live in `src/renderer/src/library/`. `app.tsx` gains a `libraryView` state machine (`gallery | collection | editor`). The cinematic collection *hero* is intentionally left to Plan 3 — Plan 2's collection view is a functional dense list.

**Tech Stack:** TypeScript, React 19, Tailwind v4 tokens (`bg-surface/panel/panel2/raise`, `border-line/line2`, `text-ink/-dim/-faint`, `text-accent`, `bg-accent-dim`, `font-mono`), `lucide-react`, Vitest + `renderToStaticMarkup`. **pnpm only.** Visual source of truth: `.superpowers/brainstorm/13600-1780446128/content/gallery-page.html`, `gallery-hover-A-final.html`, `collection-page-v2.html`.

**Spec:** `.specs/2026-06-03-library-page-ui-design.md` §3 (gallery), §4 (hover visual; audio = Plan 5), §5 (collection page — interim here), §11 (empty/loading).

**Depends on:** Plan 1 (the `Button` primitive).

---

## File Structure

- **Modify** `src/main/index.ts` — add the `library:getTrackBlob` IPC handler (near the other `library:*` handlers, ~line 309).
- **Modify** `src/preload/index.ts` — add `getLibraryTrackBlob(trackId)`.
- **Modify** `src/renderer/src/env.d.ts` — only if it hand-mirrors the API (follow existing pattern; the preload `PluckerApi` type usually flows automatically).
- **Create** `src/renderer/src/library/gallery-sort.ts` (+ `.test.ts`) — pure search/sort/grouping of `CollectionView[]`.
- **Create** `src/renderer/src/library/use-track-blob.ts` — hook: resolve `{ file, hash }` + cover + (lazily) peaks for a track.
- **Create** `src/renderer/src/library/collection-cover.tsx` (+ `.test.tsx`) — single cover or 2×2 mosaic.
- **Create** `src/renderer/src/library/collection-waveform.tsx` — the hover bloom+scroll waveform (visual only).
- **Create** `src/renderer/src/library/collection-tile.tsx` (+ `.test.tsx`) — one gallery tile (cover + scrim + caption + hover + chips).
- **Create** `src/renderer/src/library/gallery.tsx` (+ `.test.tsx`) — toolbar + grid + empty/loading. Replaces `LibraryView` as the collections surface.
- **Create** `src/renderer/src/library/collection-tracklist.tsx` (+ `.test.tsx`) — interim functional track list for one collection (Plan 3 replaces with the cinematic page).
- **Modify** `src/renderer/src/app.tsx` — `libraryView` routing (gallery | collection | editor); mount Gallery/CollectionTracklist/TrackEditor.
- **Delete** `src/renderer/src/library/library-view.tsx` + `library-view.test.tsx` (superseded by `gallery.tsx` + `collection-tracklist.tsx`).
- **Modify** i18n `src/renderer/src/i18n/locales/en.ts` + `de.ts` — gallery/collection strings.

---

## Task 1: `library:getTrackBlob` resolver (main + preload)

**Files:**
- Modify: `src/main/index.ts` (add handler beside the other `library:*` handlers)
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add the IPC handler**

In `src/main/index.ts`, immediately after `ipcMain.handle('library:getTrack', …)` (~line 310), add:

```ts
  // Resolve a track's *current* (active-branch tip) version to its on-disk blob.
  // The tip is always materialized (model policy), so file/hash are non-null in practice;
  // callers must still tolerate nulls (cold/broken root). Reuses the existing
  // cover:/waveform:/metadata: handlers, which take a file path.
  ipcMain.handle('library:getTrackBlob', (_e, trackId: string): { file: string | null; hash: string | null } => {
    const t = libraryRepo.getTrack(trackId)
    if (!t) return { file: null, hash: null }
    const branch = libraryRepo.getBranch(t.activeBranchId)
    if (!branch) return { file: null, hash: null }
    const ver = libraryRepo.getVersion(branch.tipVersionId)
    const hash = ver?.blobHash ?? null
    return { file: hash ? libraryStore.pathFor(hash) : null, hash }
  })
```

(`libraryRepo` and `libraryStore` are already in scope — see `src/main/index.ts:145-146`.)

- [ ] **Step 2: Add the preload method**

In `src/preload/index.ts`, in the `// Library (editor model)` block (after `getLibraryTrack`, ~line 119), add:

```ts
  getLibraryTrackBlob: (trackId: string): Promise<{ file: string | null; hash: string | null }> =>
    ipcRenderer.invoke('library:getTrackBlob', trackId),
```

- [ ] **Step 3: Verify**

Run: `pnpm run typecheck`
Expected: PASS (node + web). The new method is part of `PluckerApi` and visible on `window.plucker`.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat(library): resolve a track's current-version blob for the UI"
```

---

## Task 2: Search / sort / grouping util

**Files:**
- Create: `src/renderer/src/library/gallery-sort.ts`
- Test: `src/renderer/src/library/gallery-sort.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/src/library/gallery-sort.test.ts
import { describe, it, expect } from 'vitest'
import { filterAndSort, type GallerySort } from './gallery-sort'
import type { CollectionView } from '../../../shared/library'

const c = (id: string, title: string, kind: CollectionView['kind'], createdAt: string): CollectionView => ({
  id, title, kind, createdAt, tracks: []
})
const COLS: CollectionView[] = [
  c('1', 'Road Trip', 'playlist', '2026-06-01T00:00:00Z'),
  c('2', 'Midnights', 'album', '2026-06-03T00:00:00Z'),
  c('3', 'Echoes', 'single', '2026-06-02T00:00:00Z')
]

describe('filterAndSort', () => {
  it('sorts by most recent (createdAt desc)', () => {
    const r = filterAndSort(COLS, '', 'recent')
    expect(r.map((x) => x.id)).toEqual(['2', '3', '1'])
  })
  it('sorts A–Z by title', () => {
    const r = filterAndSort(COLS, '', 'az')
    expect(r.map((x) => x.title)).toEqual(['Echoes', 'Midnights', 'Road Trip'])
  })
  it('filters by case-insensitive title substring', () => {
    const r = filterAndSort(COLS, 'mid', 'recent')
    expect(r.map((x) => x.id)).toEqual(['2'])
  })
  it('exposes a stable sort key list for the segmented control', () => {
    const keys: GallerySort[] = ['recent', 'az', 'kind']
    expect(keys).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/renderer/src/library/gallery-sort.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/renderer/src/library/gallery-sort.ts
import type { CollectionView, CollectionKind } from '../../../shared/library'

export type GallerySort = 'recent' | 'az' | 'kind'

const KIND_ORDER: Record<CollectionKind, number> = { playlist: 0, album: 1, single: 2 }

/** Filter by a title substring (case-insensitive) then sort by the chosen key. Pure. */
export function filterAndSort(
  collections: CollectionView[],
  query: string,
  sort: GallerySort
): CollectionView[] {
  const q = query.trim().toLowerCase()
  const filtered = q ? collections.filter((c) => c.title.toLowerCase().includes(q)) : collections.slice()
  switch (sort) {
    case 'az':
      return filtered.sort((a, b) => a.title.localeCompare(b.title))
    case 'kind':
      return filtered.sort(
        (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.createdAt.localeCompare(a.createdAt)
      )
    case 'recent':
    default:
      return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
}
```

- [ ] **Step 4: Run + commit**

Run: `pnpm test -- src/renderer/src/library/gallery-sort.test.ts && pnpm run typecheck`
Expected: PASS.
```bash
git add src/renderer/src/library/gallery-sort.ts src/renderer/src/library/gallery-sort.test.ts
git commit -m "feat(library): add gallery search/sort util"
```

---

## Task 3: `useTrackBlob` hook

Resolves a track's blob `{ file, hash }` once, then exposes the cover data URL (and a lazy `loadWaveform()` for hover). No test (it's thin glue over `window.plucker`; the repo tests components via `renderToStaticMarkup`, where effects don't run). Verified by typecheck + the component tests that consume it.

**Files:**
- Create: `src/renderer/src/library/use-track-blob.ts`

- [ ] **Step 1: Implement**

```ts
// src/renderer/src/library/use-track-blob.ts
import { useEffect, useRef, useState } from 'react'
import type { Waveform } from '../../../shared/types'

export interface TrackBlobArt {
  cover: string | null
  /** Lazily fetch + cache the version's peaks (used on first hover). */
  loadWaveform: () => Promise<Waveform | null>
}

/**
 * Resolve a library track's current-version blob, then its cover. The waveform is
 * fetched on demand (hover) and cached. Returns `null` cover until loaded.
 */
export function useTrackBlob(trackId: string | null): TrackBlobArt {
  const [cover, setCover] = useState<string | null>(null)
  const blob = useRef<{ file: string | null; hash: string | null }>({ file: null, hash: null })
  const wave = useRef<Waveform | null>(null)

  useEffect(() => {
    let live = true
    setCover(null)
    blob.current = { file: null, hash: null }
    wave.current = null
    if (!trackId) return
    void window.plucker.getLibraryTrackBlob(trackId).then((b) => {
      if (!live) return
      blob.current = b
      if (b.file) window.plucker.getCover(b.file).then((url) => live && setCover(url))
    })
    return () => {
      live = false
    }
  }, [trackId])

  const loadWaveform = async (): Promise<Waveform | null> => {
    if (wave.current) return wave.current
    const { file, hash } = blob.current
    if (!file) return null
    const wf = await window.plucker.getWaveform(file, hash ?? undefined)
    wave.current = wf
    return wf
  }

  return { cover, loadWaveform }
}
```

- [ ] **Step 2: Verify + commit**

Run: `pnpm run typecheck`
```bash
git add src/renderer/src/library/use-track-blob.ts
git commit -m "feat(library): add useTrackBlob hook (cover + lazy peaks)"
```

---

## Task 4: `CollectionCover` (single / 2×2 mosaic)

**Files:**
- Create: `src/renderer/src/library/collection-cover.tsx`
- Test: `src/renderer/src/library/collection-cover.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/src/library/collection-cover.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { CollectionCover } from './collection-cover'
import type { TrackSummary } from '../../../shared/library'

const tracks = (n: number): TrackSummary[] =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: `T${i}`, orderIndex: i, currentVersionId: `v${i}` }))

describe('CollectionCover', () => {
  it('renders a 2x2 mosaic grid for a playlist with 4+ tracks', () => {
    const html = renderToStaticMarkup(<CollectionCover kind="playlist" tracks={tracks(5)} />)
    expect(html).toContain('grid-cols-2') // mosaic uses a 2-col grid
  })
  it('renders a single cover frame for a single', () => {
    const html = renderToStaticMarkup(<CollectionCover kind="single" tracks={tracks(1)} />)
    expect(html).not.toContain('grid-cols-2')
  })
  it('falls back to a music glyph when there are no tracks', () => {
    const html = renderToStaticMarkup(<CollectionCover kind="album" tracks={[]} />)
    expect(html).toContain('lucide-music') // lucide icons carry a lucide-<name> class
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/renderer/src/library/collection-cover.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/renderer/src/library/collection-cover.tsx
import React from 'react'
import { Music } from 'lucide-react'
import type { CollectionKind, TrackSummary } from '../../../shared/library'
import { useTrackBlob } from './use-track-blob'

/** One track's cover image (or a gradient fallback) for use in the mosaic/single frame. */
function Cell({ trackId }: { trackId: string }): React.JSX.Element {
  const { cover } = useTrackBlob(trackId)
  return cover ? (
    <img src={cover} alt="" className="h-full w-full object-cover" />
  ) : (
    <div className="h-full w-full bg-gradient-to-br from-[#1c1f24] to-[#101216]" />
  )
}

/**
 * A collection's artwork: a 2×2 mosaic of the first four tracks for playlists with
 * enough tracks, otherwise the first track's single cover. Empty → a Music glyph.
 */
export function CollectionCover({
  kind,
  tracks
}: {
  kind: CollectionKind
  tracks: TrackSummary[]
}): React.JSX.Element {
  if (tracks.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1c1f24] to-[#101216]">
        <Music size={28} className="text-ink-faint" />
      </div>
    )
  }
  if (kind === 'playlist' && tracks.length >= 4) {
    return (
      <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px">
        {tracks.slice(0, 4).map((t) => (
          <Cell key={t.id} trackId={t.id} />
        ))}
      </div>
    )
  }
  return <Cell trackId={tracks[0].id} />
}
```

- [ ] **Step 4: Run + typecheck + commit**

Run: `pnpm test -- src/renderer/src/library/collection-cover.test.tsx && pnpm run typecheck`
Expected: PASS.
```bash
git add src/renderer/src/library/collection-cover.tsx src/renderer/src/library/collection-cover.test.tsx
git commit -m "feat(library): add collection cover (mosaic + single)"
```

---

## Task 5: `CollectionWaveform` (hover bloom + scroll, visual only)

The hover waveform from the spec (§4) **without audio** (audio is Plan 5). Symmetric centered bars that bloom in and scroll; `prefers-reduced-motion` → static. Peaks load on first hover via `useTrackBlob().loadWaveform`. Verified by typecheck + the tile test (it renders a container; bars are appended in an effect that doesn't run under SSR). Visual reference: `gallery-hover-A-final.html`.

**Files:**
- Create: `src/renderer/src/library/collection-waveform.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/renderer/src/library/collection-waveform.tsx
import React, { useEffect, useRef, useState } from 'react'
import type { Waveform } from '../../../shared/types'

/**
 * The signature hover waveform: the cover fades to black (handled by the tile) and a
 * vertically-centred, symmetric waveform blooms in then scrolls. Visual only — Plan 5
 * swaps the CSS marquee for playback-synced scroll + audio. Honors reduced-motion.
 */
export function CollectionWaveform({
  active,
  loadWaveform
}: {
  active: boolean
  loadWaveform: () => Promise<Waveform | null>
}): React.JSX.Element {
  const [peaks, setPeaks] = useState<number[] | null>(null)

  useEffect(() => {
    if (!active || peaks) return
    let live = true
    void loadWaveform().then((wf) => {
      if (live && wf) setPeaks(wf.peaks.slice(0, 120))
    })
    return () => {
      live = false
    }
  }, [active, peaks, loadWaveform])

  if (!peaks) return <></>
  // Duplicate the peak set so the marquee (translateX -50%) loops seamlessly.
  const bars = [...peaks, ...peaks]
  return (
    <div
      className={
        'pointer-events-none absolute inset-0 z-[2] overflow-hidden transition-opacity duration-500 ' +
        (active ? 'opacity-100' : 'opacity-0')
      }
      style={{
        WebkitMaskImage: 'linear-gradient(90deg,transparent,#000 13%,#000 87%,transparent)',
        maskImage: 'linear-gradient(90deg,transparent,#000 13%,#000 87%,transparent)'
      }}
    >
      <div
        className="absolute inset-y-0 left-0 flex w-[200%] items-center gap-[1.5px] motion-safe:animate-[wave-marquee_9s_linear_infinite]"
        style={{ filter: 'drop-shadow(0 0 7px rgba(10,132,255,.45))' }}
      >
        {bars.map((p, i) => (
          <span
            key={i}
            data-collection-wave-bar
            className="min-w-0 flex-1 rounded-[1px] bg-gradient-to-b from-[rgba(74,163,255,.5)] via-accent to-[rgba(74,163,255,.5)]"
            style={{ height: `${12 + p * 88}%` }}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add the marquee keyframes**

In `src/renderer/src/index.css`, after the existing `@keyframes wave-rise` block, add:

```css
/* Gallery hover waveform scroll (Plan 5 replaces this with playback-synced scroll). */
@keyframes wave-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm run typecheck`
```bash
git add src/renderer/src/library/collection-waveform.tsx src/renderer/src/index.css
git commit -m "feat(library): add hover waveform (visual; audio in Plan 5)"
```

---

## Task 6: `CollectionTile`

**Files:**
- Create: `src/renderer/src/library/collection-tile.tsx`
- Test: `src/renderer/src/library/collection-tile.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/src/library/collection-tile.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { CollectionTile } from './collection-tile'
import type { CollectionView } from '../../../shared/library'

const col: CollectionView = {
  id: 'c1', kind: 'playlist', title: 'Road Trip', createdAt: 't',
  tracks: [{ id: 't1', title: 'A', orderIndex: 1, currentVersionId: 'v1' }]
}

describe('CollectionTile', () => {
  it('renders the title and a mono kind · count caption', () => {
    const html = renderToStaticMarkup(
      <CollectionTile collection={col} onOpen={() => {}} onExport={() => {}} onDelete={() => {}} />
    )
    expect(html).toContain('Road Trip')
    expect(html).toContain('Playlist') // localized kind
    expect(html).toContain('1') // track count
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/renderer/src/library/collection-tile.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/renderer/src/library/collection-tile.tsx
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Trash2 } from 'lucide-react'
import type { CollectionView } from '../../../shared/library'
import { CollectionCover } from './collection-cover'
import { CollectionWaveform } from './collection-waveform'
import { useTrackBlob } from './use-track-blob'

/** One cinematic gallery tile: cover/mosaic, hover waveform, scrim caption, hover actions. */
export function CollectionTile({
  collection,
  onOpen,
  onExport,
  onDelete
}: {
  collection: CollectionView
  onOpen: (id: string) => void
  onExport: (id: string) => void
  onDelete: (id: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [hover, setHover] = useState(false)
  // The collection's signature waveform = its first track's current version.
  const first = collection.tracks[0]?.id ?? null
  const { loadWaveform } = useTrackBlob(first)

  const stop = (e: React.MouseEvent): void => e.stopPropagation()

  return (
    <button
      type="button"
      onClick={() => onOpen(collection.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group relative aspect-square overflow-hidden rounded-[10px] border border-line bg-black text-left transition-transform duration-150 hover:-translate-y-[3px] hover:border-[#33373f]"
    >
      <div
        className={
          'absolute inset-0 z-[1] transition-opacity duration-500 ' +
          (hover ? 'opacity-[0.07]' : 'opacity-100')
        }
      >
        <CollectionCover kind={collection.kind} tracks={collection.tracks} />
      </div>

      <CollectionWaveform active={hover} loadWaveform={loadWaveform} />

      {/* scrim + caption */}
      <div className="pointer-events-none absolute inset-0 z-[4] bg-gradient-to-t from-black/85 via-transparent to-transparent" />
      <div className="absolute inset-x-3 bottom-2.5 z-[5]">
        <div className="truncate text-[14px] font-semibold text-white">{collection.title}</div>
        <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[1.1px] text-white/60">
          {t(`library.kind.${collection.kind}`)}
          {collection.kind !== 'single' && ` · ${collection.tracks.length}`}
        </div>
      </div>

      {/* hover actions */}
      <div
        className={
          'absolute right-2 top-2 z-[5] flex gap-1.5 transition-opacity ' +
          (hover ? 'opacity-100' : 'opacity-0')
        }
      >
        <span
          role="button"
          aria-label={t('library.exportAll')}
          onClick={(e) => {
            stop(e)
            onExport(collection.id)
          }}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-black/60 text-white backdrop-blur"
        >
          <Upload size={13} />
        </span>
        <span
          role="button"
          aria-label={t('common.delete')}
          onClick={(e) => {
            stop(e)
            onDelete(collection.id)
          }}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-black/60 text-white backdrop-blur"
        >
          <Trash2 size={13} />
        </span>
      </div>
    </button>
  )
}
```

- [ ] **Step 4: i18n**

Ensure `src/renderer/src/i18n/locales/en.ts` has under `library`: `kind: { playlist: 'Playlist', album: 'Album', single: 'Single' }`, `exportAll: 'Export all'`, and a shared `common.delete: 'Delete'` (reuse if present). Add German equivalents in `de.ts` (`Wiedergabeliste` / `Album` / `Single`, `Alle exportieren`, `Löschen`).

- [ ] **Step 5: Run + typecheck + commit**

Run: `pnpm test -- src/renderer/src/library/collection-tile.test.tsx && pnpm run typecheck`
Expected: PASS.
```bash
git add src/renderer/src/library/collection-tile.tsx src/renderer/src/library/collection-tile.test.tsx src/renderer/src/i18n/locales
git commit -m "feat(library): add cinematic collection tile"
```

---

## Task 7: `Gallery` (toolbar + grid + empty/loading)

**Files:**
- Create: `src/renderer/src/library/gallery.tsx`
- Test: `src/renderer/src/library/gallery.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/src/library/gallery.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { Gallery } from './gallery'
import type { CollectionView } from '../../../shared/library'

const cols: CollectionView[] = [
  { id: 'c1', kind: 'playlist', title: 'Road Trip', createdAt: 't', tracks: [] }
]
const noop = (): void => {}

describe('Gallery', () => {
  it('renders a tile per collection and the count', () => {
    const html = renderToStaticMarkup(
      <Gallery collections={cols} onOpenCollection={noop} onExportCollection={noop} onDeleteCollection={noop} />
    )
    expect(html).toContain('Road Trip')
    expect(html).toContain('1') // 1 collection
  })
  it('shows the empty state when there are no collections', () => {
    const html = renderToStaticMarkup(
      <Gallery collections={[]} onOpenCollection={noop} onExportCollection={noop} onDeleteCollection={noop} />
    )
    expect(html.toLowerCase()).toContain('empty')
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/renderer/src/library/gallery.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/renderer/src/library/gallery.tsx
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Library as LibraryIcon } from 'lucide-react'
import type { CollectionView } from '../../../shared/library'
import { CollectionTile } from './collection-tile'
import { filterAndSort, type GallerySort } from './gallery-sort'

const SORTS: GallerySort[] = ['recent', 'az', 'kind']

export function Gallery({
  collections,
  onOpenCollection,
  onExportCollection,
  onDeleteCollection
}: {
  collections: CollectionView[]
  onOpenCollection: (id: string) => void
  onExportCollection: (id: string) => void
  onDeleteCollection: (id: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<GallerySort>('recent')
  const shown = useMemo(() => filterAndSort(collections, query, sort), [collections, query, sort])
  const trackTotal = collections.reduce((n, c) => n + c.tracks.length, 0)

  if (collections.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <LibraryIcon size={34} className="text-ink-faint" />
        <div className="text-[15px] font-medium text-ink">{t('library.empty')}</div>
        <div className="text-[12.5px] text-ink-dim">{t('library.emptyHint')}</div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[46px] flex-none items-center gap-3 border-b border-line2 px-[18px]">
        <label className="flex w-[240px] items-center gap-1.5 rounded-md border border-line bg-panel2 px-2.5 py-1.5 text-ink-faint">
          <Search size={12} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('library.search')}
            className="w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-faint"
          />
        </label>
        <span className="flex-1" />
        <span className="font-mono text-[10px] uppercase tracking-[1px] text-ink-faint tnum">
          {t('library.count', { collections: collections.length, tracks: trackTotal })}
        </span>
        <div className="flex rounded-md border border-line bg-panel2 p-0.5">
          {SORTS.map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={
                'rounded-[5px] px-2.5 py-1 text-[11px] ' +
                (sort === s ? 'bg-raise text-ink' : 'text-ink-dim hover:text-ink')
              }
            >
              {t(`library.sort.${s}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-[18px]">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-[15px]">
          {shown.map((c) => (
            <CollectionTile
              key={c.id}
              collection={c}
              onOpen={onOpenCollection}
              onExport={onExportCollection}
              onDelete={onDeleteCollection}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: i18n**

Add under `library` in `en.ts`: `search: 'Search library…'`, `emptyHint: 'Download something to get started.'`, `count: '{{collections}} collections · {{tracks}} tracks'`, `sort: { recent: 'Recent', az: 'A–Z', kind: 'Kind' }`. (`empty` already exists from the model build.) German equivalents in `de.ts`.

- [ ] **Step 5: Run + typecheck + commit**

Run: `pnpm test -- src/renderer/src/library/gallery.test.tsx && pnpm run typecheck`
Expected: PASS.
```bash
git add src/renderer/src/library/gallery.tsx src/renderer/src/library/gallery.test.tsx src/renderer/src/i18n/locales
git commit -m "feat(library): add collections gallery (toolbar + grid)"
```

---

## Task 8: `CollectionTracklist` (interim collection view)

A functional single-collection track list so gallery→collection→editor works now. Plan 3 replaces this with the cinematic hero page. Uses Plan 1's `Button`.

**Files:**
- Create: `src/renderer/src/library/collection-tracklist.tsx`
- Test: `src/renderer/src/library/collection-tracklist.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/src/library/collection-tracklist.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { CollectionTracklist } from './collection-tracklist'
import type { CollectionView } from '../../../shared/library'

const col: CollectionView = {
  id: 'c1', kind: 'playlist', title: 'Road Trip', createdAt: 't',
  tracks: [
    { id: 't1', title: 'Highway Lights', orderIndex: 1, currentVersionId: 'v1' },
    { id: 't2', title: 'Open Road', orderIndex: 2, currentVersionId: 'v2' }
  ]
}
const noop = (): void => {}

describe('CollectionTracklist', () => {
  it('renders the collection title and each track', () => {
    const html = renderToStaticMarkup(
      <CollectionTracklist collection={col} onBack={noop} onOpenTrack={noop} onExportAll={noop} onDelete={noop} />
    )
    expect(html).toContain('Road Trip')
    expect(html).toContain('Highway Lights')
    expect(html).toContain('Open Road')
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/renderer/src/library/collection-tracklist.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/renderer/src/library/collection-tracklist.tsx
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react'
import type { CollectionView } from '../../../shared/library'
import { Button } from '../ui/button'

/**
 * Interim collection view: a back bar + Export all/Delete + a dense list of tracks.
 * Plan 3 replaces this with the cinematic hero page; the contract (props) stays.
 */
export function CollectionTracklist({
  collection,
  onBack,
  onOpenTrack,
  onExportAll,
  onDelete
}: {
  collection: CollectionView
  onBack: () => void
  onOpenTrack: (trackId: string) => void
  onExportAll: (id: string) => void
  onDelete: (id: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-none items-center gap-3 border-b border-line2 px-[18px] py-3">
        <button onClick={onBack} className="flex items-center gap-1 font-mono text-[10px] text-ink-faint hover:text-ink-dim">
          <ChevronLeft size={13} />
          {t('library.backToLibrary')}
        </button>
        <h2 className="text-[15px] font-semibold text-ink">{collection.title}</h2>
        <span className="flex-1" />
        <Button variant="primary" onClick={() => onExportAll(collection.id)}>
          {t('library.exportAll')}
        </Button>
        <Button onClick={() => onDelete(collection.id)}>{t('common.delete')}</Button>
      </header>
      <ul className="min-h-0 flex-1 overflow-auto">
        {collection.tracks.map((tr, i) => (
          <li key={tr.id}>
            <button
              onClick={() => onOpenTrack(tr.id)}
              className="flex h-12 w-full items-center gap-3 border-b border-line2 px-[18px] text-left hover:bg-white/[0.018]"
            >
              <span className="w-[22px] text-center font-mono text-[11px] text-ink-faint">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="truncate text-[13px] font-medium text-ink">{tr.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: i18n**

Add `library.backToLibrary: 'Library'` (en) / `'Bibliothek'` (de).

- [ ] **Step 5: Run + typecheck + commit**

Run: `pnpm test -- src/renderer/src/library/collection-tracklist.test.tsx && pnpm run typecheck`
Expected: PASS.
```bash
git add src/renderer/src/library/collection-tracklist.tsx src/renderer/src/library/collection-tracklist.test.tsx src/renderer/src/i18n/locales
git commit -m "feat(library): add interim collection track list"
```

---

## Task 9: Route gallery → collection → editor in `app.tsx`

**Files:**
- Modify: `src/renderer/src/app.tsx`
- Delete: `src/renderer/src/library/library-view.tsx` + `src/renderer/src/library/library-view.test.tsx`

- [ ] **Step 1: Remove the old view**

```bash
git rm src/renderer/src/library/library-view.tsx
git rm --ignore-unmatch src/renderer/src/library/library-view.test.tsx
```

- [ ] **Step 2: Swap imports + add nav state**

In `src/renderer/src/app.tsx`, replace the `LibraryView` import (line 3) with:

```tsx
import { Gallery } from './library/gallery'
import { CollectionTracklist } from './library/collection-tracklist'
```

Add state next to the existing library state (~line 67-69):

```tsx
  const [openCollectionId, setOpenCollectionId] = useState<string | null>(null)
```

- [ ] **Step 3: Render the three Library sub-views**

Replace the contents of the `view === 'history'` `<Page>` (currently the `<div className="library-page">` block, ~lines 541-579) with:

```tsx
        <Page active={!overlayOpen && view === 'history'}>
          <div className="flex h-full min-h-0 flex-col">
            {trackDetail ? (
              <TrackEditor
                detail={trackDetail}
                onClose={() => setTrackDetail(null)}
                onEdit={(trackId) => {
                  void window.plucker
                    .getSettings()
                    .then((s) => window.plucker.editTrack(trackId, s.transforms))
                }}
                onExport={(trackId) => void exportTrackIds([trackId])}
                onSwitchBranch={(branchId) => {
                  void window.plucker
                    .switchBranch(trackDetail.instance.id, branchId)
                    .then((d) => d && setTrackDetail(d))
                }}
                onCreateBranch={(fromVersionId, name) => {
                  void window.plucker
                    .createBranch(trackDetail.instance.id, fromVersionId, name)
                    .then((r) => r.detail && setTrackDetail(r.detail))
                }}
              />
            ) : openCollectionId ? (
              ((): React.JSX.Element => {
                const col = collections.find((c) => c.id === openCollectionId)
                if (!col) {
                  setOpenCollectionId(null)
                  return <></>
                }
                return (
                  <CollectionTracklist
                    collection={col}
                    onBack={() => setOpenCollectionId(null)}
                    onOpenTrack={openTrack}
                    onExportAll={(id) => {
                      const c = collections.find((x) => x.id === id)
                      if (c) void exportTrackIds(c.tracks.map((tr) => tr.id))
                    }}
                    onDelete={(id) => {
                      void window.plucker.deleteLibraryCollection(id).then(() => {
                        setOpenCollectionId(null)
                        void refreshLibrary()
                      })
                    }}
                  />
                )
              })()
            ) : (
              <Gallery
                collections={collections}
                onOpenCollection={setOpenCollectionId}
                onExportCollection={(id) => {
                  const c = collections.find((x) => x.id === id)
                  if (c) void exportTrackIds(c.tracks.map((tr) => tr.id))
                }}
                onDeleteCollection={(id) => {
                  void window.plucker.deleteLibraryCollection(id).then(() => void refreshLibrary())
                }}
              />
            )}
            <ActivityLog events={activity} />
          </div>
        </Page>
```

(`ActivityLog` stays inline for now; Plan 5 turns it into the dock. `openTrack`, `collections`, `refreshLibrary`, `exportTrackIds`, `trackDetail` already exist in `app.tsx`.)

- [ ] **Step 4: Run + typecheck + lint + commit**

Run: `pnpm run typecheck && pnpm test -- src/renderer/src/library && pnpm run lint`
Expected: PASS (old `library-view.test.tsx` gone; new library tests pass).
```bash
git add src/renderer/src/app.tsx src/renderer/src/library
git commit -m "feat(library): route gallery → collection → editor"
```

---

## Final verification

- [ ] **Step 1: Full check**

Run: `pnpm run lint && pnpm run typecheck && pnpm test`
Expected: all PASS.

- [ ] **Step 2: Manual smoke (`pnpm dev`)**

1. Open Library → collections render as cover tiles; playlists show a 2×2 mosaic.
2. Hover a tile → cover fades, the waveform blooms + scrolls (silent), Export/Delete chips appear.
3. Search + each sort behave; empty library shows the empty state.
4. Click a tile → its track list; click a track → the editor; back works at each level.

---

## Self-Review

**Spec coverage:** §3 gallery (tiles/mosaic/toolbar/hover-lift/chips/empty) → Tasks 4–7; §4 hover waveform *visual* (audio deferred) → Task 5; §5 collection (interim; cinematic in Plan 3) → Task 8; routing → Task 9; cover/waveform data path → Task 1/3.

**Placeholder scan:** none — every step has full code + commands. The marquee keyframe and i18n keys are spelled out.

**Type consistency:** `getLibraryTrackBlob` returns `{ file, hash }` used identically in `useTrackBlob`. `GallerySort = 'recent'|'az'|'kind'` shared by `gallery-sort.ts` + `Gallery`. `CollectionTile`/`Gallery`/`CollectionTracklist` props match their `app.tsx` call sites. `CollectionView`/`TrackSummary`/`CollectionKind` imported from `../../../shared/library` (renderer depth) and `../../shared/library` is **not** used here.

**Deferred to later plans:** cinematic collection hero (Plan 3), editor rework + version graph (Plan 4), hover **audio** + Activity dock + export toast + `audioPreviews` setting (Plan 5).
