# Interactive Job Queue — Skip, Per-Track Pause, and Staged Downloads

**Date:** 2026-06-02
**Status:** Approved (design)

## Problem

The download flow is fire-and-forget: pressing Enter on a URL resolves *and*
downloads the entire playlist in one shot, with no chance to review or trim the
list first. Once running, the only controls are **global** — pause/resume/cancel
act on the whole job. A user cannot skip a single unwanted track or pause one
track while the rest continue.

This adds interactive, per-track control to a job and inserts a review step
before a job starts.

## Goals

1. **Per-track skip** — abandon one track at any stage (queued / downloading /
   transforming); mark it `skipped`, clean its partial files, let the rest run.
2. **Per-track pause/resume** — freeze/wake a single track's processes,
   independent of the global deck pause (union semantics).
3. **Context menu** on running-job track rows exposing skip + pause/resume.
4. **Staged download flow** — the command bar *resolves*, shows an editable list
   (remove + drag-reorder), and only downloads when the user clicks **Start**.
   Single videos and history *Redownload* both route through staging.

## Non-Goals

- **Adding entries to an already-running job.** While a job runs the command bar
  stays locked, exactly as today. Resolve→review→Start applies only when no job
  is active. (A future spec may make the pipeline an appendable live queue.)
- **Concurrent jobs.** Still one job at a time.
- **Pausing pure-JS / worker-thread transform steps.** Like the existing global
  pause, per-track pause only freezes spawned child processes (yt-dlp + ffmpeg).
  A pure-JS or off-thread step runs to its next child-spawn boundary before the
  freeze takes visible effect. This is an accepted, pre-existing limitation.

## Decisions (from brainstorming)

| Question | Decision |
| --- | --- |
| Skip a downloading track | Mark `skipped`, **clean** partial files, job continues |
| Per-track vs global pause | **Independent + global**, union: stopped if `globalPaused OR trackPaused` |
| Staging edits | **Remove + reorder + Start** |
| Single videos | Always stage (resolve→review→Start) when no job active |
| History Redownload | Routes **through** staging |
| Start button | **Separate** "Start download" button in the staging list header |
| Append to running job | **Disallowed for now** (bar locked while running) |

## Architecture

The foundation is **per-track process control**: a registry keying each managed
child to a *group* (the track index) plus one `AbortController` per track. The
pipeline exposes a controls handle that the IPC layer routes skip/pause/resume to.

### 1. `src/main/spawn.ts` — keyed process groups

Today: a flat `live: Set<ChildProcess>` and a single module-level `paused` flag.

Changes:

- `spawnManaged(command, args, options?, signal?, priority?, groupKey?)` gains an
  optional `groupKey: number | string`.
- Registry becomes `Map<groupKey, Set<ChildProcess>>`, with a sentinel key for
  ungrouped children. Global iterators (`killAllChildren`, `pauseAllChildren`,
  `resumeAllChildren`) walk every group.
- **Union pause state:** module keeps `globalPaused: boolean` and
  `pausedGroups: Set<groupKey>`. A child is *stopped* iff
  `globalPaused || pausedGroups.has(itsGroup)`.
- New exports:
  - `pauseGroup(key)` — `SIGSTOP` every child in the group; add to `pausedGroups`.
  - `resumeGroup(key)` — remove from `pausedGroups`; `SIGCONT` the group **only
    if** `globalPaused` is false.
  - `killGroup(key)` — `hardKill` every child in the group.
- `pauseAllChildren` sets `globalPaused = true` and stops all. `resumeAllChildren`
  clears `globalPaused` and resumes **only** groups not in `pausedGroups`.
- A child spawned mid-pause checks **both** conditions before self-`SIGSTOP`.

### 2. Per-track skip (`src/main/pipeline.ts`)

- `runPipeline` keeps `trackAbort: Map<index, AbortController>` and
  `skipRequested: Set<index>`.
