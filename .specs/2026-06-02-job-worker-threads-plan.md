# Jobs in Worker Threads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run each download/resume/retransform job in its own self-contained worker thread, scheduled by a bounded pool driven by the single "parallel downloads" setting, surfaced through a master-detail multi-job UI.

**Architecture:** A pool of persistent, self-contained job workers lives in the main process (`job-pool.ts`). Each worker runs the whole `runPipeline` end-to-end with essentia/media inline and owns its own child processes. Main is a thin router: it enqueues jobs, distributes a track budget across running jobs (`distribute`), routes `jobId`-keyed controls to the owning worker, relays progress/status events to the renderer, and stays the sole writer of history/settings. The renderer keeps a `Map<jobId, JobView>` and shows a left rail (all jobs) + a detail pane (selected job).

**Tech Stack:** Electron, TypeScript, Node `worker_threads`, electron-vite `?nodeWorker`, React, Vitest. Reference design: `.specs/2026-06-02-job-worker-threads-design.md`. Mirror the existing analyze worker quadrant (`src/main/workers/analyze-{protocol,worker,client,host}.ts`).

---

## File Structure

**New files**
- `src/main/workers/job-protocol.ts` — pure wire types (main↔worker messages, `JobMeta`, `JobKind`, serializable `JobDepsConfig`).
- `src/main/workers/job-worker.ts` — worker entry: rebuilds deps inline, runs `runPipeline`, posts events.
- `src/main/workers/job-client.ts` — pure main-side handle around one worker (DI-testable).
- `src/main/workers/job-client.test.ts`
- `src/main/workers/job-host.ts` — production `?nodeWorker` wiring (factory).
- `src/main/job-pool.ts` — scheduler: registry + bounded pool + queue + budget distribution + control routing.
- `src/main/job-pool.test.ts`
- `src/shared/distribute.ts` — pure budget-distribution util.
- `src/shared/distribute.test.ts`
- `src/renderer/src/job-rail.tsx` — left rail listing all jobs.
- `src/renderer/src/job-rail.test.tsx`

**Modified files**
- `src/shared/types.ts` — add `JobView` is renderer-only (keep in renderer); add nothing here except confirm exports. (No change unless noted in tasks.)
- `src/main/pool.ts` — make the pool limit dynamically resizable (`setLimit`).
- `src/main/pipeline.ts` — `JobControls` gains `setLimit`; pools read a mutable limit; `RunJobDeps.getLimit`.
- `src/main/index.ts` — replace inline `runPipeline` calls with the job pool; rewire all `job:*` IPC handlers to take `jobId`; add `jobs:list`.
- `src/preload/index.ts` — `jobId` params on every control; events carry `jobId`; `jobsList`/`onJobsChanged`.
- `src/renderer/src/app.tsx` — `Map<jobId, JobView>` state + `selectedJobId`; render `JobRail` + detail pane.
- `src/renderer/src/download-view.tsx` — accept a `jobId`/selected `JobView`; controls call `jobId` APIs.
- `src/renderer/src/transport-deck.tsx` — accept `jobId`; controls call `jobId` APIs.
- `src/renderer/src/i18n/locales/en.ts` + `de.ts` — update `settings.performance.parallelDesc`; add rail strings.

---

## Phase 1 — Budget distribution util

### Task 1: `distribute(total, jobs)` pure util

**Files:**
- Create: `src/shared/distribute.ts`
- Test: `src/shared/distribute.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/distribute.test.ts
import { describe, it, expect } from 'vitest'
import { distribute } from './distribute'

describe('distribute', () => {
  it('gives the whole budget to a single job', () => {
    expect(distribute(4, 1)).toEqual([4])
  })
  it('splits evenly when divisible', () => {
    expect(distribute(4, 2)).toEqual([2, 2])
    expect(distribute(6, 3)).toEqual([2, 2, 2])
  })
  it('hands the remainder to the earliest jobs, one extra each', () => {
    expect(distribute(4, 3)).toEqual([2, 1, 1])
    expect(distribute(5, 2)).toEqual([3, 2])
  })
  it('never grants a job fewer than 1 slot', () => {
    expect(distribute(2, 5)).toEqual([1, 1, 1, 1, 1])
  })
  it('returns [] for zero jobs', () => {
    expect(distribute(4, 0)).toEqual([])
  })
  it('treats total < 1 as 1', () => {
    expect(distribute(0, 2)).toEqual([1, 1])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/shared/distribute.test.ts`
Expected: FAIL with "Cannot find module './distribute'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/distribute.ts

/**
 * Split a total concurrency budget across N jobs as evenly as possible, giving
 * the remainder to the earliest jobs (one extra slot each). Every job always
 * receives at least 1 slot so it can make progress, even if that makes the sum
 * exceed `total` when jobs > total. Returns one limit per job, in order.
 */
