# Library UI — Plan 3: Collection Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Plan 2's interim `CollectionTracklist` with the cinematic **collection page** — blurred-cover hero + sharp art, mono meta line, Export-all/Delete, and a dense track list with version/branch chips — so a collection feels like an album page. (Row-hover audio preview is Plan 5.)

**Architecture:** Mostly renderer. One small additive backend change: the `listCollections` aggregate gains per-track `versionCount`/`branchCount` (cheap `repo.listVersions/listBranches` counts) so rows can show chips without a `getLibraryTrack` round-trip each. Reuses Plan 2's `CollectionCover`, `useTrackBlob`, and Plan 1's `Button`. A new `useTrackMeta` hook lazily pulls artist/duration per row.

**Tech Stack:** TypeScript, React 19, Tailwind v4, `lucide-react`, Vitest + `renderToStaticMarkup`. **pnpm only.** Visual source of truth: `.superpowers/brainstorm/13600-1780446128/content/collection-page-v2.html`.

**Spec:** `.specs/2026-06-03-library-page-ui-design.md` §5.

**Depends on:** Plan 1 (`Button`), Plan 2 (`CollectionCover`, `useTrackBlob`, routing).

---

## File Structure

- **Modify** `src/shared/library.ts` — add optional `versionCount?`, `branchCount?`, `durationSec?` to `TrackSummary`.
- **Modify** `src/main/library/service.ts` — populate `versionCount`/`branchCount` in `listCollections`.
- **Modify** `src/main/library/service.test.ts` — assert the new counts.
- **Create** `src/renderer/src/library/use-track-meta.ts` — lazy artist/duration per track (via the blob file + `getTrackMetadata`).
- **Create** `src/renderer/src/library/library-track-row.tsx` (+ `.test.tsx`) — one dense track row (cover, index, title/artist, chips, duration, hover actions).
- **Create** `src/renderer/src/library/collection-view.tsx` (+ `.test.tsx`) — the cinematic page (hero + rows). Replaces `collection-tracklist.tsx`.
- **Delete** `src/renderer/src/library/collection-tracklist.tsx` + test.
- **Modify** `src/renderer/src/app.tsx` — render `CollectionView` instead of `CollectionTracklist`.
- **Modify** i18n en/de — `library.added`, `library.versionsN`, `library.branchesN`.

---

## Task 1: Per-track version/branch counts in the aggregate

**Files:**
- Modify: `src/shared/library.ts`
- Modify: `src/main/library/service.ts`
- Modify: `src/main/library/service.test.ts`

- [ ] **Step 1: Extend `TrackSummary`**

In `src/shared/library.ts`, change `TrackSummary` to:

```ts
export interface TrackSummary {
  id: string
  title: string
  orderIndex: number
  currentVersionId: string
  /** Total versions across all branches (for the "vN" chip). Optional for back-compat. */
  versionCount?: number
  /** Number of named branches (for the "⑂ branches" chip). */
  branchCount?: number
  /** Current version duration in seconds, if known (lazy; usually filled in the renderer). */
  durationSec?: number
}
```

- [ ] **Step 2: Add the failing service test**

