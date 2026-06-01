# Download page loading state — design

**Date:** 2026-06-01
**Status:** Approved (design); ready for implementation plan

## Problem

When a download starts, `runJob` (`src/main/pipeline.ts`) first calls
`resolvePlaylist`, which spawns yt-dlp with `--flat-playlist --dump-single-json`.
Only **after** that resolves does the first `job:progress` event fire
(`pipeline.ts` ~line 175). During the resolve window — a network round-trip that
can take several seconds — the renderer's `progress` state is unchanged, so the
download page shows either nothing or the **stale track list from a previous
download**. Resolve failures (bad URL, yt-dlp error) are currently swallowed and
never reach the UI.

## Goals

- A loading state that appears **instantly** the moment Pluck is clicked and
  stays until the real track list can be shown.
- Surface informative status during resolution: curated, translatable steps
  ("Launched yt-dlp", "Resolving playlist…", "Found N tracks") plus the **live
  yt-dlp console output** streamed verbatim.
- Fall back to an animated **skeleton** before any status line has arrived.
- Surface resolve-phase **errors** inline in the same loading area.

## Non-goals

- No change to the per-track download/transform progress UI (the existing
  `TrackRow` list and `TransportDeck`).
- No retry/cancel affordance for the resolve phase beyond what already exists.

## Approach

A parallel **status channel** alongside the existing progress channel, rather
than overloading `JobProgress` (which has no meaningful shape until resolution
completes).

### 1. Data model (`src/shared/types.ts`)

```ts
/**
 * Lifecycle status emitted before the first JobProgress (and on a failed start),
 * driving the download view's loading panel during playlist/video resolution.
 */
export interface JobStatus {
  phase: 'resolving' | 'error'
  /** Curated, translatable step. Renderer maps via i18n `resolve.<key>`. */
  key?: 'launching' | 'resolving' | 'resolved'
  /** Interpolation params for `key` (e.g. { count }). */
  params?: Record<string, string | number>
  /** Raw yt-dlp stderr line, shown verbatim (untranslated). */
  line?: string
  /** Human-readable error message when phase === 'error'. */
  error?: string
}
```

### 2. Backend

**`src/main/pipeline.ts`**

- `RunJobDeps` gains `onStatus?: (s: JobStatus) => void`.
- `resolvePlaylist(ytdlpPath, url, onLine?)` gains an optional `onLine:
(line: string) => void`. The spawn args gain `--verbose` so yt-dlp emits its
  extraction progress (e.g. `[youtube:tab] Downloading page 1`,
  `[download] Downloading playlist: …`). stderr is buffered and split on
  newlines; each complete line is forwarded to `onLine`. stdout JSON parsing is
  unchanged (verbose output goes to stderr only).
  - **Filtering:** verbose prepends a noisy environment dump (yt-dlp/python
    versions, proxy map, config). Lines beginning with `[debug] ` are dropped
    before forwarding; empty/whitespace-only lines are skipped too. Everything
    else (`[youtube…]`, `[download]`, `[info]`, warnings, errors) streams to the
    panel. This filter lives in `resolvePlaylist` so the relevance rule is
    testable and the UI just renders what it receives.
- `runJob` emits, in order:
  - `onStatus({ phase: 'resolving', key: 'launching' })` before resolving.
  - per stderr line: `onStatus({ phase: 'resolving', line })`.
  - `onStatus({ phase: 'resolving', key: 'resolved', params: { count: entries.length } })`
    after resolution, before the first `emit()`.

**`src/main/index.ts`** (`job:start` handler)

- Pass `onStatus: (s) => getWindow()?.webContents.send('job:status', s)`.
- Wrap `runJob` in try/catch; on throw, send
  `{ phase: 'error', error: String(err.message ?? err) }` then rethrow (so the
  IPC invoke still rejects).

**`src/preload/index.ts`**

- Add `onStatus(cb: (s: JobStatus) => void): () => void` subscribing to
  `job:status` (mirrors the existing `onProgress`).

