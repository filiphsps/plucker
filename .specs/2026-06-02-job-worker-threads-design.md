# Jobs in Worker Threads — Design

**Date:** 2026-06-02
**Status:** Approved (pending spec review)

## Problem

Today a download/resume/retransform job runs **async on the main process thread**.
`runPipeline` is `await`ed directly inside the `job:start` IPC handler in
`src/main/index.ts`. Heavy leaf work is already offloaded — key/BPM analysis runs
in `analyze-worker`, media decode in `media-worker`, and yt-dlp/ffmpeg run as child
processes via `spawnManaged` — but the orchestration loop plus some sync hot spots
(`hashAudioFile`, `node-id3` tagging, JSON parsing, transform chains) still execute
on the main thread. Only **one job runs at a time** (single `activeJobId`, single
`abort`, single `jobControls`).

This causes three problems:

1. **UI jank** — main-thread work makes IPC lag and the window stutter mid-job.
2. **No concurrency** — users cannot run multiple jobs at once.
3. **No crash isolation** — a hung/faulting job (bad ffmpeg, WASM fault) can take
   down the whole main process.

## Goal

Run each job inside its own **self-contained worker thread**, scheduled by a
**bounded pool with a queue**, surfaced through a **master-detail multi-job UI**.

## Key decisions (resolved during brainstorming)

- **Self-contained workers (Approach A).** Each worker runs essentia/media *inline*
  (importing the same logic `analyze-worker`/`media-worker` use). WASM boots **once
  per pool slot**, not per job. Killing a worker tears down orchestration + analyze +
  child processes atomically — the cleanest isolation. Cost: N WASM instances
  (N = pool size).
- **Bounded pool + queue.** A single unified concurrency knob — the existing
  `settings.performance.parallel` (total tracks plucking at once, app-wide) — sizes
  both how many jobs run and each job's track budget. Extra jobs queue. See "Unified
  concurrency model".
- **Single combined spec** covering worker extraction + pool + queue + multi-job UI.
- **Master-detail UI.** A left rail lists all jobs (running/paused/queued) with mini
  progress; the selected job shows its full track list + transport on the right.
  Chosen because it fits the existing `VirtualList` (one full-height virtualized list
  mounted at a time), scales with a long queue, and reuses today's single-job view as
  the detail pane.
- **Main is the sole writer of `settings.json`/history.** Workers compute and write
  file-backed cache/checkpoint data; main folds each worker's `JobResult` back into
  history. This avoids `settings.json` write races across concurrent jobs.

## Architecture

```
renderer ──IPC(jobId)──► main: JobPool (scheduler)
                              │  enqueue / route controls / relay events
                              ▼
                    ┌─────────┴─────────┐
              JobClient            JobClient        (≤ N running jobs)
                │ worker_threads     │
                ▼                    ▼
           job-worker            job-worker         self-contained:
           · runPipeline         · runPipeline      runs its own
           · essentia inline     · essentia inline  yt-dlp/ffmpeg,
           · own child procs     · own child procs  own spawn.ts state
```

A pool of **N persistent, self-contained job workers** lives in the main process.
Main becomes a thin router + scheduler. Each worker runs a whole job end to end.

### Why worker isolation works for child processes

`src/main/spawn.ts` uses module-level global state (`live` Set, `groups` Map,
`globalPaused`, `pausedGroups`). Worker threads get their **own copy** of every
module, so a job worker that spawns yt-dlp/ffmpeg naturally owns and isolates its own
child processes. `pauseAllChildren`/`killAllChildren` inside a worker now mean
"this job's children." The consequence: pause/cancel must be **routed as messages to
the owning worker** — main can no longer reach a job's children directly.

## Components

Mirrors the existing analyze quadrant (`analyze-protocol`/`-worker`/`-client`/`-host`):

- `src/main/workers/job-protocol.ts` — message types (below).
- `src/main/workers/job-worker.ts` — worker entry: reconstructs deps, runs
  `runPipeline`, posts events.
- `src/main/workers/job-client.ts` — pure main-side handle around one worker
  (testable with a fake worker, like `analyze-client`).
- `src/main/workers/job-host.ts` — production `?nodeWorker` wiring.
- `src/main/job-pool.ts` — the scheduler: registry + bounded pool + queue + control
  routing (its own unit-tested module).

