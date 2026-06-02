# Resume interrupted jobs — Design

**Date:** 2026-06-02
**Status:** Approved (design)

## Problem

A download/transform job in Plucker runs entirely as **in-memory state in the main
process**. Tracks fan out across a `downloadPool` (yt-dlp) and a `transformPool`
(`src/main/pipeline.ts`). Nothing about an in-progress job is persisted — the
`HistoryEntry` is written only *after* `runJob` returns. Consequently:

- An app crash / force-kill leaves **no record** of which tracks finished vs. were
  pending. Orphaned `.part` / `.plucker-tmp-*` files remain on disk with no context.
- A clean quit mid-job (`before-quit` kills children) likewise writes no history.
- A manually cancelled job can't be picked back up.
- Failed tracks within a finished job can't be retried without re-running everything.

We want a single, durable **resumable-job** concept covering all four scenarios:
crash/force-kill, clean quit mid-job, manual cancel, and per-track failures.

## Decisions (from brainstorming)

| Question | Decision |
| --- | --- |
| Scenarios covered | Crash/force-kill, clean quit mid-job, manual cancel/pause, network/track failures |
| Resume trigger UX | **Both** — startup prompt *and* a Resume affordance in History |
| Download granularity | **Re-download** the interrupted track from scratch; skip fully-completed tracks |
| Checkpoint storage | **Approach A** — dedicated per-job files under `~/.plucker/jobs/` |
| Retry-failed-tracks | **Included in v1** |

## Approach: per-job checkpoint files

One JSON file per active job at `~/.plucker/jobs/<jobId>.json`. Written at job start
(all tracks `queued`), patched as each track reaches a terminal state, and **deleted
on clean completion**. A surviving file is, by definition, an interrupted job. This
keeps durable writes small and *off* the `config.json` critical path (avoiding the
main-thread whole-config rewrite that recent perf work moved away from), and maps
cleanly onto the "leftover file = needs resume" detection model.

## 1. Data model

New shared types in `src/shared/types.ts`:

```ts
interface JobCheckpoint {
  jobId: string            // stable id; also the filename
  version: 1               // schema version for forward migration
  url: string              // source URL (download jobs)
  folder: string           // resolved destFolder
  jobTitle: string         // playlist/track title, shown in the prompt
  kind: 'download' | 'retransform'
  startedAt: number        // epoch ms, injected (never Date.now() inside pipeline)
  updatedAt: number
  total: number
  entries: CheckpointEntry[]
}

interface CheckpointEntry {
  index: number
  id: string               // yt-dlp entry id
  title: string
  status: TrackStatus      // queued | downloading | transforming | done | skipped | failed | cancelled
  filePath?: string        // final path once known (for done-verification)
}
```

`JobOutcome` gains `'interrupted'`. `HistoryEntry` gains an optional `jobId` linking
it back to its checkpoint.

The checkpoint is the resolved `SourceEntry[]` plus a live per-track status mirror —
everything needed to rebuild the job without re-resolving.

## 2. Write lifecycle

New module `src/main/job-checkpoint.ts` (load / save / delete / list + an atomic
write helper), with a colocated `job-checkpoint.test.ts`. `Date.now()` is injected
from `index.ts`, never called inside the pipeline (consistent with existing rule).

- **On resolve complete** (`runPipeline`, after `source.entries()`): write the full
  checkpoint with every track `queued`. One-time "intent" record.
- **On each terminal track transition** (`done` / `failed` / `skipped` /
  `cancelled`): patch that entry's `status` (+ `filePath`), bump `updatedAt`,
  atomic-write. Wired via a single `onCheckpoint(entry)` callback at the one place in
  `pipeline.ts` where terminal transitions occur.
- **On clean completion** (outcome ≠ interrupted): **delete** the checkpoint file.
- Intermediate states (`downloading` / `transforming`) are **not** persisted —
  resume re-runs any non-`done`/`skipped` track, so only terminal states matter. This
  caps writes at ~one per completed track.

**Atomic write:** write `<jobId>.json.tmp`, then `rename` over the target — a crash
mid-write cannot corrupt the checkpoint.

## 3. Resume execution

A new `JobSource` — `buildResumeSource(checkpoint, deps)` in
`src/main/resume-source.ts` (sibling to `buildDownloadSource` / `buildRetransformSource`),
driving the existing `runPipeline` engine:

- `resolve()`: no network call — the checkpoint holds resolved entries. (Optionally
  re-resolve for `kind: 'download'` to refresh playlist metadata; default is to trust
  the checkpoint.)
- `entries()`: returns checkpoint entries, marked per status:
  - `done` → **verify `filePath` exists**. Present → terminal-skip (counts complete,
    no work). Missing (user deleted/moved it) → demote to `queued`, re-download.
  - `skipped` → terminal, left as-is (no audio met the bitrate floor).
  - `queued` / `downloading` / `transforming` / `failed` / `cancelled` → re-run from
    scratch (re-download → full transform chain). Any stale `.part` / temp file for
    that entry is deleted first so the track restarts cleanly.