In `src/main/library/service.test.ts`, inside the existing `describe`, add (mirroring the file's existing `svc()` / `done()` helpers and `ingestJobResult` usage):

```ts
  it('listCollections reports versionCount and branchCount per track', () => {
    const { service } = svc()
    service.ingestJobResult('j1', done('a'))
    const view = service.listCollections()[0]
    const tr = view.tracks[0]
    // a freshly ingested track has the raw root + the default-chain child = 2 versions, 1 branch (main)
    expect(tr.versionCount).toBe(2)
    expect(tr.branchCount).toBe(1)
  })
```

- [ ] **Step 3: Run it (expect failure)**

Run: `pnpm test -- src/main/library/service.test.ts`
Expected: FAIL — `versionCount`/`branchCount` are `undefined`.

- [ ] **Step 4: Populate the counts**

In `src/main/library/service.ts`, update the `listCollections` mapper (~lines 58-67) to:

```ts
  const listCollections = (): CollectionView[] =>
    repo.listCollections().map((c) => ({
      ...c,
      tracks: repo.listTracks(c.id).map((t) => ({
        id: t.id,
        title: t.title,
        orderIndex: t.orderIndex,
        currentVersionId: repo.getBranch(t.activeBranchId)!.tipVersionId,
        versionCount: repo.listVersions(t.id).length,
        branchCount: repo.listBranches(t.id).length
      }))
    }))
```

- [ ] **Step 5: Run + typecheck + commit**

Run: `pnpm test -- src/main/library/service.test.ts && pnpm run typecheck`
Expected: PASS.
```bash
git add src/shared/library.ts src/main/library/service.ts src/main/library/service.test.ts
git commit -m "feat(library): include version/branch counts in collection view"
```

---

## Task 2: `useTrackMeta` hook (lazy artist + duration)

No standalone test (thin glue over `window.plucker`); verified by typecheck + the row test.

**Files:**
- Create: `src/renderer/src/library/use-track-meta.ts`

- [ ] **Step 1: Implement**

```ts
// src/renderer/src/library/use-track-meta.ts
import { useEffect, useState } from 'react'

/**
 * Lazily fetch a library track's artist + duration from its current-version blob.
 * One round-trip to resolve the blob, one to read metadata. Returns nulls until loaded.
 */
export function useTrackMeta(trackId: string): { artist: string | null; durationSec: number | null } {
  const [meta, setMeta] = useState<{ artist: string | null; durationSec: number | null }>({
    artist: null,
    durationSec: null
  })
  useEffect(() => {
    let live = true
    setMeta({ artist: null, durationSec: null })
    void window.plucker.getLibraryTrackBlob(trackId).then((b) => {
      if (!live || !b.file) return
      window.plucker.getTrackMetadata(b.file, b.hash ?? undefined).then((m) => {
        if (live) setMeta({ artist: m.tags.artist ?? null, durationSec: m.audio.durationSec ?? null })
      })
    })
    return () => {
      live = false
    }
  }, [trackId])
  return meta
}
```

- [ ] **Step 2: Verify + commit**

Run: `pnpm run typecheck`
```bash
git add src/renderer/src/library/use-track-meta.ts
git commit -m "feat(library): add useTrackMeta hook (lazy artist + duration)"
```

---

## Task 3: `LibraryTrackRow`

**Files:**
- Create: `src/renderer/src/library/library-track-row.tsx`
- Test: `src/renderer/src/library/library-track-row.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/src/library/library-track-row.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { LibraryTrackRow } from './library-track-row'
import type { TrackSummary } from '../../../shared/library'

const tr: TrackSummary = { id: 't1', title: 'Neon Tide', orderIndex: 3, currentVersionId: 'v9', versionCount: 3, branchCount: 1 }

describe('LibraryTrackRow', () => {
  it('renders the index, title and a vN chip when there is edit history', () => {
    const html = renderToStaticMarkup(<LibraryTrackRow index={2} track={tr} onOpen={() => {}} onExport={() => {}} onDelete={() => {}} />)
    expect(html).toContain('Neon Tide')
    expect(html).toContain('03') // 1-based padded index
    expect(html).toContain('v3') // versionCount chip
  })
  it('renders a branch chip when the track has more than one branch', () => {
    const html = renderToStaticMarkup(
      <LibraryTrackRow index={0} track={{ ...tr, versionCount: 2, branchCount: 2 }} onOpen={() => {}} onExport={() => {}} onDelete={() => {}} />
    )
    expect(html).toContain('⑂')
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/renderer/src/library/library-track-row.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/renderer/src/library/library-track-row.tsx
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Music, ArrowUpRight, Upload, Trash2 } from 'lucide-react'
import type { TrackSummary } from '../../../shared/library'
import { useTrackBlob } from './use-track-blob'
import { useTrackMeta } from './use-track-meta'

function fmtDuration(sec: number | null): string {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** A dense library track row: cover, index, title/artist, version chips, duration, hover actions. */
export function LibraryTrackRow({
  index,
  track,
  onOpen,
  onExport,
  onDelete
}: {
  index: number
  track: TrackSummary
  onOpen: (trackId: string) => void
  onExport: (trackId: string) => void
  onDelete: (trackId: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const { cover } = useTrackBlob(track.id)
  const { artist, durationSec } = useTrackMeta(track.id)
  const stop = (e: React.MouseEvent): void => e.stopPropagation()
  const versions = track.versionCount ?? 0
  const branches = track.branchCount ?? 0

  return (
    <div className="group flex h-[52px] items-center gap-3 border-b border-line2 px-[18px] hover:bg-white/[0.018]">
      <span className="w-[22px] text-center font-mono text-[11px] text-ink-faint">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-[5px] border border-line bg-[#23272e]">
        {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <Music size={14} className="text-ink-faint" />}
      </div>
      <button onClick={() => onOpen(track.id)} className="flex min-w-0 flex-1 flex-col items-start text-left">
        <span className="flex items-center truncate text-[13px] font-medium text-ink">
          {track.title}
          {versions > 1 && (
            <span className="ml-2 rounded-[4px] border border-[rgba(74,163,255,.35)] px-1.5 font-mono text-[8.5px] tracking-[.6px] text-[#4aa3ff]">
              v{versions}
            </span>
          )}
          {branches > 1 && (
            <span className="ml-1.5 rounded-[4px] border border-[rgba(63,201,127,.4)] px-1.5 font-mono text-[8.5px] tracking-[.6px] text-ok">
              ⑂ {branches}
            </span>
          )}
        </span>
        {artist && <span className="truncate text-[11px] text-ink-dim">{artist}</span>}
      </button>
      <span className="w-12 text-right font-mono text-[11px] text-ink-faint">{fmtDuration(durationSec)}</span>
      <div className="flex w-[84px] justify-end gap-1.5 opacity-0 transition-opacity group-hover:opacity-100" onClick={stop}>
        <button aria-label={t('library.open')} onClick={() => onOpen(track.id)} className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-white/[0.06] text-ink-dim hover:text-ink">
          <ArrowUpRight size={12} />
        </button>
        <button aria-label={t('library.export')} onClick={() => onExport(track.id)} className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-white/[0.06] text-ink-dim hover:text-ink">
          <Upload size={12} />
        </button>
        <button aria-label={t('common.delete')} onClick={() => onDelete(track.id)} className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-white/[0.06] text-ink-dim hover:text-ink">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: i18n + run + commit**

Add `library.open: 'Open'`, `library.export: 'Export'` (en/de; `library.export` may already exist from the model build — reuse).
Run: `pnpm test -- src/renderer/src/library/library-track-row.test.tsx && pnpm run typecheck`
Expected: PASS.
```bash
git add src/renderer/src/library/library-track-row.tsx src/renderer/src/library/library-track-row.test.tsx src/renderer/src/i18n/locales
git commit -m "feat(library): add dense library track row with version chips"
```

---

## Task 4: `CollectionView` (cinematic page)

**Files:**
- Create: `src/renderer/src/library/collection-view.tsx`
- Test: `src/renderer/src/library/collection-view.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/src/library/collection-view.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { CollectionView } from './collection-view'
import type { CollectionView as CV } from '../../../shared/library'

const col: CV = {
  id: 'c1', kind: 'playlist', title: 'Road Trip', sourceUrl: 'https://youtube.com/x', createdAt: '2026-06-01T00:00:00Z',
  tracks: [
    { id: 't1', title: 'Highway Lights', orderIndex: 1, currentVersionId: 'v1' },
    { id: 't2', title: 'Open Road', orderIndex: 2, currentVersionId: 'v2' }
  ]
}
const noop = (): void => {}

describe('CollectionView', () => {
  it('renders the hero title, kind, track count, and each track', () => {
    const html = renderToStaticMarkup(
      <CollectionView collection={col} onBack={noop} onOpenTrack={noop} onExportTrack={noop} onDeleteTrack={noop} onExportAll={noop} onDelete={noop} />
    )
    expect(html).toContain('Road Trip')
    expect(html).toContain('Playlist')
    expect(html).toContain('2') // track count
    expect(html).toContain('Highway Lights')
    expect(html).toContain('Open Road')
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/renderer/src/library/collection-view.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (visual values from `collection-page-v2.html`)

```tsx
// src/renderer/src/library/collection-view.tsx
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react'
import type { CollectionView as CV } from '../../../shared/library'
import { CollectionCover } from './collection-cover'
import { LibraryTrackRow } from './library-track-row'
import { Button } from '../ui/button'

/** The cinematic collection page: blurred-cover hero + sharp art + meta + a dense track list. */
export function CollectionView({
  collection,
  onBack,
  onOpenTrack,
  onExportTrack,
  onDeleteTrack,
  onExportAll,
  onDelete
}: {
  collection: CV
  onBack: () => void
  onOpenTrack: (trackId: string) => void
  onExportTrack: (trackId: string) => void
  onDeleteTrack: (trackId: string) => void
  onExportAll: (id: string) => void
  onDelete: (id: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const host = collection.sourceUrl?.replace(/^https?:\/\//, '').split('/')[0]
  const added = new Date(collection.createdAt).toLocaleDateString()

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* HERO */}
      <div className="relative flex-none overflow-hidden border-b border-line">
        <div className="absolute inset-0 scale-110 opacity-100">
          {/* blurred backdrop reuses the same artwork */}
          <div className="absolute -inset-10 blur-[34px] brightness-[.55] saturate-[1.2]">
            <CollectionCover kind={collection.kind} tracks={collection.tracks} />
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-surface/95 to-surface/55" />
        <button onClick={onBack} className="absolute left-[18px] top-3 z-10 flex items-center gap-1 font-mono text-[10px] text-ink-dim hover:text-ink">
          <ChevronLeft size={13} />
          {t('library.backToLibrary')}
        </button>
        <div className="relative z-[2] flex items-end gap-5 p-[18px] pt-9">
          <div className="h-[118px] w-[118px] flex-none overflow-hidden rounded-[10px] border border-white/10 shadow-[0_14px_30px_rgba(0,0,0,.55)]">
            <CollectionCover kind={collection.kind} tracks={collection.tracks} />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="font-mono text-[9px] uppercase tracking-[1.5px] text-white/60">{t(`library.kind.${collection.kind}`)}</div>
            <h2 className="my-1.5 truncate text-[30px] font-bold leading-none tracking-[-.5px] text-white">{collection.title}</h2>
            <div className="flex flex-wrap gap-2 font-mono text-[11px] text-white/65">
              <span>{t('library.tracksN', { count: collection.tracks.length })}</span>
              {host && (<><span className="text-white/30">·</span><span>{host}</span></>)}
              <span className="text-white/30">·</span>
              <span>{t('library.added', { date: added })}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" onClick={() => onExportAll(collection.id)}>{t('library.exportAll')}</Button>
              <Button onClick={() => onDelete(collection.id)}>{t('common.delete')}</Button>
            </div>
          </div>
        </div>
      </div>

      {/* TRACK LIST */}
      <div className="min-h-0 flex-1 overflow-auto">
        {collection.tracks.map((tr, i) => (
          <LibraryTrackRow
            key={tr.id}
            index={i}
            track={tr}
            onOpen={onOpenTrack}
            onExport={onExportTrack}
            onDelete={onDeleteTrack}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: i18n**

Add under `library`: `tracksN: '{{count}} tracks'`, `added: 'added {{date}}'`. (German: `'{{count}} Titel'`, `'hinzugefügt {{date}}'`.)

- [ ] **Step 5: Run + typecheck + commit**

Run: `pnpm test -- src/renderer/src/library/collection-view.test.tsx && pnpm run typecheck`
Expected: PASS.
```bash
git add src/renderer/src/library/collection-view.tsx src/renderer/src/library/collection-view.test.tsx src/renderer/src/i18n/locales
git commit -m "feat(library): add cinematic collection page"
```

---

## Task 5: Swap `app.tsx` to `CollectionView`; remove the interim list

**Files:**
- Modify: `src/renderer/src/app.tsx`
- Delete: `src/renderer/src/library/collection-tracklist.tsx` + test

- [ ] **Step 1: Remove the interim view**

```bash
git rm src/renderer/src/library/collection-tracklist.tsx src/renderer/src/library/collection-tracklist.test.tsx
```

- [ ] **Step 2: Swap the import + usage in `app.tsx`**

Replace `import { CollectionTracklist } from './library/collection-tracklist'` with:

```tsx
import { CollectionView } from './library/collection-view'
```

Replace the `<CollectionTracklist .../>` block (added in Plan 2 Task 9) with:

```tsx
                  <CollectionView
                    collection={col}
                    onBack={() => setOpenCollectionId(null)}
                    onOpenTrack={openTrack}
                    onExportTrack={(trackId) => void exportTrackIds([trackId])}
                    onDeleteTrack={(trackId) => {
                      void window.plucker.deleteLibraryTrack(trackId).then(() => void refreshLibrary())
                    }}
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
```

- [ ] **Step 3: Run + typecheck + lint + commit**

Run: `pnpm run typecheck && pnpm test -- src/renderer/src/library && pnpm run lint`
Expected: PASS.
```bash
git add src/renderer/src/app.tsx src/renderer/src/library
git commit -m "feat(library): use the cinematic collection page"
```

---

## Final verification

- [ ] Run: `pnpm run lint && pnpm run typecheck && pnpm test` → all PASS.
- [ ] Manual (`pnpm dev`): open a collection → cinematic hero (blurred backdrop + sharp art, kind/count/source/date, Export-all/Delete) → dense rows with covers, artist, duration, and `vN`/`⑂` chips on edited tracks → click a row opens the editor; back returns to the gallery.

---

## Self-Review

**Spec coverage:** §5 hero (blurred backdrop + sharp art + meta + actions + back) → Task 4; dense rows + version/branch chips → Tasks 1, 3; (row-hover audio preview → Plan 5, noted).

**Placeholder scan:** none — full code + commands + i18n keys.

**Type consistency:** `TrackSummary` gains optional fields (back-compat with Plan 2). `CollectionView` (component) props match the `app.tsx` block. Renderer imports use `../../../shared/library`. `fmtDuration` is local; `useTrackBlob`/`useTrackMeta` signatures match their definitions.

**Deferred:** editor + version graph (Plan 4); row-hover audio, Activity dock, export toast, `audioPreviews` (Plan 5).