## Deps marshaling

On `start`, main sends only **serializable config**; the worker rebuilds the live
`RunJobDeps` itself.

| Dep | How it crosses |
|---|---|
| `bin`, `settings`, `homeBase`, `folderOverride`, `cookieFile` | sent as plain data |
| `cache` (MetadataCache) | worker calls `createMetadataCache(cacheDir)` — file-backed, so writes are visible to main's readers |
| `checkpoint` | worker calls `createCheckpointSink(jobsDir, jobId, Date.now)` |
| `analyze` / `media` | **inline** in the worker (import the logic `analyze-worker`/`media-worker` already use); essentia WASM boots **once per pool slot** |
| `onProgress` / `onStatus` | become `postMessage` → main relays to renderer |
| `signal` | worker holds its own `AbortController`; a `cancel` message aborts it |
| controls (`skip/pause/resumeTrack`, job pause/resume) | messages → worker calls its local `jobControls` / `spawn.ts` |
| logging | worker's `log` output is forwarded via a `log` message and re-emitted through main's existing log-file + console-window pipeline, tagged with `jobId` |

`depsConfig` shape (serializable):
`{ bin, settings, homeBase, cacheDir, jobsDir, folderOverride, cookieFile, initialLimit }`.
The worker sizes its download/transform pools to `initialLimit` (its starting track
budget) instead of reading `settings.performance.parallel` directly.

## Protocol messages

**main → worker:**
`start{jobId,kind,req,depsConfig}` · `setLimit{limit}` · `cancel` · `pause` / `resume` ·
`skipTrack{index}` · `pauseTrack{index}` / `resumeTrack{index}`

`setLimit{limit}` carries the job's current distributed track budget. The worker
resizes its download/transform pools to `limit`. The initial budget is also passed in
the `start` message so the worker sizes its pools before the first `setLimit` arrives.

**worker → main:**
`progress{progress}` · `status{status}` · `paused{paused}` ·
`trackPaused{index,paused}` · `log{entry}` · `done{result}` · `error{message,cancelled}`

`kind` is `'download' | 'retransform' | 'resume'`, selecting which `JobSource`
builder the worker uses (`buildDownloadSourceFromEntries` / `buildRetransformSource`).

## Unified concurrency model

There is **one** concurrency setting: the existing `settings.performance.parallel`
(N, slider 1–16). It is reinterpreted as **the total number of tracks plucking at
once, app-wide** — what a user intuitively expects from a single "parallel downloads"
slider, regardless of how tracks are grouped into jobs. No separate
`maxConcurrentJobs` field is introduced.

The pool realizes this single number via **budget distribution**:

- Up to **N concurrent jobs** run (a job needs ≥1 track slot to make progress); the
  rest queue.
- Each running job is granted a live **track budget** = `distribute(N, runningJobs)`.
  E.g. N=4: one job → 4 track slots; two jobs → 2 each; four jobs → 1 each. The job's
  internal download/transform pools (today `const limit = settings.performance.parallel`
  at `pipeline.ts:484`) size to **that grant** instead of reading the raw setting.
- When the running set changes (a job starts/finishes), main sends a `setLimit`
  message to each running worker; the worker resizes its pools. Total concurrent
  tracks stays ≈ N.