- `provide()`: same yt-dlp invocation as a fresh download.

The resumed run writes to the **same checkpoint file** (same `jobId`), so a second
interruption is again resumable. On clean finish the file is deleted and a normal
`HistoryEntry` is written, exactly as today.

## 4. Detection & UX

**Detection (main, on startup):** `listCheckpoints()` reads `~/.plucker/jobs/*.json`.
Any file = an interrupted job. Exposed via IPC `jobs:listInterrupted`, emitted to the
renderer after the window loads.

**History integration:** An interrupted job has a surviving checkpoint *and* a
`HistoryEntry` with `outcome: 'interrupted'` plus the partial `HistoryTrack[]`
gathered so far. The History list shows an **interrupted** badge and a **Resume**
button wired to `jobs:resume(jobId)`.

**Startup prompt:** If `jobs:listInterrupted` returns ≥1, the renderer shows a banner:
*"Resume \"Playlist X\" — 12 of 40 done?"* with **Resume** / **Dismiss**. Dismiss only
closes the banner; the History entry + checkpoint remain (so it is never lost). This
satisfies the "Both" trigger UX.

**Resume trigger (either path):** `jobs:resume(jobId)` → main loads the checkpoint →
`runPipeline(buildResumeSource(...))`. Standard `job:progress` events flow; the
History entry updates in place on completion.

## 5. Marking a job interrupted

A crash never runs cleanup code, so "interrupted" cannot be written at crash time. The
path determines how the marker is created:

- **Clean quit mid-job** (`before-quit`) and **manual cancel**: code runs, so we
  explicitly write `outcome: 'interrupted'` to History and **leave** the checkpoint.
- **Crash / force-kill**: nothing runs, but the checkpoint was written at resolve time
  and patched per-track, so it **survives**. On next startup, for any checkpoint with
  no matching (or mid-run) History entry, startup **synthesizes** the `interrupted`
  History entry from the checkpoint. Crash recovery is driven entirely by the
  surviving file — no shutdown hook required.

## 6. Retry failed tracks (v1)

A distinct user action on a *finished* job whose `outcome` is `partial` (some tracks
`failed`). "Retry failed" builds a resume source filtered to `failed` entries and runs
it through the same engine. Implementation reuses `buildResumeSource` with an entry
filter; no new pipeline path. A `partial` History entry exposes a **Retry failed**
button alongside the existing actions.

Note: failures *within* an otherwise-completed run are not "interruptions" — the job
finishes normally as `outcome: 'partial'`. Retry-failed is the recovery path for them.

## 7. Error handling & edge cases

- **Stale / corrupt checkpoint:** unparseable file → log + skip (never block startup).
  The banner's **Discard** action deletes it.
- **Output files moved/deleted:** `done`-verification (§3) re-downloads missing
  outputs; if the whole `folder` is gone, recreate it.
- **Settings drift:** resume uses *current* settings (transforms, bitrate,
  parallelism), consistent with a fresh run.
- **Concurrency:** today it's one job at a time; per-job files keep the door open for a
  future multi-job queue without redesign.

## 8. Testing

- `job-checkpoint.test.ts`: atomic write/read/delete/list, corrupt-file tolerance,
  schema version.
- `resume-source.test.ts`: done-verification (present → skip, missing → re-queue),
  failed/cancelled → re-run, skipped → terminal, failed-only filter (retry path).
- Pipeline integration test: run → simulate interruption (leftover checkpoint) →
  resume → assert only non-done tracks re-run and the checkpoint is deleted on finish.
- History test: `interrupted` outcome synthesis from a checkpoint with no History
  entry; `partial` → retry-failed produces a corrected entry.

## New / touched files

| File | Change |
| --- | --- |
| `src/shared/types.ts` | `JobCheckpoint`, `CheckpointEntry`, `JobOutcome` += `interrupted`, `HistoryEntry.jobId?` |
| `src/main/job-checkpoint.ts` (+ test) | new: load/save/delete/list + atomic write |
| `src/main/resume-source.ts` (+ test) | new: `buildResumeSource`, done-verification, failed-only filter |
| `src/main/pipeline.ts` | write checkpoint at resolve; `onCheckpoint` on terminal transitions; delete on clean finish |
| `src/main/index.ts` | IPC `jobs:listInterrupted`, `jobs:resume`, `jobs:discard`; startup synthesis; inject `Date.now`; emit on window load; mark interrupted in `before-quit`/cancel |
| `src/main/history.ts` | `interrupted` outcome support; checkpoint→History synthesis helper |
| `src/renderer/*` | startup resume banner; History `interrupted` badge + Resume; `partial` Retry-failed button |
| `src/preload` | expose new IPC channels |
```