### 3. Renderer

**`src/renderer/src/app.tsx`**

- New state `statusLog: JobStatus[] | null`.
  - `null` → idle (no panel).
  - `[]` → just started, nothing streamed yet (skeleton).
  - populated → streaming.
- Subscribe `window.plucker.onStatus`, appending each event, capped to the last
  ~60 entries: `setStatusLog(prev => prev ? [...prev, s].slice(-60) : [s])`.
- In the existing `onProgress` handler: also `setStatusLog(null)` so the track
  list takes over once real progress arrives.
- Pass a new `onStart` callback to `DownloadView` that runs **synchronously on
  click**: `setProgress(null); setStatusLog([])`. This clears the stale list and
  shows the skeleton instantly.
- Pass `statusLog` down to `DownloadView`.

**`src/renderer/src/download-view.tsx`**

- Accept `statusLog: JobStatus[] | null` and `onStart: () => void` props.
- `start()` calls `onStart()` before `await window.plucker.startDownload(...)`,
  and wraps the await in try/catch so the (already-surfaced) error doesn't become
  an unhandled rejection.
- Display priority:
  1. `progress` present → track list (unchanged).
  2. else `statusLog !== null` → `<ResolvePanel events={statusLog} />`.
  3. else → existing `emptyHint`.

**`src/renderer/src/resolve-panel.tsx`** (new, kebab-case file, `ResolvePanel`
export)

- Props: `events: JobStatus[]`.
- Derive `errored = events.some(e => e.phase === 'error')`.
- Header: spinner (`Loader2` + `animate-spin`) + `t('resolve.title')` while
  resolving; swap to a red `t('resolve.errorTitle')` when errored.
- Body: a small monospace, scrollable log. Each event renders as one line:
  - `key` present → `t('resolve.' + key, params)` (with plural for `resolved`).
  - `line` present → the raw string, dimmed.
  - `phase === 'error'` → the `error` string in the error color.
- When `events` is empty → render animated **skeleton bars** (`animate-pulse`)
  instead of the log.

### 4. i18n (`src/renderer/src/i18n/locales/en.ts` + `de.ts`)

New `resolve` namespace (kept separate from the existing `status.*`, which is
track-status labels):

```ts
resolve: {
  title: 'Starting download',
  launching: 'Launched yt-dlp',
  resolving: 'Resolving playlist…',
  resolved_one: 'Found {{count}} track',
  resolved_other: 'Found {{count}} tracks',
  errorTitle: 'Couldn’t start download'
}
```

German equivalents added to `de.ts`. Raw yt-dlp stderr lines are shown
untranslated.

### 5. Tests

- `src/renderer/src/resolve-panel.test.tsx`:
  - empty `events` → skeleton rendered (no log lines).
  - events with a `key` and a raw `line` → both rendered.
  - an `error` event → error title + message shown.
- `src/main/pipeline.test.ts`:
  - `resolvePlaylist` forwards stderr lines to `onLine`.
  - `runJob` calls `onStatus` with `launching` then `resolved` (count matches
    entries).

## Data flow

```
click Pluck
  └─ DownloadView.start(): onStart()  ──► App: progress=null, statusLog=[]  (skeleton shows instantly)
  └─ window.plucker.startDownload(url)
        └─ main job:start ► runJob
              ├─ onStatus(launching) ─► job:status ─► App.statusLog += ─► ResolvePanel
              ├─ resolvePlaylist stderr lines ─► onStatus(line) ─► … (live console)
              ├─ onStatus(resolved {count}) ─► …
              └─ first emit() ─► job:progress ─► App: progress set, statusLog=null ─► track list
        (on throw) ─► job:status {phase:'error'} ─► ResolvePanel error block
```

## Known edge (accepted)

A re-download triggered from the **History** page does not reset the Download
page's existing track list (no `onStart` is fired there) — the `TransportDeck`
already covers that path. Status events still stream and are visible if the user
switches to the Download page.