This keeps the **single-playlist case at full speed** (a lone job gets all N slots,
exactly like today) while bounding total work across concurrent jobs. No cross-thread
semaphore — budget is handed out by main as plain messages, so crash isolation is
preserved (a dead worker's budget is reclaimed and redistributed on the next `pump()`).

`distribute(N, runningJobs)` gives each job `floor(N / runningJobs)`, with the
remainder handed one extra slot to the first `N mod runningJobs` jobs (each job always
≥ 1). The settings-panel description for `performance.parallel` is updated to reflect
the unified meaning; the slider range (1–16) is unchanged.

## Scheduler (`job-pool.ts`)

- Concurrency driven by `settings.performance.parallel` (N) per the unified model
  above: at most N running jobs, each with a distributed track budget.
- State: `busy: Map<jobId, JobClient>`, `idleWorkers: JobClient[]`,
  `queue: QueuedJob[]`, `roster: JobMeta[]`.
- `enqueue(jobId, kind, req)` → push, `pump()`.
- `pump()` → while `busy.size < N && queue.length`: pull next, reuse an idle worker
  (WASM already warm) or spawn one, assign; then **rebalance** track budgets across
  the running set (`setLimit` to each worker).
- On `done` / `error` / worker-exit: return worker to idle, fold `JobResult` into
  history, rebalance budgets, `pump()` the next.
- Control routing: running job → forward to its worker; **queued** job → drop from the
  queue (cancel) — no worker involved.
- Emits `jobs:listChanged` (roster) + per-job `job:progress` / `status` / `paused`
  carrying `jobId`.
- Idle workers stay alive during a burst; terminated on app quit. Idle-timeout
  eviction is **out of scope**.

`JobMeta` (roster entry): `{ jobId, title, kind, state: 'queued'|'running'|'paused' }`.

## IPC / preload (every control gains `jobId`)

- `job:start` now **returns the new `jobId`** and enqueues (no longer runs inline).
- `job:cancel(jobId)` · `job:pause(jobId)` · `job:resume(jobId)` ·
  `job:skipTrack(jobId,i)` · `job:pauseTrack(jobId,i)` · `job:resumeTrack(jobId,i)`.
- New `jobs:list()` query → roster snapshot.
- Events carry `jobId`: `job:progress` `{jobId,progress}`, `job:status`,
  `job:paused`, `job:trackPaused`, plus `jobs:listChanged`.
- `job:resolve` stays on the main thread (light metadata fetch for staging) but gets
  its **own** `AbortController`, decoupled from jobs.

## Renderer (master-detail)

- `app.tsx`: replace `progress: JobProgress|null` with `jobs: Map<jobId, JobView>`
  (roster meta + progress + status + paused), driven by the `jobId`-tagged events.
  Add `selectedJobId`.
- New `job-rail.tsx`: left rail listing running/paused/queued jobs with mini progress
  + a **"+ New"** entry; cancel-from-queue inline.
- `download-view.tsx`: becomes the **detail pane** — the compose/stage flow when
  "+ New" is selected, otherwise the selected job's existing track list (reusing the
  `VirtualList` already added) + transport.
- `transport-deck.tsx`: takes a `jobId`; controls the selected job.
- On start: the returned `jobId` is auto-selected so the user lands on the job they
  just kicked off.

## Error handling & isolation

- **Worker crash** (the isolation payoff): `JobClient` listens for worker
  `error`/`exit`; main survives, records a `failed`/`interrupted` history entry, frees
  the slot, pumps the next.
- **Cancel**: message → worker `AbortController.abort()` → `runPipeline` rejects →
  `error{cancelled:true}` → main records `interrupted`, keeps the checkpoint
  (resumable), same as today.
- **Metadata-cache concurrency**: per-hash files, distinct hashes per track —
  collisions are negligible; no locking. Documented as a known limitation.
- **Resume**: existing checkpoints + `jobs:resume` simply re-enqueue into the pool.

## Testing

- `job-client.test.ts` — fake worker; assert control marshaling + event emission
  (mirrors `analyze-client.test.ts`).
- `job-pool.test.ts` — fake `JobClient` factory; assert bounded concurrency, queue
  order, slot reuse, control routing, done→pump, queued-cancel.
- `pipeline.test.ts` — unchanged (runPipeline behavior is preserved).
- Renderer: `job-rail.test.tsx`, an `app` job-map reducer test, `transport-deck`
  per-job.
- `spawn.test.ts` unchanged (now exercised inside the worker context).

## Explicit scope calls

- `job:resolve` stays on the main thread (it is light).
- Idle-worker eviction by timeout is **out of scope** (workers live until quit).
- Metadata-cache locking is **out of scope** (per-hash files make races negligible).
- **No new concurrency setting.** The existing `settings.performance.parallel` is the
  single unified knob (total concurrent tracks app-wide); only its description text is
  updated. `pipeline.ts` stops reading it directly and instead takes its track limit
  from the worker's granted budget (`initialLimit` / `setLimit`).

## Build note

The `?nodeWorker` job-worker bundle pulls in the full pipeline + transforms +
essentia WASM. `analyze-worker` already bundles essentia successfully, so the pattern
is proven; the plan must verify the job-worker bundle resolves all pipeline deps.