- Each track's `provide()` and transform chain receive a **combined** signal:
  `AbortSignal.any([jobSignal, trackAbort.get(i)!.signal])` instead of the raw
  job signal.
- `skipTrack(i)`: `skipRequested.add(i)`, `trackAbort.get(i)?.abort()`,
  `killGroup(i)`.
- Classification: when a stage settles from an abort, if `skipRequested.has(i)`
  **and** the job signal is not aborted → status `skipped`, reason
  `"Skipped by user"`. `markCancelledTracks` already skips `skipped` tracks, so a
  user skip survives an end-of-job cancel relabel. `toHistoryTracks` already maps
  `skipped` through.
- **Partial cleanup via temp redirect:** `buildDownloadArgs` gains a
  `tempDir?: string`; when set, append `--paths temp:<tempDir>`. The pipeline
  creates a per-track temp dir (e.g. `join(os.tmpdir(), 'plucker', jobId, String(index))`)
  so all `.part`/intermediate/postprocess files live there while the final mp3 +
  `.info.json` still land in `destFolder`. On track settle (done/failed/skipped/
  cancelled) the temp dir is `rmSync(..., { recursive, force })`. This clears
  partials robustly without globbing the shared dest folder.

### 3. Per-track pause/resume

- **Download stage:** thread `groupKey = t.index` into `runYtDlp(...)` →
  `spawnManaged(...)`. `pauseGroup(i)` / `resumeGroup(i)` then freeze/wake only
  that track's yt-dlp + ffmpeg tree.
- **Transform stage:** add `groupKey` to the transform `services` object
  (alongside the existing `signal`) and pass it through the ffmpeg spawn helpers
  — `decodePcm` (`audio-pcm`), `cropToSquare` (`image-crop` via `square-cover`),
  and `trim-silence`'s ffmpeg deps — down to their `spawnManaged` calls. These
  already thread `services.signal`, so it is the same mechanical path. Result:
  pausing a *transforming* track also works.
- The existing global deck pause/resume is unchanged and composes via the union
  rule in `spawn.ts`.

### 4. Job-controls handoff (IPC)

- `RunJobDeps` gains `onControls?(controls: JobControls): void` where
  `JobControls = { skipTrack(i): void; pauseTrack(i): void; resumeTrack(i): void }`.
  `runPipeline` builds the handle and calls `onControls` once, after the track
  list exists.
- `index.ts` stores it module-level (`let jobControls: JobControls | null`) and
  clears it in the job's `finally`.
- New IPC handlers + preload methods:
  - `job:skipTrack(index)` → `jobControls?.skipTrack(index)`
  - `job:pauseTrack(index)` → `jobControls?.pauseTrack(index)`
  - `job:resumeTrack(index)` → `jobControls?.resumeTrack(index)`
- Per-track paused state is broadcast to the renderer via a new
  `job:trackPaused` push `(index: number, paused: boolean)`, mirroring the
  existing global `job:paused`. `pauseTrack`/`resumeTrack` emit it.

### 5. Staged download flow

**Main:**

- Extract resolve + cookie-escalation logic out of `buildDownloadSource` into a
  reusable `resolveJob(url, deps): Promise<ResolvedJob>`.
- **New IPC `job:resolve(url)`** → returns `ResolvedJob` (title, kind, entries)
  **without downloading**. The (possibly exported) cookie file is stashed in a
  module-level `pendingResolve` keyed by `url`, reused by the next `job:start`
  and cleared on consume or on a newer resolve.
- **`job:start` signature changes** to accept a curated payload:
  `{ url, title, kind, entries, folderOverride? }`. New
  `buildDownloadSourceFromEntries(resolved, deps)` whose `resolve()` returns the
  cached `{ title, kind, url }` and whose `entries()` maps the supplied (already
  reordered/trimmed) entries — no re-resolve.

**Renderer (`download-view.tsx`, `app.tsx`):**