export function distribute(total: number, jobs: number): number[] {
  if (jobs <= 0) return []
  const budget = Math.max(1, Math.floor(total))
  const base = Math.floor(budget / jobs)
  const remainder = budget % jobs
  return Array.from({ length: jobs }, (_, i) => Math.max(1, base + (i < remainder ? 1 : 0)))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/shared/distribute.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/distribute.ts src/shared/distribute.test.ts
git commit -m "feat(shared): add distribute util for splitting a concurrency budget"
```

---

## Phase 2 — Resizable pool

### Task 2: Add `setLimit` to `createPool`

**Files:**
- Modify: `src/main/pool.ts`
- Test: `src/main/pool.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// src/main/pool.test.ts
import { describe, it, expect } from 'vitest'
import { createPool } from './pool'

const defer = (): { p: Promise<void>; resolve: () => void } => {
  let resolve!: () => void
  const p = new Promise<void>((r) => (resolve = r))
  return { p, resolve }
}

describe('createPool', () => {
  it('runs at most `limit` tasks concurrently', async () => {
    const pool = createPool(2)
    let active = 0
    let peak = 0
    const gates = [defer(), defer(), defer(), defer()]
    gates.forEach((g) =>
      pool.run(async () => {
        active++
        peak = Math.max(peak, active)
        await g.p
        active--
      })
    )
    gates.forEach((g) => g.resolve())
    await pool.drain()
    expect(peak).toBe(2)
  })

  it('setLimit raises the ceiling and wakes waiters', async () => {
    const pool = createPool(1)
    let active = 0
    let peak = 0
    const gates = [defer(), defer(), defer()]
    gates.forEach((g) =>
      pool.run(async () => {
        active++
        peak = Math.max(peak, active)
        await g.p
        active--
      })
    )
    pool.setLimit(3) // wakes the two queued tasks
    await Promise.resolve()
    await Promise.resolve()
    gates.forEach((g) => g.resolve())
    await pool.drain()
    expect(peak).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/main/pool.test.ts`
Expected: FAIL — `pool.setLimit is not a function`.

- [ ] **Step 3: Implement `setLimit`**

Replace the body of `src/main/pool.ts` with:

```ts
// src/main/pool.ts

/** A dynamic concurrency pool: submit tasks over time, await them all with drain(). */
export function createPool(initialLimit: number): {
  run: (task: () => Promise<void>) => void
  setLimit: (n: number) => void
  drain: () => Promise<PromiseSettledResult<void>[]>
} {
  let limit = Math.max(1, initialLimit)
  let active = 0
  const waiters: Array<() => void> = []
  const all: Promise<void>[] = []

  const acquire = (): Promise<void> =>
    active < limit
      ? (active++, Promise.resolve())
      : new Promise<void>((resolve) => waiters.push(resolve)).then(() => {
          active++
        })

  const release = (): void => {
    active--
    waiters.shift()?.()
  }

  // Raising the limit must wake enough queued waiters to fill the new headroom;
  // lowering it just lets in-flight tasks drain naturally (no preemption).
  const setLimit = (n: number): void => {
    limit = Math.max(1, n)
    while (active < limit && waiters.length > 0) {
      active++
      waiters.shift()?.()
      // The woken waiter's `.then` increments `active` again; compensate so the
      // count stays correct (each waiter accounts for exactly one slot).
      active--
    }
  }

  const run = (task: () => Promise<void>): void => {
    const p = (async () => {
      await acquire()
      try {
        await task()
      } finally {
        release()
      }
    })()
    all.push(p)
  }

  const drain = (): Promise<PromiseSettledResult<void>[]> => Promise.allSettled(all)
  return { run, setLimit, drain }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test -- src/main/pool.test.ts src/main/pipeline.test.ts`
Expected: PASS. (`pipeline.test.ts` still passes — `createPool` signature is source-compatible.)

- [ ] **Step 5: Commit**

```bash
git add src/main/pool.ts src/main/pool.test.ts
git commit -m "feat(pool): allow resizing the concurrency limit at runtime"
```

---

## Phase 3 — Pipeline accepts a dynamic track budget

The pipeline currently reads `settings.performance.parallel` directly at `pipeline.ts:484`. Make it take the limit from deps (the worker's granted budget) and expose a `setLimit` on the controls handle so the pool can rebalance mid-run.

### Task 3: `JobControls.setLimit` + `RunJobDeps.getLimit`

**Files:**
- Modify: `src/main/pipeline.ts` (interfaces near line 166–193; pool creation near line 484; controls wiring near line 435)
- Test: `src/main/pipeline.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Add to `src/main/pipeline.test.ts` (top-level, alongside existing tests):

```ts
import { createPool } from './pool'

describe('createPool setLimit (pipeline contract)', () => {
  it('is exposed so runPipeline can rebalance', () => {
    const pool = createPool(1)
    expect(typeof pool.setLimit).toBe('function')
  })
})
```

This guards the contract the pipeline relies on. (The full runPipeline budget behavior is covered by `job-pool.test.ts` integration of `setLimit` messages.)

- [ ] **Step 2: Run to verify it passes already** (Task 2 added `setLimit`)

Run: `pnpm test -- src/main/pipeline.test.ts`
Expected: PASS.

- [ ] **Step 3: Extend `JobControls` and `RunJobDeps`**

In `src/main/pipeline.ts`, change the `JobControls` interface (line ~166):

```ts
export interface JobControls {
  skipTrack(index: number): void
  pauseTrack(index: number): void
  resumeTrack(index: number): void
  /** Resize this job's download/transform concurrency to a new track budget. */
  setLimit(limit: number): void
}
```

Add to `RunJobDeps` (after `checkpoint`, line ~192):

```ts
  /**
   * Initial per-job track budget (download + transform concurrency). Falls back
   * to `settings.performance.parallel` when absent (the non-worker code paths).
   */
  getLimit?: () => number
```

- [ ] **Step 4: Use the budget when building the pools**

In `runPipeline`, replace (line ~484):

```ts
    const limit = Math.max(1, settings.performance.parallel)
    const downloadPool = createPool(limit)
    const transformPool = createPool(limit)
```

with:

```ts
    const limit = Math.max(1, deps.getLimit?.() ?? settings.performance.parallel)
    const downloadPool = createPool(limit)
    const transformPool = createPool(limit)
```

- [ ] **Step 5: Expose `setLimit` on the controls handle**

Find the `deps.onControls?.({ ... })` block (line ~435) and add a `setLimit` member that resizes both pools:

```ts
    deps.onControls?.({
      skipTrack(index) {
        // ...existing body unchanged...
      },
      pauseTrack(index) {
        // ...existing body unchanged...
      },
      resumeTrack(index) {
        // ...existing body unchanged...
      },
      setLimit(next) {
        const n = Math.max(1, next)
        downloadPool.setLimit(n)
        transformPool.setLimit(n)
      }
    })
```

(Leave the existing `skipTrack`/`pauseTrack`/`resumeTrack` bodies exactly as they are; only add the `setLimit` member.)

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm test -- src/main/pipeline.test.ts && pnpm run typecheck:node`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/main/pipeline.ts src/main/pool.ts
git commit -m "feat(pipeline): take track budget from deps and rebalance via controls.setLimit"
```

---

## Phase 4 — Job worker protocol

### Task 4: `job-protocol.ts` wire types

**Files:**
- Create: `src/main/workers/job-protocol.ts`

- [ ] **Step 1: Write the file** (pure types, no runtime — no separate test; consumed by typed tests later)

```ts
// src/main/workers/job-protocol.ts
// Wire types shared between the main-thread job client/pool and the worker that
// runs a whole job (resolve → download → transform) off the main thread. Pure
// types only, so importing this never pulls the worker or pipeline into a bundle.
import type {
  JobProgress,
  JobStatus,
  StartJobRequest,
  Settings
} from '../../shared/types'
import type { BinaryPaths } from '../binaries'
import type { JobResult } from '../pipeline'
import type { RetransformTarget } from '../retransform-source'

/** Which JobSource builder the worker uses. */
export type JobKind = 'download' | 'retransform' | 'resume'

/** Lifecycle state of a job as shown in the renderer rail. */
export type JobState = 'queued' | 'running' | 'paused'

/** Roster entry for one job (queued or running). */
export interface JobMeta {
  jobId: string
  title: string
  kind: JobKind
  state: JobState
}

/** A captured log line forwarded from the worker into the main log pipeline. */
export interface JobLogLine {
  level: 'debug' | 'info' | 'warn' | 'error'
  scope: string
  message: string
}

/** Everything the worker needs to rebuild its live deps. All serializable. */
export interface JobDepsConfig {
  bin: BinaryPaths
  settings: Settings
  homeBase: string
  cacheDir: string
  jobsDir: string
  folderOverride?: string
  cookieFile?: string
  /** Starting track budget; the worker sizes its pools to this before setLimit. */
  initialLimit: number
}

/** What a `start` message carries for each job kind. */
export type JobStartPayload =
  | { kind: 'download' | 'resume'; req: StartJobRequest; resumeJobId?: string }
  | { kind: 'retransform'; targets: RetransformTarget[] }

/** Main → worker messages. */
export type JobWorkerCommand =
  | { type: 'start'; jobId: string; deps: JobDepsConfig; payload: JobStartPayload }
  | { type: 'setLimit'; limit: number }
  | { type: 'cancel' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'skipTrack'; index: number }
  | { type: 'pauseTrack'; index: number }
  | { type: 'resumeTrack'; index: number }

/** Worker → main messages. */
export type JobWorkerEvent =
  | { type: 'progress'; progress: JobProgress }
  | { type: 'status'; status: JobStatus }
  | { type: 'paused'; paused: boolean }
  | { type: 'trackPaused'; index: number; paused: boolean }
  | { type: 'log'; line: JobLogLine }
  | { type: 'done'; result: JobResult }
  | { type: 'error'; message: string; cancelled: boolean }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck:node`
Expected: PASS (confirms `RetransformTarget`, `JobResult`, `BinaryPaths` import paths resolve).

- [ ] **Step 3: Commit**

```bash
git add src/main/workers/job-protocol.ts
git commit -m "feat(workers): add job-worker wire protocol types"
```

---

## Phase 5 — Job client (main-side handle)

### Task 5: `job-client.ts` + test

**Files:**
- Create: `src/main/workers/job-client.ts`
- Test: `src/main/workers/job-client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/workers/job-client.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createJobClient, type JobWorkerLike } from './job-client'
import type { JobWorkerCommand, JobWorkerEvent } from './job-protocol'

function fakeWorker(): JobWorkerLike & {
  emit: (e: JobWorkerEvent) => void
  emitExit: () => void
  sent: JobWorkerCommand[]
} {
  const listeners: Record<string, ((arg: unknown) => void)[]> = {}
  return {
    sent: [],
    postMessage(msg: JobWorkerCommand) {
      this.sent.push(msg)
    },
    on(event: string, cb: (arg: never) => void) {
      ;(listeners[event] ??= []).push(cb as (arg: unknown) => void)
    },
    terminate() {},
    emit(e) {
      listeners['message']?.forEach((cb) => cb(e))
    },
    emitExit() {
      listeners['exit']?.forEach((cb) => cb(0 as never))
    }
  }
}

describe('createJobClient', () => {
  it('forwards start and controls as commands', () => {
    const w = fakeWorker()
    const client = createJobClient(() => w, {})
    client.start('J1', { kind: 'download', req: { url: 'u', title: 't', kind: 'video', entries: [] } } as never, {
      initialLimit: 4
    } as never)
    client.setLimit(2)
    client.pause()
    client.skipTrack(3)
    expect(w.sent[0]).toMatchObject({ type: 'start', jobId: 'J1' })
    expect(w.sent[1]).toEqual({ type: 'setLimit', limit: 2 })
    expect(w.sent[2]).toEqual({ type: 'pause' })
    expect(w.sent[3]).toEqual({ type: 'skipTrack', index: 3 })
  })

  it('routes worker events to handlers', () => {
    const w = fakeWorker()
    const onProgress = vi.fn()
    const onDone = vi.fn()
    const client = createJobClient(() => w, { onProgress, onDone })
    client.start('J1', { kind: 'download' } as never, { initialLimit: 1 } as never)
    w.emit({ type: 'progress', progress: { jobTitle: 't' } as never })
    w.emit({ type: 'done', result: { title: 't' } as never })
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ jobTitle: 't' }))
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ title: 't' }))
  })

  it('surfaces an unexpected exit as an error event', () => {
    const w = fakeWorker()
    const onError = vi.fn()
    const client = createJobClient(() => w, { onError })
    client.start('J1', { kind: 'download' } as never, { initialLimit: 1 } as never)
    w.emitExit()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ cancelled: false }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/main/workers/job-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `job-client.ts`**

```ts
// src/main/workers/job-client.ts
// Main-thread handle around one job worker. Owns a lazily-spawned worker, forwards
// commands, and fans worker events out to injected handlers. The worker factory is
// injected so this logic is unit-testable without a real thread; the production
// factory (which imports the bundled worker via `?nodeWorker`) lives in job-host.ts.
import type { JobProgress, JobStatus } from '../../shared/types'
import type { JobResult } from '../pipeline'
import type {
  JobDepsConfig,
  JobLogLine,
  JobStartPayload,
  JobWorkerCommand,
  JobWorkerEvent
} from './job-protocol'

/** The subset of a worker_threads Worker we use; lets tests inject a fake. */
export interface JobWorkerLike {
  postMessage(msg: JobWorkerCommand): void
  on(event: 'message', cb: (msg: JobWorkerEvent) => void): void
  on(event: 'error', cb: (err: Error) => void): void
  on(event: 'exit', cb: (code: number) => void): void
  terminate(): void | Promise<number>
}

export interface JobClientHandlers {
  onProgress?: (p: JobProgress) => void
  onStatus?: (s: JobStatus) => void
  onPaused?: (paused: boolean) => void
  onTrackPaused?: (index: number, paused: boolean) => void
  onLog?: (line: JobLogLine) => void
  onDone?: (result: JobResult) => void
  onError?: (e: { message: string; cancelled: boolean }) => void
}

export interface JobClient {
  start(jobId: string, payload: JobStartPayload, deps: JobDepsConfig): void
  setLimit(limit: number): void
  cancel(): void
  pause(): void
  resume(): void
  skipTrack(index: number): void
  pauseTrack(index: number): void
  resumeTrack(index: number): void
  terminate(): void
}

export function createJobClient(
  spawn: () => JobWorkerLike,
  handlers: JobClientHandlers
): JobClient {
  const worker = spawn()
  let finished = false

  worker.on('message', (msg) => {
    switch (msg.type) {
      case 'progress':
        handlers.onProgress?.(msg.progress)
        break
      case 'status':
        handlers.onStatus?.(msg.status)
        break
      case 'paused':
        handlers.onPaused?.(msg.paused)
        break
      case 'trackPaused':
        handlers.onTrackPaused?.(msg.index, msg.paused)
        break
      case 'log':
        handlers.onLog?.(msg.line)
        break
      case 'done':
        finished = true
        handlers.onDone?.(msg.result)
        break
      case 'error':
        finished = true
        handlers.onError?.({ message: msg.message, cancelled: msg.cancelled })
        break
    }
  })
  worker.on('error', (err) => {
    if (finished) return
    finished = true
    handlers.onError?.({ message: String(err), cancelled: false })
  })
  worker.on('exit', () => {
    if (finished) return
    finished = true
    handlers.onError?.({ message: 'job worker exited', cancelled: false })
  })

  const send = (msg: JobWorkerCommand): void => worker.postMessage(msg)

  return {
    start(jobId, payload, deps) {
      send({ type: 'start', jobId, deps, payload })
    },
    setLimit: (limit) => send({ type: 'setLimit', limit }),
    cancel: () => send({ type: 'cancel' }),
    pause: () => send({ type: 'pause' }),
    resume: () => send({ type: 'resume' }),
    skipTrack: (index) => send({ type: 'skipTrack', index }),
    pauseTrack: (index) => send({ type: 'pauseTrack', index }),
    resumeTrack: (index) => send({ type: 'resumeTrack', index }),
    terminate: () => void worker.terminate()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/main/workers/job-client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/workers/job-client.ts src/main/workers/job-client.test.ts
git commit -m "feat(workers): add job-client main-side worker handle"
```

---

## Phase 6 — Job worker entry (self-contained)

### Task 6: `job-worker.ts`

Self-contained: rebuilds `RunJobDeps` with **inline** analyze/media (running on the worker's own thread), forwards progress/status/log/controls as messages, owns its child processes via its own copy of `spawn.ts`.

**Files:**
- Create: `src/main/workers/job-worker.ts`

- [ ] **Step 1: Write the worker**

```ts
// src/main/workers/job-worker.ts
// Worker-thread entry that runs a whole job (resolve → download → transform) off
// the main thread. Self-contained: it reconstructs its own metadata cache,
// checkpoint sink, and INLINE analyze/media services (essentia WASM boots once per
// worker), and spawns/owns its own yt-dlp/ffmpeg child processes. The main process
// addresses it purely by message (see job-protocol.ts).
//
// Built as a separate main-process entry (electron.vite.config) and loaded via the
// `?nodeWorker` import in job-host.ts.
import { parentPort } from 'node:worker_threads'
import { runPipeline, buildDownloadSourceFromEntries, type RunJobDeps, type JobControls } from '../pipeline'
import { buildRetransformSource } from '../retransform-source'
import { createMetadataCache } from '../metadata-cache'
import { createCheckpointSink } from '../job-checkpoint'
import { resumeAllChildren, pauseAllChildren } from '../spawn'
import { analyzeTrack, buildAnalyzeDeps } from '../transforms/analyze-key-bpm'
import { readTrackTags, writeTrackTags, embedCover, readCoverImage } from '../tagger'
import { hashAudioFile } from '../audio-hash'
import { setLogSink } from '../log'
import type { OffThreadAnalyze, AnalyzeLogLine } from './analyze-protocol'
import type { OffThreadMedia } from './media-protocol'
import type { TransformLog } from '../transforms/types'
import type { JobWorkerCommand, JobWorkerEvent, JobDepsConfig, JobStartPayload } from './job-protocol'

if (!parentPort) throw new Error('job-worker must be run as a worker thread')
const port = parentPort

const emit = (e: JobWorkerEvent): void => port.postMessage(e)

// Route this worker's logger into the main process so the console window + log file
// still see job output, tagged by scope.
setLogSink((level, scope, message) => emit({ type: 'log', line: { level, scope, message } }))

let controls: JobControls | null = null
let limit = 1
const abort = new AbortController()

/** Inline analyze service — runs essentia on THIS worker thread. */
const analyze: OffThreadAnalyze = async (file, config) => {
  const logs: AnalyzeLogLine[] = []
  const log: TransformLog = {
    debug: (...a) => logs.push({ level: 'debug', message: a.map(String).join(' ') }),
    info: (...a) => logs.push({ level: 'info', message: a.map(String).join(' ') }),
    warn: (...a) => logs.push({ level: 'warn', message: a.map(String).join(' ') })
  }
  const deps = buildAnalyzeDeps(log, ffmpegPath, abort.signal)
  const { tags, samples } = await analyzeTrack(file, config, deps)
  return { tags, samples, logs }
}

/** Inline media service — runs node-id3 / hashing on THIS worker thread. */
const media: OffThreadMedia = {
  hash: async (file) => hashAudioFile(file),
  readTags: async (file) => readTrackTags(file),
  writeTags: async (file, tags) => writeTrackTags(file, tags),
  embedCover: async (file, image, mime) => embedCover(file, Buffer.from(image), mime),
  readCover: async (file) => readCoverImage(file),
  terminate: () => {}
}

let ffmpegPath = ''

function buildDeps(jobId: string, cfg: JobDepsConfig): RunJobDeps {
  ffmpegPath = cfg.bin.ffmpeg
  limit = cfg.initialLimit
  return {
    bin: cfg.bin,
    settings: cfg.settings,
    homeBase: cfg.homeBase,
    folderOverride: cfg.folderOverride,
    cache: createMetadataCache(cfg.cacheDir),
    checkpoint: createCheckpointSink(cfg.jobsDir, jobId, () => Date.now()),
    analyze,
    media,
    signal: abort.signal,
    getLimit: () => limit,
    onProgress: (progress) => emit({ type: 'progress', progress }),
    onStatus: (status) => emit({ type: 'status', status }),
    onControls: (c) => {
      controls = c
      c.setLimit(limit)
    }
  }
}

async function start(jobId: string, cfg: JobDepsConfig, payload: JobStartPayload): Promise<void> {
  const deps = buildDeps(jobId, cfg)
  const source =
    payload.kind === 'retransform'
      ? buildRetransformSource(payload.targets)
      : buildDownloadSourceFromEntries(payload.req, deps, cfg.cookieFile)
  try {
    const result = await runPipeline(source, deps)
    emit({ type: 'done', result })
  } catch (err) {
    emit({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      cancelled: abort.signal.aborted
    })
  }
}

port.on('message', (msg: JobWorkerCommand) => {
  switch (msg.type) {
    case 'start':
      void start(msg.jobId, msg.deps, msg.payload)
      break
    case 'setLimit':
      limit = msg.limit
      controls?.setLimit(msg.limit)
      break
    case 'cancel':
      resumeAllChildren() // clear any paused flag so children die cleanly
      abort.abort()
      break
    case 'pause':
      pauseAllChildren()
      emit({ type: 'paused', paused: true })
      break
    case 'resume':
      resumeAllChildren()
      emit({ type: 'paused', paused: false })
      break
    case 'skipTrack':
      controls?.skipTrack(msg.index)
      break
    case 'pauseTrack':
      controls?.pauseTrack(msg.index)
      emit({ type: 'trackPaused', index: msg.index, paused: true })
      break
    case 'resumeTrack':
      controls?.resumeTrack(msg.index)
      emit({ type: 'trackPaused', index: msg.index, paused: false })
      break
  }
})
```

- [ ] **Step 2: Add `setLogSink` to the log module**

The worker redirects logging to the main process. Inspect `src/main/log.ts`: it must expose a `setLogSink(fn)` that, when set, receives every log line instead of (or in addition to) the default file/console path. If it does not already, add:

```ts
// src/main/log.ts — add near the top-level state
type LogSink = (level: LogLevel, scope: string, message: string) => void
let externalSink: LogSink | null = null
export function setLogSink(sink: LogSink | null): void {
  externalSink = sink
}
```

Then, inside the existing log-writing function (where a line is finalized), add at the start:

```ts
  if (externalSink) {
    externalSink(level, scope, message)
    return
  }
```

Match the actual parameter names/shape used in `log.ts` (read the file first; `level`/`scope`/`message` here are illustrative — adapt to its real signature). Keep `LogLevel` imported/defined as it already is.

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck:node`
Expected: PASS. If `readCoverImage` returns `{ image: Buffer; mime } | null` it already matches `OffThreadMedia.readCover`; otherwise wrap to match. If `buildAnalyzeDeps`/`analyzeTrack` import paths differ, fix to match `analyze-worker.ts` (copy its exact imports).

- [ ] **Step 4: Commit**

```bash
git add src/main/workers/job-worker.ts src/main/log.ts
git commit -m "feat(workers): add self-contained job worker entry"
```

---

### Task 7: `job-host.ts` production factory

**Files:**
- Create: `src/main/workers/job-host.ts`
- Modify: `electron.vite.config.*` (register the new worker entry, mirroring analyze/media)

- [ ] **Step 1: Inspect how analyze-worker is registered**

Read `electron.vite.config.ts` (or `.mts`). The analyze/media workers are bundled because of the `?nodeWorker` import in their host files plus (if present) an explicit `build.rollupOptions.input` entry. Add a parallel registration for `job-worker` exactly as analyze-worker is registered. If analyze relies solely on the `?nodeWorker` import with no config entry, no config change is needed.

- [ ] **Step 2: Write `job-host.ts`**

```ts
// src/main/workers/job-host.ts
// Production wiring for the job worker. Kept separate from job-client.ts because
// the `?nodeWorker` import is an electron-vite build feature the unit-test runner
// can't resolve — the client's tests import only the pure factory, never this.
import createJobWorker from './job-worker?nodeWorker'
import { createJobClient, type JobClient, type JobClientHandlers, type JobWorkerLike } from './job-client'

/** Spawn a fresh job worker wired to the given handlers. */
export function spawnJobClient(handlers: JobClientHandlers): JobClient {
  return createJobClient(() => createJobWorker({}) as unknown as JobWorkerLike, handlers)
}
```

- [ ] **Step 3: Build to verify the worker bundles**

Run: `pnpm run build`
Expected: build succeeds and emits a `job-worker` chunk beside `index.js` in `out/main/` (verify with `ls out/main`). If essentia/pipeline deps fail to resolve, mirror whatever externals config analyze-worker uses.

- [ ] **Step 4: Commit**

```bash
git add src/main/workers/job-host.ts electron.vite.config.*
git commit -m "feat(workers): wire production job-worker factory and bundling"
```

---

## Phase 7 — Job pool (scheduler)

### Task 8: `job-pool.ts` + test

**Files:**
- Create: `src/main/job-pool.ts`
- Test: `src/main/job-pool.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/job-pool.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createJobPool } from './job-pool'
import type { JobClient, JobClientHandlers } from './workers/job-client'

/** A fake JobClient that records commands and lets the test drive its handlers. */
function makeFakeClientFactory() {
  const clients: Array<{
    handlers: JobClientHandlers
    started: string[]
    limits: number[]
    cancelled: boolean
    terminated: boolean
  }> = []
  const factory = (handlers: JobClientHandlers): JobClient => {
    const rec = { handlers, started: [] as string[], limits: [] as number[], cancelled: false, terminated: false }
    clients.push(rec)
    return {
      start: (jobId) => rec.started.push(jobId),
      setLimit: (n) => rec.limits.push(n),
      cancel: () => (rec.cancelled = true),
      pause: vi.fn(),
      resume: vi.fn(),
      skipTrack: vi.fn(),
      pauseTrack: vi.fn(),
      resumeTrack: vi.fn(),
      terminate: () => (rec.terminated = true)
    }
  }
  return { factory, clients }
}

const cfg = () => ({
  bin: {} as never,
  settings: { performance: { parallel: 2 } } as never,
  homeBase: '/h',
  cacheDir: '/c',
  jobsDir: '/j'
})

describe('createJobPool', () => {
  it('runs at most N=parallel jobs and queues the rest', () => {
    const { factory, clients } = makeFakeClientFactory()
    const pool = createJobPool({ spawn: factory, getParallel: () => 2, depsConfig: cfg, onRosterChange: vi.fn() })
    pool.enqueue('A', { kind: 'download', req: {} as never })
    pool.enqueue('B', { kind: 'download', req: {} as never })
    pool.enqueue('C', { kind: 'download', req: {} as never })
    expect(clients.filter((c) => c.started.length).length).toBe(2) // A, B running; C queued
    expect(pool.roster().map((j) => j.state)).toEqual(['running', 'running', 'queued'])
  })

  it('distributes the budget across running jobs and rebalances on completion', () => {
    const { factory, clients } = makeFakeClientFactory()
    const pool = createJobPool({ spawn: factory, getParallel: () => 4, depsConfig: cfg, onRosterChange: vi.fn() })
    pool.enqueue('A', { kind: 'download', req: {} as never })
    pool.enqueue('B', { kind: 'download', req: {} as never })
    // 4 budget / 2 jobs => 2 each (initial via depsConfig.initialLimit OR setLimit)
    expect(clients[0].limits.at(-1)).toBe(2)
    expect(clients[1].limits.at(-1)).toBe(2)
    // A finishes => B should get the whole budget
    clients[0].handlers.onDone?.({ title: 'A' } as never)
    expect(clients[1].limits.at(-1)).toBe(4)
  })

  it('cancelling a queued job removes it without spawning a worker', () => {
    const { factory, clients } = makeFakeClientFactory()
    const pool = createJobPool({ spawn: factory, getParallel: () => 1, depsConfig: cfg, onRosterChange: vi.fn() })
    pool.enqueue('A', { kind: 'download', req: {} as never })
    pool.enqueue('B', { kind: 'download', req: {} as never })
    pool.cancel('B')
    expect(clients.length).toBe(1) // only A ever spawned
    expect(pool.roster().map((j) => j.jobId)).toEqual(['A'])
  })

  it('pumps the next queued job when a running one finishes', () => {
    const { factory, clients } = makeFakeClientFactory()
    const pool = createJobPool({ spawn: factory, getParallel: () => 1, depsConfig: cfg, onRosterChange: vi.fn() })
    pool.enqueue('A', { kind: 'download', req: {} as never })
    pool.enqueue('B', { kind: 'download', req: {} as never })
    expect(clients.length).toBe(1)
    clients[0].handlers.onDone?.({ title: 'A' } as never)
    expect(clients.length).toBe(2) // B now started
  })

  it('routes controls to the owning running job', () => {
    const { factory, clients } = makeFakeClientFactory()
    const pool = createJobPool({ spawn: factory, getParallel: () => 2, depsConfig: cfg, onRosterChange: vi.fn() })
    pool.enqueue('A', { kind: 'download', req: {} as never })
    pool.cancel('A')
    expect(clients[0].cancelled).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/main/job-pool.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `job-pool.ts`**

```ts
// src/main/job-pool.ts
// The scheduler. Owns the registry of jobs (queued + running), spawns/reuses job
// workers up to the unified "parallel downloads" budget, distributes that budget
// across the running set, routes jobId-keyed controls to the owning worker, and
// folds each finished job's result back via callbacks. Main stays the sole writer
// of history/settings (see onDone/onError consumers in index.ts).
import { distribute } from '../shared/distribute'
import type { JobClient, JobClientHandlers } from './workers/job-client'
import type { JobProgress, JobStatus } from '../shared/types'
import type { JobResult } from './pipeline'
import type { JobDepsConfig, JobMeta, JobStartPayload, JobLogLine } from './workers/job-protocol'

/** Per-job hooks the host (index.ts) supplies to relay events to the renderer. */
export interface JobPoolHooks {
  onProgress?: (jobId: string, p: JobProgress) => void
  onStatus?: (jobId: string, s: JobStatus) => void
  onPaused?: (jobId: string, paused: boolean) => void
  onTrackPaused?: (jobId: string, index: number, paused: boolean) => void
  onLog?: (jobId: string, line: JobLogLine) => void
  onDone?: (jobId: string, payload: JobStartPayload, result: JobResult) => void
  onError?: (jobId: string, payload: JobStartPayload, e: { message: string; cancelled: boolean }) => void
}

export interface JobPoolOptions extends JobPoolHooks {
  spawn: (handlers: JobClientHandlers) => JobClient
  /** Current unified concurrency budget (settings.performance.parallel). */
  getParallel: () => number
  /** Build the serializable deps config for a job (initialLimit filled by the pool). */
  depsConfig: () => Omit<JobDepsConfig, 'initialLimit' | 'folderOverride' | 'cookieFile'> & {
    folderOverride?: string
    cookieFile?: string
  }
  onRosterChange: (roster: JobMeta[]) => void
}

interface Running {
  meta: JobMeta
  client: JobClient
  payload: JobStartPayload
}
interface Queued {
  meta: JobMeta
  payload: JobStartPayload
}

function titleOf(payload: JobStartPayload): string {
  if (payload.kind === 'retransform') return 'Re-transform'
  return payload.req.title || payload.req.url
}

export function createJobPool(opts: JobPoolOptions): {
  enqueue: (jobId: string, payload: JobStartPayload) => void
  cancel: (jobId: string) => void
  pause: (jobId: string) => void
  resume: (jobId: string) => void
  skipTrack: (jobId: string, index: number) => void
  pauseTrack: (jobId: string, index: number) => void
  resumeTrack: (jobId: string, index: number) => void
  roster: () => JobMeta[]
  onParallelChanged: () => void
} {
  const running = new Map<string, Running>()
  const queue: Queued[] = []

  const roster = (): JobMeta[] => [
    ...[...running.values()].map((r) => r.meta),
    ...queue.map((q) => q.meta)
  ]
  const publishRoster = (): void => opts.onRosterChange(roster())

  /** Recompute and push each running job's track budget. */
  const rebalance = (): void => {
    const ids = [...running.keys()]
    const limits = distribute(opts.getParallel(), ids.length)
    ids.forEach((id, i) => running.get(id)!.client.setLimit(limits[i]))
  }

  const finish = (jobId: string): void => {
    const r = running.get(jobId)
    if (!r) return
    r.client.terminate()
    running.delete(jobId)
    rebalance()
    pump()
    publishRoster()
  }

  const startJob = (q: Queued): void => {
    const handlers: JobClientHandlers = {
      onProgress: (p) => opts.onProgress?.(q.meta.jobId, p),
      onStatus: (s) => opts.onStatus?.(q.meta.jobId, s),
      onPaused: (paused) => {
        const r = running.get(q.meta.jobId)
        if (r) r.meta.state = paused ? 'paused' : 'running'
        opts.onPaused?.(q.meta.jobId, paused)
        publishRoster()
      },
      onTrackPaused: (i, paused) => opts.onTrackPaused?.(q.meta.jobId, i, paused),
      onLog: (line) => opts.onLog?.(q.meta.jobId, line),
      onDone: (result) => {
        opts.onDone?.(q.meta.jobId, q.payload, result)
        finish(q.meta.jobId)
      },
      onError: (e) => {
        opts.onError?.(q.meta.jobId, q.payload, e)
        finish(q.meta.jobId)
      }
    }
    const client = opts.spawn(handlers)
    const meta: JobMeta = { ...q.meta, state: 'running' }
    running.set(q.meta.jobId, { meta, client, payload: q.payload })
    const base = opts.depsConfig()
    client.start(q.meta.jobId, q.payload, { ...base, initialLimit: 1 })
    rebalance() // sets the real budget now that the running set changed
  }

  const pump = (): void => {
    while (running.size < Math.max(1, opts.getParallel()) && queue.length > 0) {
      startJob(queue.shift()!)
    }
  }

  return {
    enqueue(jobId, payload) {
      queue.push({ meta: { jobId, title: titleOf(payload), kind: payload.kind, state: 'queued' }, payload })
      pump()
      publishRoster()
    },
    cancel(jobId) {
      const r = running.get(jobId)
      if (r) {
        r.client.cancel()
        return
      }
      const i = queue.findIndex((q) => q.meta.jobId === jobId)
      if (i >= 0) {
        queue.splice(i, 1)
        publishRoster()
      }
    },
    pause: (jobId) => running.get(jobId)?.client.pause(),
    resume: (jobId) => running.get(jobId)?.client.resume(),
    skipTrack: (jobId, index) => running.get(jobId)?.client.skipTrack(index),
    pauseTrack: (jobId, index) => running.get(jobId)?.client.pauseTrack(index),
    resumeTrack: (jobId, index) => running.get(jobId)?.client.resumeTrack(index),
    roster,
    onParallelChanged: () => rebalance()
  }
}
```

> **Note for the test:** the initial `client.start(..., { initialLimit: 1 })` is immediately followed by `rebalance()`, so `clients[i].limits.at(-1)` reflects the distributed budget. The `onDone` in the rebalance test fires `finish`, which `rebalance()`s the remaining job to the full budget. This matches the assertions in Step 1.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/main/job-pool.test.ts`
Expected: PASS (5 tests). Fix any off-by-one in `distribute` wiring if a limit assertion fails.

- [ ] **Step 5: Commit**

```bash
git add src/main/job-pool.ts src/main/job-pool.test.ts
git commit -m "feat(main): add job pool scheduler with budget distribution and queue"
```

---

## Phase 8 — Main process integration

This rewires `src/main/index.ts` to drive jobs through the pool and to address every control by `jobId`. It also moves history/result folding into the pool's `onDone`/`onError` callbacks. Read the current handlers (lines 280–620) before editing.

### Task 9: Instantiate the pool and relay events

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create the pool once, after the window/helpers exist**

Near the other module-level singletons (after `getMetaCache`, ~line 100), add:

```ts
import { createJobPool } from './job-pool'
import { spawnJobClient } from './workers/job-host'
import type { JobStartPayload, JobMeta } from './workers/job-protocol'
import { addEntry, updateTrack } from './history' // if not already imported
import { randomUUID } from 'node:crypto' // confirm already imported

let jobPool: ReturnType<typeof createJobPool> | null = null

function getJobPool(): ReturnType<typeof createJobPool> {
  if (jobPool) return jobPool
  jobPool = createJobPool({
    spawn: spawnJobClient,
    getParallel: () => loadSettings().performance.parallel,
    depsConfig: () => ({
      bin: currentBin(),
      settings: loadSettings(),
      homeBase: expandHome(loadSettings().downloads.baseFolder),
      cacheDir: metaCacheDir(), // the dir getMetaCache() points at — extract if needed
      jobsDir: jobsDir()
    }),
    onRosterChange: (roster) => getWindow()?.webContents.send('jobs:listChanged', roster),
    onProgress: (jobId, p) => {
      const win = getWindow()
      win?.webContents.send('job:progress', jobId, p)
      win?.setProgressBar(p.overall > 0 && p.overall < 1 ? p.overall : p.overall >= 1 ? 1 : -1)
    },
    onStatus: (jobId, s) => getWindow()?.webContents.send('job:status', jobId, s),
    onPaused: (jobId, paused) => getWindow()?.webContents.send('job:paused', jobId, paused),
    onTrackPaused: (jobId, i, paused) =>
      getWindow()?.webContents.send('job:trackPaused', jobId, i, paused),
    onLog: (jobId, line) => appendWorkerLog(jobId, line), // see Step 2
    onDone: (jobId, payload, result) => foldJobResult(jobId, payload, result),
    onError: (jobId, payload, e) => foldJobError(jobId, payload, e)
  })
  return jobPool
}
```

If `getMetaCache()` constructs the cache from a private dir, extract a `metaCacheDir()` helper that returns that path so both the cache and the worker config use the same directory. Same for `jobsDir()` (already exists, per existing checkpoint usage).

- [ ] **Step 2: Forward worker logs into the existing log pipeline**

```ts
import { log } from './log'

function appendWorkerLog(jobId: string, line: { level: 'debug' | 'info' | 'warn' | 'error'; scope: string; message: string }): void {
  // Re-emit through the main logger so the console window + log file capture it.
  log[line.level](line.scope, line.message)
}
```

(If `log` does not have a per-level signature like `log.info(scope, msg)`, adapt to its real API as used elsewhere in `index.ts`.)

- [ ] **Step 3: Move result/error folding out of the old job:start body into reusable functions**

Port the history-folding logic currently inside `job:start`'s `try` (lines ~356–378) and `catch` (lines ~379–412), plus the retransform folding (lines ~454–473), into:

```ts
function foldJobResult(jobId: string, payload: JobStartPayload, result: JobResult): void {
  getWindow()?.setProgressBar(-1)
  if (payload.kind === 'retransform') {
    // Port the retransform history fold (pipeline.ts result.tracks aligned to targets).
    const latest = loadSettings()
    let history = latest.history
    result.tracks.forEach((tk, i) => {
      if (tk.status !== 'done') return
      const tgt = payload.targets[i]
      history = updateTrack(history, tgt.entryId, tgt.index, {
        file: tk.file, title: tk.title, artist: tk.artist, album: tk.album, year: tk.year, hash: tk.hash
      })
    })
    saveSettings(settingsPath(), { ...latest, history })
    getWindow()?.webContents.send('history:changed')
    return
  }
  // download / resume: record a HistoryEntry exactly as the old job:start did.
  const entry: HistoryEntry = {
    id: randomUUID(),
    jobId,
    url: result.url,
    title: result.title,
    folder: result.folder,
    kind: result.kind,
    completedAt: new Date().toISOString(),
    outcome: result.outcome,
    tracks: result.tracks
  }
  const fresh = loadSettings()
  saveSettings(settingsPath(), { ...fresh, history: addEntry(fresh.history, entry) })
  getWindow()?.webContents.send('history:changed')
  deleteCheckpoint(jobsDir(), jobId)
}

function foldJobError(jobId: string, payload: JobStartPayload, e: { message: string; cancelled: boolean }): void {
  getWindow()?.setProgressBar(-1)
  if (payload.kind === 'retransform') {
    if (!e.cancelled) {
      log.error('app', 'retransform failed:', e.message)
      getWindow()?.webContents.send('job:status', jobId, { phase: 'error', error: e.message })
    }
    return
  }
  const req = payload.req
  const fresh = loadSettings()
  const entry: HistoryEntry = {
    id: randomUUID(),
    jobId,
    url: req.url,
    title: req.title || req.url,
    folder: req.folderOverride ?? expandHome(fresh.downloads.baseFolder),
    kind: req.kind,
    completedAt: new Date().toISOString(),
    outcome: e.cancelled ? 'cancelled' : 'failed',
    reason: e.message,
    tracks: []
  }
  saveSettings(settingsPath(), { ...fresh, history: addEntry(fresh.history, entry) })
  getWindow()?.webContents.send('history:changed')
  if (e.cancelled) {
    // A user cancel mid-run keeps a resumable checkpoint; a hard failure drops it.
    getWindow()?.webContents.send('jobs:interruptedChanged')
  } else {
    deleteCheckpoint(jobsDir(), jobId)
    log.error('app', 'job failed:', e.message)
    getWindow()?.webContents.send('job:status', jobId, { phase: 'error', error: e.message })
  }
}
```

> Behavior parity note: the old code marked a *cancelled* run as a resumable `interrupted` history entry and kept the checkpoint; a *failed before result* run dropped the checkpoint. `foldJobError` preserves that split. The worker keeps writing per-track checkpoints during the run, so cancellation leaves a resumable checkpoint on disk.

- [ ] **Step 4: Typecheck** (handlers rewired in the next task)

Run: `pnpm run typecheck:node`
Expected: may report unused vars until Task 10 — acceptable mid-task. Resolve genuine type errors in the new functions now.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(main): instantiate job pool and relay events/results"
```

---

### Task 10: Rewire the `job:*` IPC handlers to the pool

**Files:**
- Modify: `src/main/index.ts` (handlers at lines ~280–620)

- [ ] **Step 1: Replace `job:start`**

```ts
ipcMain.handle('job:start', (_e, req: StartJobRequest) => {
  const jobId = randomUUID()
  const cookieFile = pendingResolve?.url === req.url ? pendingResolve.cookieFile : undefined
  pendingResolve = null
  // depsConfig() in the pool reads bin/settings/dirs; cookieFile is per-job, so pass it
  // through the payload-side: extend startJob to merge it (see note below).
  getJobPool().enqueue(jobId, { kind: 'download', req, cookieFile } as JobStartPayload)
  return jobId
})
```

To carry `cookieFile` and `folderOverride` per job, extend `JobStartPayload`'s download/resume variant in `job-protocol.ts` to include optional `cookieFile?: string`, and in `job-pool.ts` `startJob`, merge it into the deps config: `client.start(jobId, q.payload, { ...base, cookieFile: q.payload.kind !== 'retransform' ? q.payload.cookieFile : undefined, initialLimit: 1 })`. Update the worker's `buildDeps`/`start` to read `cfg.cookieFile` (already wired in Task 6). Add a matching field to the protocol and re-run typecheck.

- [ ] **Step 2: Replace control handlers (all take `jobId`)**

```ts
ipcMain.handle('job:cancel', (_e, jobId: string) => getJobPool().cancel(jobId))
ipcMain.handle('job:pause', (_e, jobId: string) => getJobPool().pause(jobId))
ipcMain.handle('job:resume', (_e, jobId: string) => getJobPool().resume(jobId))
ipcMain.handle('job:skipTrack', (_e, jobId: string, index: number) =>
  getJobPool().skipTrack(jobId, index)
)
ipcMain.handle('job:pauseTrack', (_e, jobId: string, index: number) =>
  getJobPool().pauseTrack(jobId, index)
)
ipcMain.handle('job:resumeTrack', (_e, jobId: string, index: number) =>
  getJobPool().resumeTrack(jobId, index)
)
ipcMain.handle('jobs:list', () => getJobPool().roster())
```

Delete the old module-level `abort`, `jobControls`, `activeJobId` job-execution state and the now-dead `resumeAllChildren()`/`pauseAllChildren()` calls in these handlers (child-process control now lives inside each worker). Keep `killAllChildren()` only where the app quits (see Step 4). `job:resolve` keeps its own `AbortController` (Step 3).

- [ ] **Step 3: Give `job:resolve` its own abort**

```ts
let resolveAbort: AbortController | null = null
ipcMain.handle('job:resolve', async (_e, url: string) => {
  const settings = loadSettings()
  resolveAbort = new AbortController()
  const { job, cookieFile } = await resolveJob(url, {
    bin: currentBin(),
    settings,
    onStatus: (s) => getWindow()?.webContents.send('job:status', '', s), // '' = pre-job status
    signal: resolveAbort.signal
  })
  pendingResolve = { url, cookieFile }
  return job
})
```

The renderer's compose view listens for `job:status` with an empty `jobId` as "resolution status" (Task 13). Adapt `onStatus` consumers accordingly.

- [ ] **Step 4: Rewire resume + retransform + retry to the pool**

- `jobs:resume` (lines ~503–575): build the `StartJobRequest` from the checkpoint exactly as today, then `const jobId = cp.jobId; getJobPool().enqueue(jobId, { kind: 'resume', req, resumeJobId: cp.jobId })` and return. Drop the inline `runPipeline`.
- `job:retransform` (lines ~419–490): resolve `targets` as today, then `getJobPool().enqueue(randomUUID(), { kind: 'retransform', targets })`.
- `jobs:retryFailed` (lines ~587+): build its `StartJobRequest` as today and `enqueue` a `download` job.
- On app quit (`before-quit`/window-all-closed handler, plus `terminateAnalyzeClient`/`terminateMediaClient` calls): call `getJobPool()`-owned workers' termination. Add a `pool.shutdown()` to `job-pool.ts` that `terminate()`s all running clients, and call it on quit. (Add `shutdown` to the pool's returned object and a test asserting all running clients are terminated.)

- [ ] **Step 5: Typecheck + full test run**

Run: `pnpm run typecheck:node && pnpm test`
Expected: PASS. Fix references to removed `abort`/`activeJobId`/`jobControls`.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts src/main/job-pool.ts src/main/job-pool.test.ts src/main/workers/job-protocol.ts
git commit -m "feat(main): route all job IPC through the pool, keyed by jobId"
```

---

## Phase 9 — Preload

### Task 11: `jobId`-aware preload API

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Update control methods and events**

```ts
// imports: add JobMeta
import type { JobMeta } from '../shared/types' // re-export JobMeta from shared/types (see note)

startDownload: (req: StartJobRequest): Promise<string> => ipcRenderer.invoke('job:start', req),
cancel: (jobId: string): Promise<void> => ipcRenderer.invoke('job:cancel', jobId),
pause: (jobId: string): Promise<void> => ipcRenderer.invoke('job:pause', jobId),
resume: (jobId: string): Promise<void> => ipcRenderer.invoke('job:resume', jobId),
skipTrack: (jobId: string, index: number): Promise<void> =>
  ipcRenderer.invoke('job:skipTrack', jobId, index),
pauseTrack: (jobId: string, index: number): Promise<void> =>
  ipcRenderer.invoke('job:pauseTrack', jobId, index),
resumeTrack: (jobId: string, index: number): Promise<void> =>
  ipcRenderer.invoke('job:resumeTrack', jobId, index),
jobsList: (): Promise<JobMeta[]> => ipcRenderer.invoke('jobs:list'),

onProgress: (cb: (jobId: string, p: JobProgress) => void): (() => void) => {
  const fn = (_: unknown, jobId: string, p: JobProgress): void => cb(jobId, p)
  ipcRenderer.on('job:progress', fn)
  return () => ipcRenderer.removeListener('job:progress', fn)
},
onStatus: (cb: (jobId: string, s: JobStatus) => void): (() => void) => {
  const fn = (_: unknown, jobId: string, s: JobStatus): void => cb(jobId, s)
  ipcRenderer.on('job:status', fn)
  return () => ipcRenderer.removeListener('job:status', fn)
},
onPaused: (cb: (jobId: string, paused: boolean) => void): (() => void) => {
  const fn = (_: unknown, jobId: string, paused: boolean): void => cb(jobId, paused)
  ipcRenderer.on('job:paused', fn)
  return () => ipcRenderer.removeListener('job:paused', fn)
},
onTrackPaused: (cb: (jobId: string, index: number, paused: boolean) => void): (() => void) => {
  const fn = (_: unknown, jobId: string, index: number, paused: boolean): void =>
    cb(jobId, index, paused)
  ipcRenderer.on('job:trackPaused', fn)
  return () => ipcRenderer.removeListener('job:trackPaused', fn)
},
onJobsChanged: (cb: (roster: JobMeta[]) => void): (() => void) => {
  const fn = (_: unknown, roster: JobMeta[]): void => cb(roster)
  ipcRenderer.on('jobs:listChanged', fn)
  return () => ipcRenderer.removeListener('jobs:listChanged', fn)
},
```

- [ ] **Step 2: Re-export `JobMeta`/`JobState` from `shared/types.ts`**

`job-protocol.ts` defines `JobMeta`/`JobState`/`JobKind` in main, but preload + renderer must not import from `src/main`. Move those three type definitions to `src/shared/types.ts` and have `job-protocol.ts` import them from there. Update all references.

- [ ] **Step 3: Typecheck (web + node)**

Run: `pnpm run typecheck`
Expected: PASS (renderer will still reference old single-job API until Phase 10 — if the preload typedefs are shared via a `.d.ts`, expect renderer errors that Phase 10 resolves; otherwise the preload compiles standalone).

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/shared/types.ts src/main/workers/job-protocol.ts
git commit -m "feat(preload): thread jobId through job controls and events"
```

---

## Phase 10 — Renderer (master-detail)

### Task 12: App job-map state + `JobRail`

**Files:**
- Modify: `src/renderer/src/app.tsx`
- Create: `src/renderer/src/job-rail.tsx`
- Test: `src/renderer/src/job-rail.test.tsx`

- [ ] **Step 1: Define the renderer `JobView` and reducer-style state in `app.tsx`**

Replace the single-job state (`progress`, `paused`, `trackPaused`) with a map:

```tsx
import type { JobMeta, JobProgress, JobStatus } from '../../shared/types'

interface JobView {
  meta: JobMeta
  progress: JobProgress | null
  paused: boolean
  trackPaused: Record<number, boolean>
}

const [jobs, setJobs] = useState<Map<string, JobView>>(new Map())
const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

// Roster drives membership; events fill per-job detail.
useEffect(
  () =>
    window.plucker.onJobsChanged((roster) => {
      setJobs((prev) => {
        const next = new Map<string, JobView>()
        for (const meta of roster) {
          const existing = prev.get(meta.jobId)
          next.set(meta.jobId, existing ? { ...existing, meta } : { meta, progress: null, paused: false, trackPaused: {} })
        }
        return next
      })
    }),
  []
)
useEffect(
  () =>
    window.plucker.onProgress((jobId, p) =>
      setJobs((prev) => {
        const v = prev.get(jobId)
        if (!v) return prev
        const next = new Map(prev)
        next.set(jobId, { ...v, progress: p })
        return next
      })
    ),
  []
)
useEffect(
  () =>
    window.plucker.onPaused((jobId, paused) =>
      setJobs((prev) => {
        const v = prev.get(jobId)
        if (!v) return prev
        const next = new Map(prev)
        next.set(jobId, { ...v, paused })
        return next
      })
    ),
  []
)
useEffect(
  () =>
    window.plucker.onTrackPaused((jobId, index, paused) =>
      setJobs((prev) => {
        const v = prev.get(jobId)
        if (!v) return prev
        const next = new Map(prev)
        next.set(jobId, { ...v, trackPaused: { ...v.trackPaused, [index]: paused } })
        return next
      })
    ),
  []
)

// Seed the initial roster on mount.
useEffect(() => {
  window.plucker.jobsList().then((roster) =>
    setJobs((prev) => {
      const next = new Map(prev)
      for (const meta of roster) if (!next.has(meta.jobId)) next.set(meta.jobId, { meta, progress: null, paused: false, trackPaused: {} })
      return next
    })
  )
}, [])
```

Status (resolution) handling: keep a local `statusLog` keyed to the compose flow; `job:status` with empty `jobId` is the pre-job resolution status (see Task 13). Per-job status (errors) can update that job's view if needed.

- [ ] **Step 2: Write the `JobRail` test**

```tsx
// src/renderer/src/job-rail.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { JobRail } from './job-rail'
import type { JobMeta } from '../../shared/types'

const meta = (jobId: string, state: JobMeta['state']): JobMeta => ({
  jobId,
  title: `Job ${jobId}`,
  kind: 'download',
  state
})

describe('JobRail', () => {
  it('lists running, paused, and queued jobs plus a New entry', () => {
    render(
      <JobRail
        jobs={[
          { meta: meta('A', 'running'), overall: 0.6 },
          { meta: meta('B', 'paused'), overall: 0.3 },
          { meta: meta('C', 'queued'), overall: 0 }
        ]}
        selectedJobId="A"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('Job A')).toBeInTheDocument()
    expect(screen.getByText('Job C')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
  })

  it('fires onSelect when a row is clicked', () => {
    const onSelect = vi.fn()
    render(
      <JobRail
        jobs={[{ meta: meta('A', 'running'), overall: 0.6 }]}
        selectedJobId={null}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Job A'))
    expect(onSelect).toHaveBeenCalledWith('A')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- src/renderer/src/job-rail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `JobRail`**

```tsx
// src/renderer/src/job-rail.tsx
import React from 'react'
import { useTranslation } from 'react-i18next'
import type { JobMeta } from '../../shared/types'

export interface RailItem {
  meta: JobMeta
  /** 0..1 overall progress for the mini bar (0 for queued). */
  overall: number
}

export function JobRail({
  jobs,
  selectedJobId,
  onSelect,
  onCancel
}: {
  jobs: RailItem[]
  selectedJobId: string | null
  onSelect: (jobId: string | null) => void
  onCancel: (jobId: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 overflow-auto border-r border-line p-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`rounded px-3 py-2 text-left text-sm ${selectedJobId === null ? 'bg-accent/15 text-ink' : 'text-ink-dim hover:bg-surface-2'}`}
      >
        {t('jobs.new', '+ New')}
      </button>
      {jobs.map((j) => (
        <button
          key={j.meta.jobId}
          type="button"
          onClick={() => onSelect(j.meta.jobId)}
          className={`group rounded px-3 py-2 text-left ${selectedJobId === j.meta.jobId ? 'bg-accent/15' : 'hover:bg-surface-2'}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm text-ink">{j.meta.title}</span>
            <span
              role="button"
              aria-label={t('jobs.cancel', 'Cancel')}
              onClick={(e) => {
                e.stopPropagation()
                onCancel(j.meta.jobId)
              }}
              className="opacity-0 group-hover:opacity-100"
            >
              ✕
            </span>
          </div>
          <div className="mt-1 h-1 rounded bg-surface-2">
            <div
              className="h-1 rounded bg-accent"
              style={{ width: `${Math.round(j.overall * 100)}%` }}
            />
          </div>
          <span className="text-xs text-ink-dim">{t(`jobs.state.${j.meta.state}`, j.meta.state)}</span>
        </button>
      ))}
    </nav>
  )
}
```

Match the project's actual Tailwind tokens (`border-line`, `surface-2`, `accent`, `ink-dim`) to those used elsewhere in the renderer — read `header.tsx`/`transport-deck.tsx` for the real class names and swap as needed.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- src/renderer/src/job-rail.test.tsx`
Expected: PASS (2 tests). Add the i18n keys in Task 14 so `t(...)` returns the labels (the defaults given as the 2nd arg keep the test green meanwhile).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/job-rail.tsx src/renderer/src/job-rail.test.tsx src/renderer/src/app.tsx
git commit -m "feat(renderer): job-map state and JobRail left rail"
```

---

### Task 13: Wire rail + detail pane into the download view

**Files:**
- Modify: `src/renderer/src/app.tsx`, `src/renderer/src/download-view.tsx`, `src/renderer/src/transport-deck.tsx`

- [ ] **Step 1: Render rail + detail in the download page**

In `app.tsx`, replace the `<DownloadView .../>` block (lines ~260–282) with a rail+detail layout:

```tsx
<Page active={!overlayOpen && view === 'download'}>
  <div className="flex h-full min-h-0">
    <JobRail
      jobs={[...jobs.values()].map((v) => ({ meta: v.meta, overall: v.progress?.overall ?? 0 }))}
      selectedJobId={selectedJobId}
      onSelect={setSelectedJobId}
      onCancel={(jobId) => window.plucker.cancel(jobId)}
    />
    <div className="min-h-0 flex-1">
      <DownloadView
        job={selectedJobId ? jobs.get(selectedJobId) ?? null : null}
        statusLog={statusLog}
        resolveLog={logEntries.slice(jobLogStart)}
        urlHistory={urlHistory}
        redownloadRequest={redownloadRequest}
        prefill={prefill}
        onRedownloadConsumed={() => setRedownloadRequest(null)}
        onStart={(jobId) => {
          setSelectedJobId(jobId) // land on the job just kicked off
          setStatusLog([])
          setJobLogStart(logLen.current)
        }}
        onClear={() => setStatusLog(null)}
      />
    </div>
  </div>
</Page>
```

- [ ] **Step 2: Adapt `DownloadView` props to a single `job: JobView | null`**

In `download-view.tsx`:
- Change the props interface: replace `progress`, `trackPaused`, `onRunningChange` with `job: JobView | null` (import the `JobView` type — export it from `app.tsx` or a small `job-view.ts`). Derive `progress = job?.progress ?? null` and `trackPaused = job?.trackPaused ?? {}`.
- The "compose / stage / start" flow runs when `job === null` (the "+ New" rail entry is selected). When `job !== null`, render that job's track list + transport (the existing track-list branch at lines ~344–393), addressing controls by `job.meta.jobId`.
- `onStart` now receives the `jobId` returned by `startDownload`:

```tsx
const start = async (): Promise<void> => {
  if (!staged || staged.entries.length === 0) return
  const jobId = await window.plucker.startDownload({
    url: staged.url,
    title: staged.title,
    kind: staged.kind,
    entries: staged.entries,
    folderOverride: staged.folderOverride
  })
  onStart(jobId)
  setStaged(null)
}
```

- Track-row context-menu actions (skip/pause/resume) now pass `job.meta.jobId`:
  `window.plucker.skipTrack(job.meta.jobId, tr.index)`, etc.

- [ ] **Step 3: `transport-deck.tsx` takes a `jobId`**

Change its props to include `jobId: string` and route the deck's pause/resume/cancel buttons to `window.plucker.pause(jobId)` / `resume(jobId)` / `cancel(jobId)`. Render the deck only when a running/paused job is selected (driven by the selected `JobView`).

- [ ] **Step 4: Update existing tests**

`transport-deck.test.tsx` builds a `JobProgress` and renders the deck — pass a `jobId` prop and assert the control calls include it (`expect(api.pause).toHaveBeenCalledWith('J1')`). Update `download-view` consumers/tests accordingly.

- [ ] **Step 5: Typecheck + tests**

Run: `pnpm run typecheck && pnpm test`
Expected: PASS. Resolve prop/type mismatches from the single-job → job-map migration.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src
git commit -m "feat(renderer): master-detail multi-job download view"
```

---

## Phase 11 — Settings copy + final verification

### Task 14: Update the unified-setting description + rail strings

**Files:**
- Modify: `src/renderer/src/i18n/locales/en.ts`, `src/renderer/src/i18n/locales/de.ts`

- [ ] **Step 1: Update the parallel-downloads description and add rail keys**

In `en.ts`:

```ts
      parallel: 'Parallel downloads',
      parallelDesc: 'How many tracks to pluck at once across all jobs (1–16)',
```

Add a `jobs` block (sibling to other top-level i18n groups):

```ts
    jobs: {
      new: '+ New',
      cancel: 'Cancel',
      state: { running: 'Running', paused: 'Paused', queued: 'Queued' }
    },
```

Mirror the same keys in `de.ts` with German translations (match the tone of existing entries):

```ts
      parallel: 'Parallele Downloads',
      parallelDesc: 'Wie viele Titel gleichzeitig über alle Aufträge geladen werden (1–16)',
    jobs: {
      new: '+ Neu',
      cancel: 'Abbrechen',
      state: { running: 'Läuft', paused: 'Pausiert', queued: 'Warteschlange' }
    },
```

- [ ] **Step 2: Run the full suite + typecheck**

Run: `pnpm run typecheck && pnpm test && pnpm run lint`
Expected: PASS across the board.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/i18n
git commit -m "feat(i18n): unified parallel-downloads copy and job rail strings"
```

---

### Task 15: Manual end-to-end verification

**Files:** none (runtime check)

- [ ] **Step 1: Build + launch**

Run: `pnpm run build && pnpm start`

- [ ] **Step 2: Verify concurrency + isolation by observation**

- Set "Parallel downloads" to 2. Start three playlist jobs. Confirm: two run, one queues in the rail; the queued one starts when a running one finishes.
- Select each running job; confirm its track list + transport are independent, and pause/skip act only on the selected job.
- Confirm the window stays responsive (drag, switch views) while jobs run — the jank goal.
- Force a worker fault (e.g. point ffmpeg at a missing binary for one job): confirm that job records a failed history entry and the app + other jobs survive — the isolation goal.
- Set parallel to 4 with one job running; confirm it uses all 4 track slots (full single-playlist speed).

- [ ] **Step 3: If all pass, final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "fix(jobs): post-verification adjustments"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** self-contained worker (Tasks 6–7), inline analyze/media (Task 6), unified `parallel` budget + `distribute` (Tasks 1, 8) + `setLimit` rebalance (Tasks 2–3, 6, 8), bounded pool + queue (Task 8), `jobId` IPC/preload (Tasks 10–11), master-detail UI (Tasks 12–13), sole-writer history fold in main (Task 9), crash isolation via worker exit→error (Tasks 5, 8–9), resume/retransform/retry through the pool (Task 10), settings copy (Task 14), build/bundle check (Task 7), manual E2E (Task 15). `job:resolve` stays on the main thread (Task 10, Step 3). Idle-eviction and cache-locking intentionally omitted per spec.
- **Type consistency:** `JobMeta`/`JobState`/`JobKind` live in `shared/types.ts` (Task 11 Step 2) and are imported by protocol/preload/renderer. `JobStartPayload` carries `cookieFile` (Task 10 Step 1). `createPool` returns `setLimit` (Task 2) used by `runPipeline` (Task 3) and the worker (Task 6). `JobClient` method names match between `job-client.ts`, `job-host.ts`, `job-pool.ts`, and the pool test.
- **Known adaptation points flagged inline:** the real `log.ts` signature for `setLogSink` (Task 6 Step 2 / Task 9 Step 2), the actual `metaCacheDir()` extraction (Task 9 Step 1), electron-vite worker registration (Task 7 Step 1), and the renderer's real Tailwind tokens (Task 12 Step 4). These require reading the current file before editing — the steps say so explicitly rather than guessing exact lines.
