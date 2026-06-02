# Re-trigger Transforms Without Re-download — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-run the currently-enabled transform chain on already-downloaded tracks in place, with no yt-dlp/download step, surfaced from the History page selection via a context-menu item and a native app-menubar item.

**Architecture:** Generalize the pipeline's *acquire* step into a pluggable `JobSource`. `runPipeline(source, deps)` drives the shared core (`finishTrack`: hash → transform chain → probe → cache → record). A behavior-preserving `DownloadSource` wraps today's resolve+yt-dlp path; a new `RetransformSource` yields already-downloaded files via an identity `provide()`. Persistence stays in the IPC handlers: downloads `addEntry`, re-transforms `updateTrack` in place.

**Tech Stack:** Electron (main/preload/renderer), TypeScript, React, i18next, Vitest, pnpm.

---

## File Structure

- **Modify** `src/main/pipeline.ts` — add `JobSource`/`SourceEntry`/`ProvideOutcome` types; refactor `runJob` into `runPipeline(source, deps)` + a thin `runJob` wrapper that builds a `DownloadSource`; per-entry `destFolder`; `finishTrack(t, file, entry)`.
- **Create** `src/main/retransform-source.ts` — `buildRetransformSource(targets)` returning a `JobSource`.
- **Create** `src/main/retransform-source.test.ts` — unit tests for it.
- **Modify** `src/main/history.ts` — add pure `updateTrack(history, entryId, index, patch)`.
- **Modify** `src/main/history.test.ts` — tests for `updateTrack`.
- **Modify** `src/main/index.ts` — add `job:retransform` IPC handler.
- **Modify** `src/preload/index.ts` — add `retransform()` + `onRetransformSelection()`.
- **Modify** `src/main/menu.ts` — add the "Re-run transforms on selection" menu item.
- **Modify** `src/shared/menu-strings.ts` — add `retransformSelection` label (en/de).
- **Modify** `src/renderer/src/history-view.tsx` — `retransformTargets()`, transient notice, context-menu item wiring, menu-event subscription.
- **Modify** `src/renderer/src/track-row-menu.ts` — add `onRetransform` history item.
- **Modify** `src/renderer/src/track-row-menu.test.ts` — assert the new item (if the test file exists; otherwise skip this step).
- **Modify** `src/renderer/src/i18n/locales/en.ts` + `de.ts` — `context.retransform`, `history.retransformSkipped`, `history.retransformNone`.

---

## Task 1: `updateTrack` history helper

**Files:**
- Modify: `src/main/history.ts`
- Test: `src/main/history.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/main/history.test.ts` (import `updateTrack` alongside the existing imports):

```ts
describe('updateTrack', () => {
  const entry = (id: string): HistoryEntry => ({
    id,
    url: 'u',
    title: 't',
    folder: '/f',
    kind: 'playlist',
    completedAt: '2026-06-02T00:00:00.000Z',
    outcome: 'completed',
    tracks: [
      { title: 'A', status: 'done', file: '/f/a.mp3' },
      { title: 'B', status: 'done', file: '/f/b.mp3' }
    ]
  })

  it('merges a patch onto the track at (entryId, index)', () => {
    const next = updateTrack([entry('e1')], 'e1', 1, { title: 'B2', file: '/f/b2.mp3' })
    expect(next[0].tracks[1]).toEqual({ title: 'B2', status: 'done', file: '/f/b2.mp3' })
    expect(next[0].tracks[0]).toEqual({ title: 'A', status: 'done', file: '/f/a.mp3' })
  })

  it('no-ops on an unknown entry id or out-of-range index', () => {
    const h = [entry('e1')]
    expect(updateTrack(h, 'nope', 0, { title: 'X' })[0].tracks[0].title).toBe('A')
    expect(updateTrack(h, 'e1', 9, { title: 'X' })[0].tracks[0].title).toBe('A')
  })

  it('does not mutate the input array or entries', () => {
    const h = [entry('e1')]
    const snapshot = JSON.parse(JSON.stringify(h))
    updateTrack(h, 'e1', 0, { title: 'changed' })
    expect(h).toEqual(snapshot)
  })
})
```

Ensure `HistoryEntry` is imported in the test file (it already imports from `../shared/types`; add `HistoryEntry` if missing).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/history.test.ts -t updateTrack`
Expected: FAIL — `updateTrack is not a function` / not exported.

- [ ] **Step 3: Implement `updateTrack`**

Append to `src/main/history.ts`:

```ts
/**
 * Merge a partial patch onto the track at `index` within entry `entryId`.
 * Used when re-running transforms in place: the file may be renamed and the
 * tags refreshed, but the entry and the other tracks are untouched. No-ops on
 * an unknown entry id or out-of-range index. Returns a new array (immutable).
 */