- Enter / "Pluck" calls `window.plucker.resolveJob(url)`; the result becomes a
  `staged` object held in `DownloadView` state:
  `{ title, kind, url, entries: PlaylistEntry[] }`.
- Staging renders entries as rows with a **remove (X)** control and a
  **drag-to-reorder** handle. List mutations go through a small pure reducer
  (`stagingReducer` / helpers in a new `staging-list.ts`): `remove(index)`,
  `move(from, to)` — unit-tested.
- A **"Start download"** button in the staging list header fires
  `window.plucker.startDownload({ url, title, kind, entries })` with the curated
  order. Disabled when zero rows remain.
- Typing a new URL or clearing resets staging. The command bar stays **editable**
  during staging (so the user can re-resolve a different URL); it only locks once
  an *active job* is running — the existing `locked` condition (resolving or any
  track in `queued`/`downloading`/`transforming`) is unchanged.
- History *Redownload* calls `resolveJob` and drops into the same staging UI on
  the download view (navigates to download, seeds `staged`).

### 6. Context menu (`track-row-menu.ts`)

- For `variant: 'download'`, prepend a state-aware action block:
  - **Skip** — enabled when status ∈ {`queued`, `downloading`, `transforming`}.
  - **Pause** / **Resume** — shown when status ∈ {`downloading`, `transforming`};
    label toggles on the track's paused state.
- `TrackMenuTrack` gains `status` and `paused`. `trackRowMenuItems` gains
  `onSkip?`, `onPause?`, `onResume?`, wired from `DownloadView`.
- New i18n keys: `context.skip`, `context.pauseTrack`, `context.resumeTrack`
  (+ `de` translations).
- The renderer tracks per-track paused state from `job:trackPaused` (a
  `Set<number>` or `Record<number, boolean>` in `app.tsx`, passed down).

## Data-flow summary

```
Command bar (Enter) ──job:resolve(url)──▶ resolveJob ──▶ ResolvedJob
        │                                                     │
        ▼                                                     ▼
   staged list  ◀───────────────────────────────────  render rows (remove/reorder)
        │
   [Start download] ──job:start({url,title,kind,entries})──▶ buildDownloadSourceFromEntries
        │                                                     │
        ▼                                                     ▼
   runPipeline ──onControls──▶ index.ts jobControls      two-pool engine (unchanged)
        ▲                                                     │
        │  job:skipTrack / job:pauseTrack / job:resumeTrack   │ per-track temp dir,
        └─────────────────────────────────────────────────────  combined signals,
                                                               groupKey=index
```

## Testing

- **`spawn.test.ts`** — keyed registry; union pause rule (group vs global; global
  resume leaves an individually-paused group stopped; mid-pause spawn self-stops);
  `killGroup` scope; ungrouped children unaffected. Fake child objects.
- **`pipeline.test.ts`** — skip classification (`skipRequested` → `skipped`, not
  `cancelled`/`failed`, and survives end-of-job cancel relabel); per-track temp
  dir created + removed on each terminal state; `resolveJob` purity;
  `buildDownloadSourceFromEntries` maps entries without re-resolving;
  `buildDownloadArgs` appends `--paths temp:` only when `tempDir` set.
- **`staging-list.test.ts`** — `remove` / `move` reducer (bounds, order
  preservation, no-op moves).
- **`track-row-menu.test.ts`** — item set + enabled state per track status; pause
  vs resume label by `paused`.

## Risks / Notes

- `AbortSignal.any` requires a current Node; the project already targets a recent
  Electron (verify in `package.json` during implementation; polyfill trivially by
  wiring a manual listener if absent).
- Temp-dir redirect changes where yt-dlp keeps intermediates; confirm `--paths
  temp:` does not also move the `.info.json` sidecar (it should stay at the `-o`
  destination). Covered by a manual smoke test + the sidecar read path.
- Transform-stage pause touches ~4 ffmpeg spawn helpers; included for a complete
  pause UX. If surface needs trimming, download-stage-only pause is a clean
  fallback (skip still covers all stages).
