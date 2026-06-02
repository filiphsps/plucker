# Re-trigger transformations without re-downloading

**Date:** 2026-06-02
**Status:** Approved (design)

## Problem

Once a track is downloaded, the only way to re-apply the transform chain (auto-tag,
analyze key/BPM, trim-silence, square-cover, rename, …) is to re-download it through
yt-dlp. That is slow, wasteful, and pointless — the audio is already on disk. We want
to re-run the **currently enabled** transform chain against already-downloaded tracks,
in place, with no network/download step.

The first place to surface this is the History page: act on the current track
selection, triggered from both the right-click context menu and a native app-menubar
item.

## Goals

- A reusable main-process capability to re-run the enabled transform chain on one or
  more already-downloaded tracks, updating each file + its history record in place.
- Live feedback through the **existing** TransportDeck (progress, cancel, pause) — a
  re-transform looks like a normal job minus the download phase.
- History-page integration on the current selection, from a context-menu item **and**
  a native app-menubar item, both routing through one renderer handler.

## Non-goals

- No per-run transform picker — a re-trigger always runs the chain currently enabled
  in Settings (same chain a fresh download applies).
- No guard against cumulative audio-mutating transforms (re-running trim-silence twice
  trims twice). Inherent to "re-trigger"; matches user intent.
- No new persisted state or settings migration.

## Approach: pluggable source

Generalize the pipeline so the **acquire** step is pluggable. Today `runJob` in
`src/main/pipeline.ts` hard-codes resolve-playlist + yt-dlp download. We refactor it to
run against a `JobSource`. The valuable shared core — `finishTrack` (hash → transform
chain → probe → cache → build the per-track record) — is unchanged and reused by every
source.

```ts
interface JobSource {
  /** Job-level metadata, resolved once up front. */
  resolve(signal?: AbortSignal): Promise<{ title: string; kind: JobKind }>
  /** The work items. Called after resolve(). */
  entries(): SourceEntry[]
}

interface SourceEntry {
  index: number              // synthetic running index, unique across the whole job
  title: string
  videoId?: string
  destFolder: string         // per-entry (was a single job-level dest)
  ref?: unknown              // opaque; carried through to the result for the caller
  /** Obtain the local working file for this entry (download, or already-present). */
  provide(
    t: TrackProgress,
    onProgress: (e: ProgressEvent) => void,
    signal?: AbortSignal
  ): Promise<ProvideOutcome>
}

type ProvideOutcome =
  | { kind: 'file'; file: string; preHash?: string }
  | { kind: 'skipped'; reason: string }
  | { kind: 'failed'; reason: string; errorCode?: string }

type JobKind = 'playlist' | 'video' | 'retransform'
```

### Sources

- **`DownloadSource`** — wraps today's exact behavior, behavior-preserving:
  - `resolve()` = `resolvePlaylist` + the cookie-escalation logic (cookie state stays
    private to the source closure).
  - `entries()` = the resolved playlist entries, each `destFolder` = the single derived
    `dest` (so existing single-folder behavior is preserved), `ref` = `undefined`.
  - `provide()` = `buildDownloadArgs` + `runYtDlp` + `classifyDownload`, mapping to
    `{kind:'file'|'skipped'|'failed'}`.
- **`RetransformSource`** — built from the selected history targets:
  - `resolve()` = `{ title: "Re-running transforms · N tracks", kind: 'retransform' }`.
  - `entries()` = one entry per target: `destFolder = dirname(track.file)`,
    `ref = { entryId, index }`, synthetic running `index`.
  - `provide()` = identity: `existsSync(file)` → `{kind:'file', file}`, else
    `{kind:'failed', reason:'file missing'}`. No download, no network.

### `runPipeline` (refactor of `runJob`)

`pipeline.ts` changes, all internal:

- `runJob(url, deps)` is reframed as `runPipeline(source, deps)`. A thin
  `runJob(url, deps)` wrapper constructs a `DownloadSource` and calls `runPipeline`, so
  `index.ts`'s `job:start` call site and the public `JobResult` shape are unchanged.
- `dest` becomes **per-entry** `destFolder`; `finishTrack(t, file, destFolder, preHash)`
  takes the folder + optional pre-computed hash as parameters (no longer closes over a
  single `dest`).
- The per-entry loop calls `entry.provide(...)` then, on a `file` outcome,
  `finishTrack(...)`. The skipped/failed branches set status from the outcome exactly as
  `processEntry` does today.
- A synthetic running `index` (assigned by the source) keeps the chain's
  `.plucker-tmp-${index}-${basename}` working files unique even when re-transforming
  tracks that share an original playlist index across different entries.