export function updateTrack(
  history: HistoryEntry[],
  entryId: string,
  index: number,
  patch: Partial<HistoryTrack>
): HistoryEntry[] {
  return history.map((e) => {
    if (e.id !== entryId || index < 0 || index >= e.tracks.length) return e
    const tracks = e.tracks.map((t, i) => (i === index ? { ...t, ...patch } : t))
    return { ...e, tracks }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/history.test.ts -t updateTrack`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/history.ts src/main/history.test.ts
git commit -m "feat(history): add updateTrack for in-place track patches"
```

---

## Task 2: Refactor pipeline to a pluggable `JobSource`

Behavior-preserving refactor of the download path. No new runtime behavior — verified by the existing `pipeline.test.ts` pure-function suite plus typecheck/lint. (There is no end-to-end `runJob` test in this repo, so do not invent one; the seam is what matters.)

**Files:**
- Modify: `src/main/pipeline.ts`

- [ ] **Step 1: Add the source contract types**

Insert after the `RunJobDeps` interface (around `src/main/pipeline.ts:180`). `ProgressEvent` is already imported from `./ytdlp`:

```ts
/** Outcome of acquiring one entry's local file (download, or already on disk). */
export type ProvideOutcome =
  | { kind: 'file'; file: string }
  | { kind: 'skipped'; reason: string }
  | { kind: 'failed'; reason: string; errorCode?: string }

/** One work item: where it goes + how to obtain its local file. */
export interface SourceEntry {
  index: number
  title: string
  videoId?: string
  /** Per-entry destination folder (the transform chain commits here). */
  destFolder: string
  /** Acquire the local working file for this entry. */
  provide(
    t: TrackProgress,
    onProgress: (e: ProgressEvent) => void,
    signal?: AbortSignal
  ): Promise<ProvideOutcome>
}

/** A pluggable acquire phase. `entries()` is called after `resolve()`. */
export interface JobSource {
  resolve(signal?: AbortSignal): Promise<{ title: string; kind: 'playlist' | 'video' }>
  entries(): SourceEntry[]
}
```

- [ ] **Step 2: Extract `runPipeline` and reduce `runJob` to a wrapper**

Refactor the body of `runJob` (`src/main/pipeline.ts:309`) so the resolve + per-entry download logic lives in a locally-built `DownloadSource`, and the orchestration lives in a new exported `runPipeline(source, deps)`. Concretely:

1. Rename the existing `export async function runJob(url, deps)` body into `export async function runPipeline(source: JobSource, deps: RunJobDeps): Promise<JobResult>`.
2. Inside `runPipeline`, replace the resolve block (the `resolveOnce` / cookie-escalation try/catch and `parseEntries`) with `const resolved = await source.resolve(signal)` and use `source.entries()` for the work items. The returned `JobResult.title/kind/url` come from `resolved` (carry `url` via deps — see step 3).
3. Replace the single `const dest = …` with **per-entry** `destFolder` taken from each `SourceEntry`. `mkdirSync(entry.destFolder, { recursive: true })` before providing.
4. Change `finishTrack(t, filePath)` to `finishTrack(t, filePath, entry: SourceEntry)`; inside it use `const dest = entry.destFolder` and build `info` with entry fallbacks:

```ts
const sidecar = readSidecar(sidecarPath)
// ...
const res = await runTransformChain(
  filePath,
  entry.destFolder,
  {
    videoId: sidecar.id ?? entry.videoId,
    rawTitle: sidecar.title ?? entry.title ?? t.title,
    sourceFile: filePath,
    index: t.index,
    contentHash: hash
  },
  enabled,
  registry,
  services,
  (f) => { t.transformPercent = Math.round(f * 100); emit() },
  (stage) => { t.stage = stage; emit() }
)
```

5. Change `processEntry(entry: PlaylistEntry, t)` to `processEntry(entry: SourceEntry, t)`: replace the `buildDownloadArgs`/`runYtDlp`/`classifyDownload` block with `const outcome = await entry.provide(t, onProgress, signal)` and branch on `outcome.kind` (`'skipped'` → `t.status='skipped'; t.reason=outcome.reason`; `'failed'` → `t.status='failed'; t.reason=outcome.reason; if (outcome.errorCode) t.errorCode = outcome.errorCode`; `'file'` → `await finishTrack(t, outcome.file, entry)`). Keep the existing trackSpan timing, `markCancelledTracks`/`finalizePendingTracks` backstops, and history assembly unchanged.
6. Build the `tracks: TrackProgress[]` from `source.entries()` (index/title/videoId), unchanged in shape.
7. Add the wrapper that preserves the public API:

```ts
/** Build the download source: resolve via yt-dlp, then download each entry. */
function buildDownloadSource(url: string, deps: RunJobDeps): JobSource {
  // ...move the resolveOnce + cookie-escalation closure and the per-entry
  // buildDownloadArgs/runYtDlp/classifyDownload logic here. resolve() returns
  // { title, kind } and stores the resolved entries + derived single `dest`
  // (destFolderFor(...) or deps.folderOverride) in closure state; entries()
  // maps each PlaylistEntry to a SourceEntry whose destFolder is that single
  // `dest` and whose provide() runs the download exactly as processEntry does today.
}

export async function runJob(url: string, deps: RunJobDeps): Promise<JobResult> {
  return runPipeline(buildDownloadSource(url, deps), deps)
}
```

> Note: `JobResult` already carries `url`. In `runPipeline`, set `url` from a new optional `deps.sourceUrl ?? ''` OR keep `runJob` passing `url` through `JobResult` by having `buildDownloadSource` expose it. Simplest: add `url?: string` to `RunJobDeps` and have `buildDownloadSource` set `deps.sourceUrl = url`; `runPipeline` reads it for the result. For the retransform source, leave it `''`.

Keep `onStatus` (`resolving` phase) emitted from inside `buildDownloadSource.resolve()` exactly as today. The retransform source simply won't emit `onStatus`.

- [ ] **Step 3: Run the existing pipeline tests + typecheck**

Run: `pnpm vitest run src/main/pipeline.test.ts && pnpm typecheck`
Expected: PASS — the pure helpers (`parseEntries`, `classifyDownload`, `finalizePendingTracks`, `toHistoryTracks`, `jobOutcome`, `destFolderFor`, `isRelevantStatusLine`) are unchanged, and types compile.

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: no new warnings.

- [ ] **Step 5: Commit**

```bash
git add src/main/pipeline.ts
git commit -m "refactor(pipeline): drive runJob through a pluggable JobSource"
```

---

## Task 3: `RetransformSource`

**Files:**
- Create: `src/main/retransform-source.ts`
- Test: `src/main/retransform-source.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/retransform-source.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fs from 'node:fs'
import { buildRetransformSource, type RetransformTarget } from './retransform-source'

const targets: RetransformTarget[] = [
  { entryId: 'e1', index: 0, file: '/m/Songs/a.mp3', title: 'A', videoId: 'va' },
  { entryId: 'e2', index: 3, file: '/m/Other/b.mp3', title: 'B', videoId: 'vb' }
]

afterEach(() => vi.restoreAllMocks())

describe('buildRetransformSource', () => {
  it('resolves to a retransform-shaped job titled by count', async () => {
    const src = buildRetransformSource(targets)
    expect(await src.resolve()).toEqual({ title: 'Re-running transforms · 2 tracks', kind: 'video' })
  })

  it('maps each target to an entry with a unique synthetic index and its own destFolder', () => {
    const entries = buildRetransformSource(targets).entries()
    expect(entries.map((e) => e.index)).toEqual([1, 2])
    expect(entries.map((e) => e.destFolder)).toEqual(['/m/Songs', '/m/Other'])
    expect(entries.map((e) => e.title)).toEqual(['A', 'B'])
    expect(entries.map((e) => e.videoId)).toEqual(['va', 'vb'])
  })

  it('provide() yields the existing file when present', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    const entry = buildRetransformSource(targets).entries()[0]
    const tp = { index: 1, title: 'A', status: 'transforming', percent: 100, transformPercent: 0 } as never
    expect(await entry.provide(tp, () => {})).toEqual({ kind: 'file', file: '/m/Songs/a.mp3' })
  })

  it('provide() fails when the file is gone', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    const entry = buildRetransformSource(targets).entries()[0]
    const tp = { index: 1, title: 'A', status: 'transforming', percent: 100, transformPercent: 0 } as never
    expect(await entry.provide(tp, () => {})).toEqual({ kind: 'failed', reason: 'Source file is missing' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/retransform-source.test.ts`
Expected: FAIL — module not found / `buildRetransformSource` undefined.

- [ ] **Step 3: Implement the source**

Create `src/main/retransform-source.ts`:

```ts
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import type { JobSource, SourceEntry } from './pipeline'

/** One already-downloaded track to re-run the enabled transform chain on. */
export interface RetransformTarget {
  entryId: string
  index: number
  file: string
  title: string
  videoId?: string
}

/**
 * A JobSource over already-downloaded files. No network, no yt-dlp: each entry's
 * `provide()` just confirms the file is still on disk and hands it to the shared
 * transform/probe/cache core. Synthetic 1-based indices keep the chain's working
 * files (`.plucker-tmp-${index}-…`) unique across targets from different entries.
 */
export function buildRetransformSource(targets: RetransformTarget[]): JobSource {
  const entries: SourceEntry[] = targets.map((tgt, i) => ({
    index: i + 1,
    title: tgt.title,
    videoId: tgt.videoId,
    destFolder: dirname(tgt.file),
    async provide() {
      if (!existsSync(tgt.file)) return { kind: 'failed', reason: 'Source file is missing' }
      return { kind: 'file', file: tgt.file }
    }
  }))
  return {
    resolve: async () => ({
      title: `Re-running transforms · ${targets.length} track${targets.length === 1 ? '' : 's'}`,
      kind: 'video'
    }),
    entries: () => entries
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/retransform-source.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/retransform-source.ts src/main/retransform-source.test.ts
git commit -m "feat(pipeline): add RetransformSource for already-downloaded files"
```

---

## Task 4: `job:retransform` IPC handler + preload API

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add the preload methods**

In `src/preload/index.ts`, inside the `api` object after the History block (around line 86), add:

```ts
  // Re-run the enabled transform chain on already-downloaded tracks (no re-download).
  retransform: (targets: { entryId: string; index: number }[]): Promise<void> =>
    ipcRenderer.invoke('job:retransform', targets),
  onRetransformSelection: (cb: () => void): (() => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('menu:retransform-selection', fn)
    return () => ipcRenderer.removeListener('menu:retransform-selection', fn)
  },
```

- [ ] **Step 2: Add the main-process handler**

In `src/main/index.ts`, import the new pieces (add to the existing imports):

```ts
import { runJob, runPipeline } from './pipeline'
import { buildRetransformSource, type RetransformTarget } from './retransform-source'
import { addEntry, entryFiles, removeEntry, removeTrack, updateTrack } from './history'
```

Then register a handler next to `job:start` (after `src/main/index.ts:294`):

```ts
  ipcMain.handle('job:retransform', async (_e, targets: RetransformTarget[]) => {
    const fresh = loadSettings()
    // Resolve each target to a concrete file from current history (status 'done'
    // + a real path). Anything else is silently dropped — the renderer already
    // filtered, this is the trust-but-verify backstop.
    const resolved: RetransformTarget[] = []
    for (const tgt of targets) {
      const track = fresh.history.find((h) => h.id === tgt.entryId)?.tracks[tgt.index]
      if (track?.status === 'done' && track.file) {
        resolved.push({ ...tgt, file: track.file, title: track.title, videoId: track.videoId })
      }
    }
    if (resolved.length === 0) return

    resumeAllChildren()
    getWindow()?.webContents.send('job:paused', false)
    abort = new AbortController()
    try {
      const result = await runPipeline(buildRetransformSource(resolved), {
        bin: currentBin(),
        settings: fresh,
        homeBase: expandHome(fresh.downloads.baseFolder),
        cache: getMetaCache(),
        onProgress: (p) => {
          const win = getWindow()
          win?.webContents.send('job:progress', p)
          win?.setProgressBar(p.overall > 0 && p.overall < 1 ? p.overall : p.overall >= 1 ? 1 : -1)
        },
        signal: abort.signal
      })
      getWindow()?.setProgressBar(-1)

      // Fold each successfully re-transformed track back into history in place.
      // result.tracks is index-aligned with `resolved`. Skip non-done results so a
      // failed transform never clobbers a still-intact original.
      const latest = loadSettings()
      let history = latest.history
      result.tracks.forEach((tk, i) => {
        if (tk.status !== 'done') return
        const tgt = resolved[i]
        history = updateTrack(history, tgt.entryId, tgt.index, {
          file: tk.file,
          title: tk.title,
          artist: tk.artist,
          album: tk.album,
          year: tk.year,
          hash: tk.hash
        })
      })
      saveSettings(settingsPath(), { ...latest, history })
      getWindow()?.webContents.send('history:changed')
    } catch (err) {
      getWindow()?.setProgressBar(-1)
      const cancelled = abort?.signal.aborted ?? false
      if (!cancelled) {
        const message = err instanceof Error ? err.message : String(err)
        log.error('app', 'retransform failed:', err)
        getWindow()?.webContents.send('job:status', { phase: 'error', error: message })
      } else {
        log.info('app', 'retransform cancelled')
      }
    }
  })
```

(`HistoryTrack` has `artist`/`album`/`year`/`hash`; `JobResult.tracks` are `HistoryTrack`, so `tk.artist` etc. are valid.)

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS — `runPipeline` and `updateTrack` resolve; preload `PluckerApi` type picks up the new methods automatically.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat(history): job:retransform handler + preload API"
```

---

## Task 5: History-page integration (handler, context menu, i18n)

**Files:**
- Modify: `src/renderer/src/track-row-menu.ts`
- Modify: `src/renderer/src/history-view.tsx`
- Modify: `src/renderer/src/i18n/locales/en.ts`, `src/renderer/src/i18n/locales/de.ts`
- Test: `src/renderer/src/track-row-menu.test.ts` (only if it exists)

- [ ] **Step 1: Add i18n keys**

`en.ts` — add to `context` (after `redownload`): `retransform: 'Re-run transforms',`
and to `history`:
```ts
    retransformSkipped_one: 'Skipped {{count}} track (no file)',
    retransformSkipped_other: 'Skipped {{count}} tracks (no file)',
    retransformNone: 'No re-transformable tracks selected',
```
`de.ts` — mirror under `context`: `retransform: 'Transformationen erneut ausführen',`
and under `history`:
```ts
    retransformSkipped_one: '{{count}} Titel übersprungen (keine Datei)',
    retransformSkipped_other: '{{count}} Titel übersprungen (keine Datei)',
    retransformNone: 'Keine erneut transformierbaren Titel ausgewählt',
```

- [ ] **Step 2: Add the context-menu item (history variant)**

In `src/renderer/src/track-row-menu.ts`: add `onRetransform?: () => void` to the `opts` type, and in the `variant === 'history'` block (after the redownload push at line ~58) add:

```ts
  if (variant === 'history' && opts.onRetransform) {
    items.push({ label: t('context.retransform'), enabled: hasFile, onClick: opts.onRetransform })
  }
```

If `src/renderer/src/track-row-menu.test.ts` exists, add an assertion that a `variant:'history'` build with a `file` and `onRetransform` includes an enabled `context.retransform` item; otherwise skip.

- [ ] **Step 3: Add `retransformTargets` + transient notice in history-view**

In `src/renderer/src/history-view.tsx`:

Add state near the other `useState`s (after `selected`):
```ts
  const [notice, setNotice] = useState<string | null>(null)
```

Add the handler near `redownloadTargets` (after `src/renderer/src/history-view.tsx:143`):
```ts
  // Re-run the enabled transform chain on the selection, in place — no download.
  // Only tracks with a real file on disk are eligible; the rest are reported.
  async function retransformTargets(keys: string[]): Promise<void> {
    const targets: { entryId: string; index: number }[] = []
    let skipped = 0
    for (const key of keys) {
      const hit = lookup(key)
      if (hit && deletable(hit.track)) targets.push({ entryId: hit.entry.id, index: hit.index })
      else skipped++
    }
    if (targets.length === 0) {
      if (keys.length > 0) setNotice(t('history.retransformNone'))
      return
    }
    onNavigateDownload()
    setNotice(skipped > 0 ? t('history.retransformSkipped', { count: skipped }) : null)
    await window.plucker.retransform(targets)
    setSelected(new Set())
    setAnchor(null)
  }
```

Clear the notice when the selection changes (add to the existing `onRowSelect`, after `setSelected(r.selected)`): `setNotice(null)`.

Render the notice in the header — after the search-bar `</div>` (around line 229) add:
```tsx
      {notice && <div className="mb-3 rounded-md border border-line bg-raise px-3 py-1.5 text-[12px] text-ink-dim">{notice}</div>}
```

- [ ] **Step 4: Wire the context-menu item**

In the `trackRowMenuItems({...})` call (around `src/renderer/src/history-view.tsx:351`), add:
```ts
                          onRetransform: () => void retransformTargets(targetsFor(selected, key)),
```

- [ ] **Step 5: Subscribe to the menubar event**

Add an effect (near the keydown effect, ~line 204) so the native menu item acts on the live selection:
```ts
  useEffect(() => {
    return window.plucker.onRetransformSelection(() => void retransformTargets([...selected]))
    // retransformTargets closes over history/missing/selected; re-bind when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, history, missing])
```

- [ ] **Step 6: Run renderer tests + typecheck + lint**

Run: `pnpm vitest run src/renderer && pnpm typecheck && pnpm lint`
Expected: PASS (existing tests green; new menu-item assertion green if added).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/history-view.tsx src/renderer/src/track-row-menu.ts src/renderer/src/track-row-menu.test.ts src/renderer/src/i18n/locales/en.ts src/renderer/src/i18n/locales/de.ts
git commit -m "feat(history): re-run transforms on selection from the context menu"
```

---

## Task 6: Native app-menubar item

**Files:**
- Modify: `src/shared/menu-strings.ts`
- Modify: `src/main/menu.ts`

- [ ] **Step 1: Add the menu label string**

In `src/shared/menu-strings.ts`, add to both `en` and `de`:
```ts
    retransformSelection: 'Re-run Transforms on Selection',  // en
```
```ts
    retransformSelection: 'Transformationen für Auswahl erneut ausführen',  // de
```

- [ ] **Step 2: Add the menu item to the Go submenu**

In `src/main/menu.ts`, inside `buildAppMenu`, add an item that messages the renderer, and append it to `goSubmenu` after the History nav item:
```ts
  const retransformItem: MenuItemConstructorOptions = {
    label: t.retransformSelection,
    click: () => getWindow()?.webContents.send('menu:retransform-selection')
  }
```
In the `goSubmenu` array, after the `history` line:
```ts
    { type: 'separator' },
    retransformItem,
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS — `t.retransformSelection` resolves via the `MENU[lang]` type.

- [ ] **Step 4: Manual smoke test**

Run: `pnpm dev`. On the History page, select ≥1 downloaded track → right-click → "Re-run transforms" (and separately: **Go → Re-run Transforms on Selection**). Expected: navigates to Download view, the deck shows the tracks at `transforming` with live progress + working cancel/pause; on completion the history rows refresh (e.g. tags/filename updated by the enabled chain). Select a failed/missing track too and confirm the "Skipped N (no file)" notice appears and only eligible tracks run.

- [ ] **Step 5: Commit**

```bash
git add src/shared/menu-strings.ts src/main/menu.ts
git commit -m "feat(menu): re-run transforms on the history selection from the app menu"
```

---

## Self-Review

**Spec coverage:**
- Pluggable source (general support) → Tasks 2, 3. ✅
- Re-run *currently enabled* chain in place → Task 2 reuses `settings.transforms.filter(enabled)` + `finishTrack`; Task 4 patches history via `updateTrack`. ✅
- Reuse the download deck (progress/cancel/pause) → Task 4 shares the `AbortController` + `job:progress`/`job:paused`; renderer `jobActive` already shows the deck for `transforming` tracks. ✅
- Context-menu trigger → Task 5. ✅
- App-menubar trigger → Task 6. ✅
- Skip + report ineligible → Task 5 (`retransformSkipped` notice; main-side backstop in Task 4). ✅
- `updateTrack` + rename-aware in-place update → Task 1; rename handled by the unchanged `finishTrack` rule (Task 2). ✅
- Tests: `updateTrack` (T1), `RetransformSource` (T3); pipeline pure-fn suite preserved (T2). ✅
- Caveat (cumulative audio transforms) — documented in spec; no code guard, intentional. ✅

**Placeholder scan:** No TBD/TODO. The only prose-described change is the `runJob`→`runPipeline` refactor (Task 2), which is a move of existing, in-repo code with exact signatures and the changed loop/finishTrack code shown — appropriate for a refactor of a 300-line function rather than re-transcribing it whole.

**Type consistency:** `JobSource`/`SourceEntry`/`ProvideOutcome` defined in Task 2 are imported by `retransform-source.ts` (T3) and `index.ts` (T4). `RetransformTarget` defined in T3, consumed in T4. `updateTrack` signature identical across T1/T4. `retransform`/`onRetransformSelection` preload names match their `ipcRenderer` channels (`job:retransform`, `menu:retransform-selection`) used in T4/T6. i18n keys (`context.retransform`, `history.retransformSkipped`, `history.retransformNone`, `menu.retransformSelection`) consistent across T5/T6.