- `JobResult` gains nothing required, but the source's `ref[]` (index-aligned) is exposed
  to the caller so a non-download source can map results back to its origin. Simplest:
  `runPipeline` returns `{ ...JobResult, refs: unknown[] }`; `runJob` drops `refs`.

`JobResult` is already history-agnostic (`pipeline.ts:182`), so persistence stays in the
IPC handlers — no history knowledge leaks into the pipeline.

## Persistence

- `job:start` → `addEntry` (unchanged).
- New pure helper in `src/main/history.ts`:
  ```ts
  function updateTrack(
    history: HistoryEntry[],
    entryId: string,
    index: number,
    patch: Partial<HistoryTrack>
  ): HistoryEntry[]
  ```
  Merges `patch` onto the track at `(entryId, index)`; no-ops on a missing id/index;
  returns a new array (immutable).
- `job:retransform` handler maps each result back via the source `ref`
  (`{entryId, index}`) and applies `updateTrack` for each, then `saveSettings` +
  `history:changed`. Patched fields: `file`, `title`, `artist`, `album`, `year`, `hash`.
  When a rename transform moved the file (`outputFile !== sourceFile`), the old file is
  removed and the new path recorded — the same rule `finishTrack` already applies.

## Deck reuse

`job:retransform` mirrors `job:start`'s preamble: reuse the module-level
`AbortController`, clear paused state, send `job:paused false`. It wires
`onProgress → job:progress` and the window progress bar identically, so TransportDeck
renders progress, cancel, and pause for free. Tracks begin at `status:'transforming',
percent:100, transformPercent:0`. It is mutually exclusive with downloads by sharing the
single `abort` — consistent with the one-job-at-a-time deck model.

## Renderer integration

Preload (`src/preload/index.ts`):
- `retransform(targets: { entryId: string; index: number }[]): Promise<void>` →
  `ipcRenderer.invoke('job:retransform', targets)`.
- `onRetransformSelection(cb): () => void` → subscribes to `menu:retransform-selection`
  (mirrors `onMenuNavigate`).

History view (`src/renderer/src/history-view.tsx`):
- One handler `retransformTargets(keys: string[])`:
  1. map keys → tracks via `lookup`, keep eligible (`status==='done'` && file present &&
     not in `missing`), using the existing selection/deletable helpers;
  2. compute `skipped = total − eligible`;
  3. `onNavigateDownload()` so the deck is visible;
  4. if `skipped > 0`, surface `t('history.retransformSkipped', { count: skipped })`
     (same lightweight reporting style already used for selection actions);
  5. `window.plucker.retransform(eligibleTargets)`; clear selection.
- Wire `onRetransformSelection` (via `app.tsx`, like `onMenuNavigate`) to call
  `retransformTargets([...selected])`.

Context menu (`src/renderer/src/track-row-menu.ts`):
- In the `variant === 'history'` branch, add a `context.retransform` item that calls a
  new `onRetransform?: () => void`, supplied by the view as
  `() => retransformTargets(targetsFor(selected, key))`. Enabled when the row (or its
  multi-selection) has at least one eligible track.

App menubar (`src/main/menu.ts`):
- Add a "Re-run transforms on selection" item that sends `menu:retransform-selection`.
  Kept always-enabled (sends an event; the renderer no-ops on an empty/ineligible
  selection) — native enable/disable wired to live selection count is deferred polish.

i18n: add `context.retransform`, `history.retransformSkipped`, and the menu label to
`en` and `de` locales.

## Testing

- `history.test.ts`: `updateTrack` — merges a patch; no-ops on bad id and bad index;
  returns a new array without mutating the input.
- `pipeline.test.ts` (extends existing download coverage):
  - `DownloadSource` parity — a stubbed resolve+download still produces the same
    `JobResult` as before the refactor (guards the moved hot path).
  - `RetransformSource` — identity `provide` yields `file`; a missing file yields
    `failed`; results carry the right `ref`.
  - synthetic-index uniqueness across entries sharing an original index.
  - renamed output removes the old file and records the new path.
- Renderer: the eligible/skipped split for `retransformTargets` (pure helper if
  extracted), reusing the `history-selection` test patterns.

## Risks & mitigations

- **Refactor regresses the download path.** Mitigation: `DownloadSource` *moves* the
  existing resolve/download code unchanged; the existing `pipeline.test.ts` plus the new
  parity test guard it. The public `runJob`/`JobResult` surface is preserved via the
  wrapper.
- **Mixed `destFolder` in one job** — TransportDeck's `JobProgress.folder` is a single
  value; for re-transform set it to a representative folder (e.g. the first target's).
  Purely cosmetic for the "Open folder" affordance during the run.
