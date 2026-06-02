# Resume Interrupted Jobs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a durable per-job checkpoint so a download job interrupted by crash, clean quit, or user cancel can be resumed (skipping completed tracks), and so failed tracks in a finished job can be retried.

**Architecture:** A new `~/.plucker/jobs/<jobId>.json` checkpoint file is written at resolve time and patched as each track settles. The pipeline gains a tiny optional `checkpoint` sink (begin + settle). On clean completion `index.ts` deletes the checkpoint; on cancel/quit it keeps it and writes an `interrupted` history entry; on next launch any surviving checkpoint is surfaced as a resumable job (banner + History affordance). Resume and retry-failed both reuse the existing `runPipeline` engine over a re-download source built from the checkpoint / failed tracks.

**Tech Stack:** Electron (main + preload + React renderer), TypeScript, Vitest, pnpm. yt-dlp via `runYtDlp`.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/shared/types.ts` | Add `JobCheckpoint`, `CheckpointEntry`; extend `JobOutcome` with `interrupted`; add `HistoryEntry.jobId?` |
| `src/main/job-checkpoint.ts` (+ `.test.ts`) | Pure checkpoint store: paths, atomic write, read/list/delete, upsert helpers, the `JobCheckpointSink` interface + `createCheckpointSink` |
| `src/main/resume-merge.ts` (+ `.test.ts`) | Pure helpers: verify done entries against disk, partition checkpoint into completed/pending, merge completed + resumed tracks into a final `HistoryTrack[]`, synthesize an interrupted `HistoryEntry` from a checkpoint |
| `src/main/download-source.ts` (+ `.test.ts`) | Extract the per-entry yt-dlp `provide` from `pipeline.ts` into a reusable `makeDownloadProvide`; add `buildResumeSource` |
| `src/main/pipeline.ts` | Add optional `checkpoint` to `RunJobDeps`; call `begin` after resolve and `settle` when a track first goes terminal; consume `makeDownloadProvide` |
| `src/main/index.ts` | Wire checkpoint sink into `job:start`; new IPC `jobs:listInterrupted` / `jobs:resume` / `jobs:discard` / `jobs:retryFailed`; startup synthesis + emit; mark interrupted on cancel/quit |
| `src/preload/index.ts` (+ `index.d.ts`) | Expose the new IPC channels |
| `src/renderer/src/resume-banner.tsx` (+ `.test.tsx`) | Startup banner component |
| `src/renderer/src/app.tsx` | Render the banner; load interrupted jobs on mount |
| `src/renderer/src/history-view.tsx` | `interrupted` badge + Resume button; `partial` Retry-failed button |
| `src/renderer/src/i18n/*` | Strings for banner / badges / buttons |

**Note vs. the design doc:** the resume *source* lists only the entries that still need work (done-verified tracks are excluded), and `index.ts` merges the previously-completed checkpoint tracks back into the final history entry. This avoids adding a "skip already-done" branch inside the pipeline while producing the same result.

---

## Task 1: Shared types

**Files:**
- Modify: `src/shared/types.ts` (around lines 180–218)

- [ ] **Step 1: Extend `JobOutcome` and add checkpoint types**

In `src/shared/types.ts`, change the `JobOutcome` union (currently line 203) and add the new types + `jobId` field:

```ts
/** Overall outcome of a recorded job, driving the history entry badge. */
export type JobOutcome = 'completed' | 'partial' | 'failed' | 'cancelled' | 'interrupted'
```

Add after the `HistoryEntry` interface:

```ts
/** One entry in a durable job checkpoint (mirrors a track's lifecycle). */
export interface CheckpointEntry {
  index: number
  /** Source video id, used to rebuild the per-track download URL on resume. */
  videoId?: string
  title: string
  status: TrackStatus
  /** Rich record once the track is terminal (carried into the resumed history entry). */
  track?: HistoryTrack
}

/** A durable, resumable snapshot of an in-progress job. One file per active job. */
export interface JobCheckpoint {
  jobId: string
  version: 1
  url: string
  folder: string
  jobTitle: string
  kind: 'playlist' | 'video'
  startedAt: number
  updatedAt: number
  total: number
  entries: CheckpointEntry[]
}
```

Add `jobId` to `HistoryEntry` (after `id`):

```ts
  id: string
  /** Links this entry to its checkpoint file when the job was interrupted/resumable. */
  jobId?: string
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no usages yet; pure additive change).

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add job checkpoint types and interrupted outcome"
```

---

## Task 2: Checkpoint store (`job-checkpoint.ts`)

**Files:**
- Create: `src/main/job-checkpoint.ts`
- Test: `src/main/job-checkpoint.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/job-checkpoint.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  upsertEntries,
  settleEntry,
  writeCheckpoint,
  readCheckpoint,
  listCheckpoints,
  deleteCheckpoint
} from './job-checkpoint'
import type { JobCheckpoint } from '../shared/types'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plk-jobs-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const base = (over: Partial<JobCheckpoint> = {}): JobCheckpoint => ({
  jobId: 'job1',
  version: 1,
  url: 'http://x',
  folder: '/out',
  jobTitle: 'Mix',
  kind: 'playlist',
  startedAt: 1,
  updatedAt: 1,
  total: 2,
  entries: [
    { index: 1, videoId: 'a', title: 'A', status: 'queued' },
    { index: 2, videoId: 'b', title: 'B', status: 'queued' }
  ],
  ...over
})

describe('checkpoint store', () => {
  it('writes and reads a checkpoint round-trip', () => {
    writeCheckpoint(dir, base(), 5)
    const got = readCheckpoint(join(dir, 'job1.json'))
    expect(got?.jobId).toBe('job1')
    expect(got?.updatedAt).toBe(5)
    expect(got?.entries).toHaveLength(2)
  })

  it('lists every checkpoint file and tolerates a corrupt one', () => {
    writeCheckpoint(dir, base(), 1)
    writeCheckpoint(dir, base({ jobId: 'job2' }), 1)
    writeFileSync(join(dir, 'job3.json'), '{not json')
    const all = listCheckpoints(dir)
    expect(all.map((c) => c.jobId).sort()).toEqual(['job1', 'job2'])
  })

  it('deletes a checkpoint file', () => {
    writeCheckpoint(dir, base(), 1)
    deleteCheckpoint(dir, 'job1')
    expect(existsSync(join(dir, 'job1.json'))).toBe(false)
  })

  it('upsertEntries merges by index without dropping existing completed entries', () => {
    const cp = base()
    cp.entries[0] = { index: 1, videoId: 'a', title: 'A', status: 'done' }
    const merged = upsertEntries(cp.entries, [
      { index: 2, videoId: 'b', title: 'B (resumed)', status: 'queued' },
      { index: 3, videoId: 'c', title: 'C', status: 'queued' }
    ])
    expect(merged.find((e) => e.index === 1)?.status).toBe('done')
    expect(merged.find((e) => e.index === 2)?.title).toBe('B (resumed)')
    expect(merged.find((e) => e.index === 3)).toBeTruthy()
  })

  it('settleEntry patches one entry status + track by index', () => {
    const entries = base().entries
    const next = settleEntry(entries, {
      index: 2,
      videoId: 'b',
      title: 'B',
      status: 'done',
      track: { title: 'B', status: 'done', file: '/out/B.mp3' }
    })
    expect(next.find((e) => e.index === 2)?.status).toBe('done')
    expect(next.find((e) => e.index === 2)?.track?.file).toBe('/out/B.mp3')
    expect(next.find((e) => e.index === 1)?.status).toBe('queued')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm vitest run src/main/job-checkpoint.test.ts`
Expected: FAIL — `job-checkpoint` module not found.

- [ ] **Step 3: Implement `job-checkpoint.ts`**

Create `src/main/job-checkpoint.ts`:

```ts
import {
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  mkdirSync,
  readdirSync,
  existsSync
} from 'node:fs'
import { join } from 'node:path'
import type { CheckpointEntry, JobCheckpoint } from '../shared/types'

/** Patch/insert each `incoming` entry into `existing` by index, preserving the rest. */
export function upsertEntries(
  existing: CheckpointEntry[],
  incoming: CheckpointEntry[]
): CheckpointEntry[] {
  const byIndex = new Map(existing.map((e) => [e.index, e]))
  for (const e of incoming) byIndex.set(e.index, { ...byIndex.get(e.index), ...e })
  return [...byIndex.values()].sort((a, b) => a.index - b.index)
}

/** Replace the entry at `entry.index` (used when a track first reaches a terminal status). */
export function settleEntry(
  entries: CheckpointEntry[],
  entry: CheckpointEntry
): CheckpointEntry[] {
  return entries.map((e) => (e.index === entry.index ? { ...e, ...entry } : e))
}

/** Atomically write a checkpoint into `dir`, stamping `updatedAt` (caller supplies the clock). */
export function writeCheckpoint(dir: string, cp: JobCheckpoint, now: number): void {
  mkdirSync(dir, { recursive: true })
  const target = join(dir, `${cp.jobId}.json`)
  const tmp = `${target}.tmp`
  writeFileSync(tmp, JSON.stringify({ ...cp, updatedAt: now }, null, 2))
  renameSync(tmp, target)
}

/** Read one checkpoint file; returns null on a missing or unparseable file. */
export function readCheckpoint(path: string): JobCheckpoint | null {
  if (!existsSync(path)) return null
  try {
    const cp = JSON.parse(readFileSync(path, 'utf8')) as JobCheckpoint
    return cp && cp.jobId ? cp : null
  } catch {
    return null
  }
}

/** Every readable checkpoint in `dir` (corrupt files are skipped, never thrown). */
export function listCheckpoints(dir: string): JobCheckpoint[] {
  if (!existsSync(dir)) return []
  const out: JobCheckpoint[] = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json') || name.endsWith('.tmp')) continue
    const cp = readCheckpoint(join(dir, name))
    if (cp) out.push(cp)
  }
  return out
}

/** Delete a checkpoint file by id (no-op if absent). */
export function deleteCheckpoint(dir: string, jobId: string): void {
  rmSync(join(dir, `${jobId}.json`), { force: true })
}

/** Patch operations the pipeline calls during a run to keep the checkpoint live. */
export interface JobCheckpointSink {
  /** Called once after resolve with the initial (all-queued) entries + job meta. */
  begin(info: {
    url: string
    folder: string
    jobTitle: string
    kind: 'playlist' | 'video'
    entries: CheckpointEntry[]
  }): void
  /** Called when a track first reaches a terminal status. */
  settle(entry: CheckpointEntry): void
}

/**
 * Build a sink bound to one `jobId` + checkpoint `dir`. `begin` upserts (so a resume
 * run keeps the already-completed entries already on disk); `settle` patches one entry.
 * `now()` is injected so the pipeline never calls Date.now() itself.
 */
export function createCheckpointSink(
  dir: string,
  jobId: string,
  now: () => number
): JobCheckpointSink {
  return {
    begin(info) {
      const prev = readCheckpoint(join(dir, `${jobId}.json`))
      const entries = prev ? upsertEntries(prev.entries, info.entries) : info.entries
      const cp: JobCheckpoint = {
        jobId,
        version: 1,
        url: info.url,
        folder: info.folder,
        jobTitle: info.jobTitle,
        kind: info.kind,
        startedAt: prev?.startedAt ?? now(),
        updatedAt: now(),
        total: prev?.total ?? entries.length,
        entries
      }
      writeCheckpoint(dir, cp, now())
    },
    settle(entry) {
      const cp = readCheckpoint(join(dir, `${jobId}.json`))
      if (!cp) return
      writeCheckpoint(dir, { ...cp, entries: settleEntry(cp.entries, entry) }, now())
    }
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm vitest run src/main/job-checkpoint.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/job-checkpoint.ts src/main/job-checkpoint.test.ts
git commit -m "feat(main): add durable per-job checkpoint store"
```

---

## Task 3: Resume/merge helpers (`resume-merge.ts`)

**Files:**
- Create: `src/main/resume-merge.ts`
- Test: `src/main/resume-merge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/resume-merge.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { partitionCheckpoint, mergeResumed, synthesizeEntry } from './resume-merge'
import type { JobCheckpoint, HistoryTrack } from '../shared/types'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plk-resume-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const cp = (entries: JobCheckpoint['entries']): JobCheckpoint => ({
  jobId: 'j',
  version: 1,
  url: 'http://x',
  folder: dir,
  jobTitle: 'Mix',
  kind: 'playlist',
  startedAt: 1,
  updatedAt: 1,
  total: entries.length,
  entries
})

describe('partitionCheckpoint', () => {
  it('keeps a done track whose file still exists as completed', () => {
    const file = join(dir, 'A.mp3')
    writeFileSync(file, 'x')
    const { completed, pending } = partitionCheckpoint(
      cp([{ index: 1, title: 'A', status: 'done', track: { title: 'A', status: 'done', file } }])
    )
    expect(completed).toHaveLength(1)
    expect(pending).toHaveLength(0)
  })

  it('re-queues a done track whose file was deleted', () => {
    const { completed, pending } = partitionCheckpoint(
      cp([
        {
          index: 1,
          title: 'A',
          status: 'done',
          track: { title: 'A', status: 'done', file: join(dir, 'gone.mp3') }
        }
      ])
    )
    expect(completed).toHaveLength(0)
    expect(pending.map((p) => p.index)).toEqual([1])
  })

  it('treats skipped as completed and queued/failed/cancelled as pending', () => {
    const { completed, pending } = partitionCheckpoint(
      cp([
        { index: 1, title: 'A', status: 'skipped', track: { title: 'A', status: 'skipped' } },
        { index: 2, title: 'B', status: 'queued' },
        { index: 3, title: 'C', status: 'failed' },
        { index: 4, title: 'D', status: 'cancelled' }
      ])
    )
    expect(completed.map((c) => c.index)).toEqual([1])
    expect(pending.map((p) => p.index)).toEqual([2, 3, 4])
  })
})

describe('mergeResumed', () => {
  it('orders completed + resumed tracks by original index', () => {
    const completed = [{ index: 1, track: { title: 'A', status: 'done' } as HistoryTrack }]
    const resumed = [
      { index: 3, track: { title: 'C', status: 'done' } as HistoryTrack },
      { index: 2, track: { title: 'B', status: 'failed' } as HistoryTrack }
    ]
    const merged = mergeResumed(completed, resumed)
    expect(merged.map((t) => t.title)).toEqual(['A', 'B', 'C'])
  })
})

describe('synthesizeEntry', () => {
  it('builds an interrupted history entry carrying the jobId', () => {
    const entry = synthesizeEntry(
      cp([
        { index: 1, title: 'A', status: 'done', track: { title: 'A', status: 'done' } },
        { index: 2, title: 'B', status: 'queued' }
      ]),
      'hist-1',
      '2026-06-02T00:00:00.000Z'
    )
    expect(entry.outcome).toBe('interrupted')
    expect(entry.jobId).toBe('j')
    expect(entry.id).toBe('hist-1')
    // queued (non-terminal) tracks are recorded as cancelled so the row renders.
    expect(entry.tracks.map((t) => t.status)).toEqual(['done', 'cancelled'])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm vitest run src/main/resume-merge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `resume-merge.ts`**

Create `src/main/resume-merge.ts`:

```ts
import { existsSync } from 'node:fs'
import type { CheckpointEntry, HistoryEntry, HistoryTrack, JobCheckpoint } from '../shared/types'

/** A track carried into the final merged history, tagged with its original index. */
export interface IndexedTrack {
  index: number
  track: HistoryTrack
}

/**
 * Split a checkpoint into work already complete vs. work still to do.
 * `done` counts as complete only if its file is still on disk; `skipped` is always
 * complete; everything else (queued/downloading/transforming/failed/cancelled) is pending.
 */
export function partitionCheckpoint(cp: JobCheckpoint): {
  completed: IndexedTrack[]
  pending: CheckpointEntry[]
} {
  const completed: IndexedTrack[] = []
  const pending: CheckpointEntry[] = []
  for (const e of cp.entries) {
    if (e.status === 'skipped' && e.track) {
      completed.push({ index: e.index, track: e.track })
    } else if (e.status === 'done' && e.track?.file && existsSync(e.track.file)) {
      completed.push({ index: e.index, track: e.track })
    } else {
      pending.push(e)
    }
  }
  return { completed, pending }
}

/** Merge already-complete tracks with freshly-resumed ones, ordered by original index. */
export function mergeResumed(completed: IndexedTrack[], resumed: IndexedTrack[]): HistoryTrack[] {
  return [...completed, ...resumed].sort((a, b) => a.index - b.index).map((t) => t.track)
}

/** Job outcome from a merged track list (no cancellation context — resume completed). */
export function outcomeFromTracks(tracks: HistoryTrack[]): HistoryEntry['outcome'] {
  const failed = tracks.filter((t) => t.status === 'failed').length
  const done = tracks.filter((t) => t.status === 'done').length
  if (failed === 0) return 'completed'
  if (done === 0) return 'failed'
  return 'partial'
}

/**
 * Build an `interrupted` history entry from a surviving checkpoint (crash recovery):
 * completed tracks keep their record; non-terminal tracks are shown as `cancelled` so
 * the row still renders. `id` is the caller-supplied history id; `completedAt` is an
 * injected ISO timestamp.
 */
export function synthesizeEntry(
  cp: JobCheckpoint,
  id: string,
  completedAt: string
): HistoryEntry {
  const tracks: HistoryTrack[] = cp.entries.map(
    (e) =>
      e.track ?? {
        title: e.title,
        status:
          e.status === 'failed' || e.status === 'skipped' || e.status === 'cancelled'
            ? e.status
            : 'cancelled',
        videoId: e.videoId
      }
  )
  return {
    id,
    jobId: cp.jobId,
    url: cp.url,
    title: cp.jobTitle,
    folder: cp.folder,
    kind: cp.kind,
    completedAt,
    outcome: 'interrupted',
    tracks
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm vitest run src/main/resume-merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/resume-merge.ts src/main/resume-merge.test.ts
git commit -m "feat(main): add resume partition/merge/synthesize helpers"
```

---

## Task 4: Extract reusable download source + `buildResumeSource`

**Files:**
- Create: `src/main/download-source.ts`
- Test: `src/main/download-source.test.ts`
- Modify: `src/main/pipeline.ts` (consume the extracted helper)

The per-entry download `provide` currently lives inline in `buildDownloadSource` (`pipeline.ts:697–754`). Extract it so both the fresh-download source and the resume/retry source share one yt-dlp acquire path.

- [ ] **Step 1: Write the failing test**

Create `src/main/download-source.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildResumeSource } from './download-source'
import type { CheckpointEntry } from '../shared/types'

describe('buildResumeSource', () => {
  it('resolves from stored meta without any network call', async () => {
    const pending: CheckpointEntry[] = [{ index: 2, videoId: 'vid2', title: 'Two', status: 'queued' }]
    const src = buildResumeSource(
      { url: 'http://list', folder: '/out', jobTitle: 'Mix', kind: 'playlist' },
      pending,
      // minimal deps stub: provide() is not exercised in this test
      { bin: { ytdlp: 'yt', ffmpeg: 'ff' } } as never
    )
    const meta = await src.resolve()
    expect(meta).toEqual({ title: 'Mix', kind: 'playlist', url: 'http://list' })
    const entries = src.entries()
    expect(entries.map((e) => e.index)).toEqual([2])
    expect(entries[0].destFolder).toBe('/out')
    expect(entries[0].videoId).toBe('vid2')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm vitest run src/main/download-source.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `download-source.ts`**

Create `src/main/download-source.ts`. `makeDownloadProvide` is copied verbatim from the inline `provide` body in `pipeline.ts:697–754` (kept identical — only relocated):

```ts
import type { JobSource, ProvideOutcome, RunJobDeps, SourceEntry } from './pipeline'
import { classifyDownload } from './pipeline'
import { buildDownloadArgs, runYtDlp, priorityToNice, type ProgressEvent } from './ytdlp'
import type { TrackProgress } from '../shared/types'
import { watchUrl } from '../shared/youtube-url'
import { log } from './log'

/**
 * Acquire one entry's audio file via yt-dlp. Shared by the fresh-download source and
 * the resume/retry source so both use one identical download path. `entryUrl` is the
 * page URL to fetch; `destFolder` is where the file lands; `cookieFile` (optional) is
 * an exported cookie jar from a prior escalation.
 */
export function makeDownloadProvide(
  deps: RunJobDeps,
  entryUrl: string,
  destFolder: string,
  cookieFile?: string
): SourceEntry['provide'] {
  const { bin, settings } = deps
  return async function provide(
    t: TrackProgress,
    report: () => void,
    sig?: AbortSignal
  ): Promise<ProvideOutcome> {
    let downloaded: string | null = null
    const onProgress = (ev: ProgressEvent): void => {
      if (t.status === 'queued' || t.status === 'downloading') {
        t.status = 'downloading'
        t.stage = 'downloading'
        t.percent = ev.percent
        t.speedBytesPerSec = ev.speedBytesPerSec
        if (ev.title) t.title = ev.title
      }
      report()
    }
    const args = buildDownloadArgs({
      url: entryUrl,
      destFolder,
      settings,
      ffmpegPath: bin.ffmpeg,
      singleVideo: true,
      cookieFile
    })
    if (t.status === 'queued') {
      t.status = 'downloading'
      t.stage = 'downloading'
      log.info('yt-dlp', `downloading "${t.title}"`)
      report()
    }
    const dl = await runYtDlp(
      bin.ytdlp,
      args,
      onProgress,
      (f) => {
        downloaded = f
      },
      sig,
      priorityToNice(settings.performance.priority)
    )
    const outcome = classifyDownload(downloaded, dl, settings.audio.minBitrate)
    if (outcome.kind === 'skipped') {
      log.info(
        'yt-dlp',
        `skipped "${t.title}" — no source audio at/above ${settings.audio.minBitrate} kbps`
      )
      return { kind: 'skipped', reason: outcome.reason }
    }
    if (outcome.kind === 'failed') {
      log.warn('yt-dlp', `download failed for "${t.title}": ${outcome.reason}`)
      log.error('yt-dlp', `download result for "${t.title}":`, dl)
      return {
        kind: 'failed',
        reason: outcome.reason,
        errorCode: dl.code ? `yt-dlp ${dl.code}` : undefined
      }
    }
    return { kind: 'file', file: outcome.file }
  }
}

/** Minimal entry shape the resume/retry source needs (a subset of CheckpointEntry). */
export interface ResumeEntry {
  index: number
  videoId?: string
  title: string
}

/**
 * A {@link JobSource} that re-downloads a fixed list of entries into an existing
 * folder, without re-resolving the playlist. Used by both resume and retry-failed.
 * Each entry's page URL is rebuilt from its videoId (the original flat-playlist URL
 * is not retained across a crash).
 */
export function buildResumeSource(
  meta: { url: string; folder: string; jobTitle: string; kind: 'playlist' | 'video' },
  pending: ResumeEntry[],
  deps: RunJobDeps
): JobSource {
  const entries: SourceEntry[] = pending.map((e) => ({
    index: e.index,
    title: e.title,
    videoId: e.videoId,
    destFolder: meta.folder,
    provide: makeDownloadProvide(
      deps,
      e.videoId ? watchUrl(e.videoId) : meta.url,
      meta.folder
    )
  }))
  return {
    resolve: async () => ({ title: meta.jobTitle, kind: meta.kind, url: meta.url }),
    entries: () => entries
  }
}
```

- [ ] **Step 4: Refactor `pipeline.ts` to use `makeDownloadProvide`**

In `src/main/pipeline.ts`, add the import near the other local imports (after line 35):

```ts
import { makeDownloadProvide } from './download-source'
```

Replace the inline `provide` (the `async provide(t, report, sig) { … }` block at lines 697–754) inside `buildDownloadSource`'s `entries()` map so each returned entry uses the shared helper:

```ts
      return resolvedJob.entries.map((e) => ({
        index: e.index,
        title: e.title,
        videoId: e.videoId,
        destFolder: dest,
        provide: makeDownloadProvide(deps, entryUrl(e), dest, cookieFile)
      }))
```

(Remove the now-unused `ProgressEvent` import from `pipeline.ts` only if nothing else in the file references it — `buildDownloadArgs`/`runYtDlp`/`priorityToNice` may now be unused there too; delete any that the typecheck flags as unused.)

- [ ] **Step 5: Run the tests + typecheck**

Run: `pnpm vitest run src/main/download-source.test.ts && pnpm typecheck`
Expected: PASS. (`download-source.ts` imports types/`classifyDownload` from `pipeline.ts`; `pipeline.ts` imports `makeDownloadProvide` from `download-source.ts` — a value/type import cycle that is safe because `makeDownloadProvide` is only *called* at runtime, not at module top level.)

- [ ] **Step 6: Run the full main test suite to confirm no regression**

Run: `pnpm vitest run src/main`
Expected: PASS (existing pipeline tests still green).

- [ ] **Step 7: Commit**

```bash
git add src/main/download-source.ts src/main/download-source.test.ts src/main/pipeline.ts
git commit -m "refactor(pipeline): extract reusable download source + resume source"
```

---

## Task 5: Wire the checkpoint sink into the pipeline

**Files:**
- Modify: `src/main/pipeline.ts`
- Test: `src/main/pipeline-checkpoint.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/pipeline-checkpoint.test.ts`. It drives `runPipeline` with a fake one-entry source and a recording sink, asserting `begin` fires once and `settle` fires once when the track goes terminal:

```ts
import { describe, it, expect } from 'vitest'
import { runPipeline, type JobSource, type RunJobDeps } from './pipeline'
import type { CheckpointEntry } from '../shared/types'
import { defaultSettings } from './defaults'

function fakeSource(): JobSource {
  return {
    resolve: async () => ({ title: 'Mix', kind: 'playlist', url: 'http://list' }),
    entries: () => [
      {
        index: 1,
        title: 'A',
        videoId: 'a',
        destFolder: '/tmp/plk-test-out',
        provide: async () => ({ kind: 'skipped', reason: 'below minimum quality' })
      }
    ]
  }
}

describe('runPipeline checkpoint sink', () => {
  it('calls begin once and settle once when a track goes terminal', async () => {
    const begins: unknown[] = []
    const settles: CheckpointEntry[] = []
    const deps = {
      bin: { ytdlp: 'yt', ffmpeg: 'ff' },
      settings: { ...defaultSettings(), transforms: [], performance: { ...defaultSettings().performance, parallel: 1 } },
      homeBase: '/tmp',
      onProgress: () => {},
      checkpoint: {
        begin: (i) => begins.push(i),
        settle: (e) => settles.push(e)
      }
    } as unknown as RunJobDeps

    const res = await runPipeline(fakeSource(), deps)
    expect(begins).toHaveLength(1)
    expect(settles).toHaveLength(1)
    expect(settles[0].index).toBe(1)
    expect(settles[0].status).toBe('skipped')
    expect(res.tracks[0].status).toBe('skipped')
  })
})
```

> If `defaultSettings`/`defaults` is named differently, import the real settings factory used elsewhere in `src/main` (check `src/main/defaults.ts`). The test only needs `transforms: []`, `performance.parallel: 1`, and `audio.minBitrate` set.

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm vitest run src/main/pipeline-checkpoint.test.ts`
Expected: FAIL — `checkpoint` not on `RunJobDeps` / `begin`/`settle` never called.

- [ ] **Step 3: Add `checkpoint` to `RunJobDeps`**

In `src/main/pipeline.ts`, import the sink type and extend `RunJobDeps` (after line 187, the `media?` field):

```ts
import type { JobCheckpointSink } from './job-checkpoint'
```

```ts
  /** Off-thread media I/O (ID3 tags + audio hashing); keeps the main thread free. */
  media?: OffThreadMedia
  /** Durable resume checkpoint; persists per-track terminal state during the run. */
  checkpoint?: JobCheckpointSink
```

- [ ] **Step 4: Emit `begin` + `settle` from `runPipeline`**

In `runPipeline`, immediately after the `tracks` array is built (after line 369) and **before** the first `emit()`:

```ts
    deps.checkpoint?.begin({
      url: resolved.url,
      folder: repFolder,
      jobTitle: resolved.title,
      kind: resolved.kind,
      entries: tracks.map((t) => ({
        index: t.index,
        videoId: t.videoId,
        title: t.title,
        status: t.status
      }))
    })
```

Add a deferred post-emit hook. Change the `emit` definition (lines 373–382) to call an assignable hook at the end:

```ts
    let afterEmit: () => void = () => {}
    const emit = (): void => {
      onProgress({
        jobTitle: resolved.title,
        total: tracks.length,
        tracks: [...tracks],
        folder: repFolder,
        url: resolved.url,
        overall: overall()
      })
      afterEmit()
    }
```

Then, after `historyByIndex` is declared (after line 406), define the flush and wire it:

```ts
    // Persist each track to the checkpoint the first time it reaches a terminal
    // status, so a crash mid-run leaves a resumable record. Driven off emit() (which
    // fires after every state change) and de-duped via `settledIndices`.
    const settledIndices = new Set<number>()
    const TERMINAL_FOR_CHECKPOINT: ReadonlySet<TrackProgress['status']> = new Set([
      'done',
      'failed',
      'skipped',
      'cancelled'
    ])
    const flushCheckpoint = (): void => {
      if (!deps.checkpoint) return
      for (const t of tracks) {
        if (!TERMINAL_FOR_CHECKPOINT.has(t.status) || settledIndices.has(t.index)) continue
        settledIndices.add(t.index)
        deps.checkpoint.settle({
          index: t.index,
          videoId: t.videoId,
          title: t.title,
          status: t.status,
          track: historyByIndex[t.index - 1] ?? {
            title: t.title,
            status: (t.status === 'failed' ||
            t.status === 'skipped' ||
            t.status === 'cancelled'
              ? t.status
              : 'failed') as HistoryTrack['status'],
            reason: t.reason,
            errorCode: t.errorCode,
            videoId: t.videoId
          }
        })
      }
    }
    afterEmit = flushCheckpoint
```

(The first `emit()` at line 382 runs before `afterEmit` is reassigned, so it harmlessly hits the no-op; no terminal transitions happen before the pools start.)

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pnpm vitest run src/main/pipeline-checkpoint.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full main suite + typecheck**

Run: `pnpm vitest run src/main && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/pipeline.ts src/main/pipeline-checkpoint.test.ts
git commit -m "feat(pipeline): persist per-track checkpoint during a job"
```

---

## Task 6: Main-process orchestration (`index.ts`)

**Files:**
- Modify: `src/main/index.ts`

This task has no new unit test (it's Electron IPC glue); it is verified by typecheck + the build, and exercised end-to-end in Task 9. Each step shows exact code.

- [ ] **Step 1: Add imports + the jobs dir helper**

At the top of `src/main/index.ts`, add to the imports:

```ts
import {
  createCheckpointSink,
  listCheckpoints,
  deleteCheckpoint,
  readCheckpoint
} from './job-checkpoint'
import { buildResumeSource } from './download-source'
import { partitionCheckpoint, mergeResumed, outcomeFromTracks, synthesizeEntry } from './resume-merge'
import type { JobCheckpoint } from '../shared/types'
```

Add a helper next to `windowStatePath()` (near line 373):

```ts
/** Directory holding per-job resume checkpoints. */
function jobsDir(): string {
  return join(pluckerDir(), 'jobs')
}
```

- [ ] **Step 2: Track the active jobId and pass a checkpoint sink in `job:start`**

Add a module-level variable beside `abort` (search for `let abort`):

```ts
let activeJobId: string | null = null
```

In the `job:start` handler (line 227), after `abort = new AbortController()` add:

```ts
    activeJobId = randomUUID()
    const sink = createCheckpointSink(jobsDir(), activeJobId, () => Date.now())
```

Add `checkpoint: sink` to the `runJob(url, { … })` deps object (alongside `cache`, `analyze`, `media`).

- [ ] **Step 3: On clean completion, attach jobId + delete the checkpoint; on cancel keep it as interrupted**

Replace the success-path history write (lines 257–269) with:

```ts
      const cancelled = abort?.signal.aborted ?? false
      const entry: HistoryEntry = {
        id: randomUUID(),
        jobId: activeJobId ?? undefined,
        url: result.url,
        title: result.title,
        folder: result.folder,
        kind: result.kind,
        completedAt: new Date().toISOString(),
        outcome: cancelled ? 'interrupted' : result.outcome,
        tracks: result.tracks
      }
      const fresh = loadSettings()
      saveSettings(settingsPath(), { ...fresh, history: addEntry(fresh.history, entry) })
      getWindow()?.webContents.send('history:changed')
      // A genuinely finished job has nothing to resume; a cancelled one keeps its
      // checkpoint so the user can pick it back up.
      if (!cancelled && activeJobId) deleteCheckpoint(jobsDir(), activeJobId)
      if (cancelled) getWindow()?.webContents.send('jobs:interruptedChanged')
      activeJobId = null
```

In the `catch` block (resolution failure, lines 270–301), leave the existing failed/cancelled history write but, after it, delete the checkpoint only when the job was **not** cancelled (a failed-to-resolve job produced no useful checkpoint either way — delete it to avoid a dangling file):

```ts
      if (activeJobId) deleteCheckpoint(jobsDir(), activeJobId)
      activeJobId = null
```

(Place this right before the `if (!cancelled) { … } else { … }` block.)

- [ ] **Step 4: Add the `jobs:*` IPC handlers**

Add inside `registerIpc` (next to the other `ipcMain.handle` calls, e.g. after `job:retransform`):

```ts
  ipcMain.handle('jobs:listInterrupted', () => listInterruptedSummaries())

  ipcMain.handle('jobs:discard', (_e, jobId: string) => {
    deleteCheckpoint(jobsDir(), jobId)
    return listInterruptedSummaries()
  })

  ipcMain.handle('jobs:resume', async (_e, jobId: string) => {
    const cp = readCheckpoint(join(jobsDir(), `${jobId}.json`))
    if (!cp) return
    await runResume(cp)
  })

  ipcMain.handle('jobs:retryFailed', async (_e, entryId: string) => {
    await runRetryFailed(entryId)
  })
```

- [ ] **Step 5: Implement the summary + resume + retry helpers**

Add these module-level functions (after `registerIpc`, before `createWindow`). They reuse `runPipeline` exactly like `job:retransform` does:

```ts
/** Compact per-checkpoint summary for the renderer (banner + History affordance). */
function listInterruptedSummaries(): {
  jobId: string
  title: string
  done: number
  total: number
}[] {
  return listCheckpoints(jobsDir()).map((cp) => ({
    jobId: cp.jobId,
    title: cp.jobTitle,
    done: cp.entries.filter((e) => e.status === 'done' || e.status === 'skipped').length,
    total: cp.total
  }))
}

/** Shared deps for a resume/retry run (mirrors job:start, minus folderOverride). */
function resumeDeps(settings: Settings, sink: ReturnType<typeof createCheckpointSink>): RunJobDeps {
  return {
    bin: currentBin(),
    settings,
    homeBase: expandHome(settings.downloads.baseFolder),
    cache: getMetaCache(),
    analyze: (file, config) =>
      getAnalyzeClient().analyze(file, config, currentBin().ffmpeg, abort?.signal),
    media: getMediaClient(),
    checkpoint: sink,
    onProgress: (p) => {
      const win = getWindow()
      win?.webContents.send('job:progress', p)
      win?.setProgressBar(p.overall > 0 && p.overall < 1 ? p.overall : p.overall >= 1 ? 1 : -1)
    },
    onStatus: (s) => getWindow()?.webContents.send('job:status', s),
    signal: abort?.signal
  }
}

/** Resume an interrupted job from its checkpoint: re-download only the pending tracks. */
async function runResume(cp: JobCheckpoint): Promise<void> {
  const settings = loadSettings()
  const { completed, pending } = partitionCheckpoint(cp)
  resumeAllChildren()
  getWindow()?.webContents.send('job:paused', false)
  abort = new AbortController()
  activeJobId = cp.jobId
  const sink = createCheckpointSink(jobsDir(), cp.jobId, () => Date.now())
  try {
    const result = await runPipeline(
      buildResumeSource(
        { url: cp.url, folder: cp.folder, jobTitle: cp.jobTitle, kind: cp.kind },
        pending.map((e) => ({ index: e.index, videoId: e.videoId, title: e.title })),
        resumeDeps(settings, sink)
      ),
      resumeDeps(settings, sink)
    )
    getWindow()?.setProgressBar(-1)
    const cancelled = abort?.signal.aborted ?? false
    const resumedIndexed = result.tracks.map((track, i) => ({ index: pending[i].index, track }))
    const merged = mergeResumed(completed, resumedIndexed)
    const fresh = loadSettings()
    const entry: HistoryEntry = {
      id: fresh.history.find((h) => h.jobId === cp.jobId)?.id ?? randomUUID(),
      jobId: cp.jobId,
      url: cp.url,
      title: cp.jobTitle,
      folder: cp.folder,
      kind: cp.kind,
      completedAt: new Date().toISOString(),
      outcome: cancelled ? 'interrupted' : outcomeFromTracks(merged),
      tracks: merged
    }
    saveSettings(settingsPath(), { ...fresh, history: addEntry(fresh.history, entry) })
    getWindow()?.webContents.send('history:changed')
    if (!cancelled) deleteCheckpoint(jobsDir(), cp.jobId)
    getWindow()?.webContents.send('jobs:interruptedChanged')
  } catch (err) {
    getWindow()?.setProgressBar(-1)
    const cancelled = abort?.signal.aborted ?? false
    if (!cancelled) {
      const message = err instanceof Error ? err.message : String(err)
      log.error('app', 'resume failed:', err)
      getWindow()?.webContents.send('job:status', { phase: 'error', error: message })
    }
  } finally {
    activeJobId = null
  }
}

/** Retry just the failed tracks of a finished history entry, merging results in place. */
async function runRetryFailed(entryId: string): Promise<void> {
  const settings = loadSettings()
  const src = settings.history.find((h) => h.id === entryId)
  if (!src) return
  const failed = src.tracks
    .map((t, index) => ({ t, index }))
    .filter(({ t }) => t.status === 'failed')
  if (failed.length === 0) return
  resumeAllChildren()
  getWindow()?.webContents.send('job:paused', false)
  abort = new AbortController()
  const noSink = { begin: () => {}, settle: () => {} }
  try {
    const result = await runPipeline(
      buildResumeSource(
        { url: src.url, folder: src.folder, jobTitle: src.title, kind: src.kind },
        failed.map(({ t, index }) => ({ index: index + 1, videoId: t.videoId, title: t.title })),
        { ...resumeDeps(settings, noSink), onStatus: undefined }
      ),
      { ...resumeDeps(settings, noSink), onStatus: undefined }
    )
    getWindow()?.setProgressBar(-1)
    const latest = loadSettings()
    let tracks = [...(latest.history.find((h) => h.id === entryId)?.tracks ?? src.tracks)]
    result.tracks.forEach((rt, i) => {
      const origIndex = failed[i].index
      if (rt.status === 'done') tracks[origIndex] = rt
    })
    const history = latest.history.map((h) =>
      h.id === entryId ? { ...h, tracks, outcome: outcomeFromTracks(tracks) } : h
    )
    saveSettings(settingsPath(), { ...latest, history })
    getWindow()?.webContents.send('history:changed')
  } catch (err) {
    getWindow()?.setProgressBar(-1)
    if (!(abort?.signal.aborted ?? false)) {
      log.error('app', 'retry-failed failed:', err)
    }
  }
}
```

> `resumeDeps` is called twice per run (once to build the source, once as the engine deps) — both share the same `sink` and `signal`, which is intentional and safe. If `RunJobDeps`/`Settings` are not already imported in `index.ts`, add them to the `../shared/types` / `./pipeline` imports.

- [ ] **Step 6: Synthesize interrupted history on startup + emit the banner list**

In `app.whenReady().then(() => { … })`, after `createWindow()` (line 486), add:

```ts
  // Crash recovery: any checkpoint that survived a crash has no (or a stale) history
  // entry. Synthesize an `interrupted` entry for it so it shows in History, then tell
  // the renderer to offer a resume banner once the window has loaded.
  recoverInterruptedJobs()
```

Add the function near the other helpers:

```ts
function recoverInterruptedJobs(): void {
  const checkpoints = listCheckpoints(jobsDir())
  if (checkpoints.length === 0) return
  const fresh = loadSettings()
  let history = fresh.history
  for (const cp of checkpoints) {
    if (history.some((h) => h.jobId === cp.jobId)) continue
    history = addEntry(history, synthesizeEntry(cp, randomUUID(), new Date().toISOString()))
  }
  if (history !== fresh.history) saveSettings(settingsPath(), { ...fresh, history })
  const win = mainWindow
  const push = (): void => {
    win?.webContents.send('history:changed')
    win?.webContents.send('jobs:interruptedChanged')
  }
  if (win?.webContents.isLoading()) win.webContents.once('did-finish-load', push)
  else push()
}
```

- [ ] **Step 7: Typecheck + build**

Run: `pnpm typecheck`
Expected: PASS. Fix any missing imports (`Settings`, `RunJobDeps`, `expandHome`, `pluckerDir`, `currentBin`, `getMetaCache`, `getAnalyzeClient`, `getMediaClient` are all already used elsewhere in this file).

- [ ] **Step 8: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(main): resume, retry-failed, and crash-recovery orchestration"
```

---

## Task 7: Preload bridge

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: Add the channels to the preload `api`**

In `src/preload/index.ts`, add to the `api` object (near the History block):

```ts
  // Interrupted / resumable jobs
  listInterruptedJobs: (): Promise<
    { jobId: string; title: string; done: number; total: number }[]
  > => ipcRenderer.invoke('jobs:listInterrupted'),
  resumeJob: (jobId: string): Promise<void> => ipcRenderer.invoke('jobs:resume', jobId),
  discardJob: (
    jobId: string
  ): Promise<{ jobId: string; title: string; done: number; total: number }[]> =>
    ipcRenderer.invoke('jobs:discard', jobId),
  retryFailed: (entryId: string): Promise<void> => ipcRenderer.invoke('jobs:retryFailed', entryId),
  onInterruptedChanged: (cb: () => void): (() => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('jobs:interruptedChanged', fn)
    return () => ipcRenderer.removeListener('jobs:interruptedChanged', fn)
  },
```

- [ ] **Step 2: Mirror the signatures in `index.d.ts`**

In `src/preload/index.d.ts`, add the same method signatures to the exposed `PluckerApi` (or equivalently-named) interface. Define the shared shape once:

```ts
  listInterruptedJobs: () => Promise<
    { jobId: string; title: string; done: number; total: number }[]
  >
  resumeJob: (jobId: string) => Promise<void>
  discardJob: (
    jobId: string
  ) => Promise<{ jobId: string; title: string; done: number; total: number }[]>
  retryFailed: (entryId: string) => Promise<void>
  onInterruptedChanged: (cb: () => void) => () => void
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(preload): expose resume / retry / interrupted-jobs IPC"
```

---

## Task 8: Renderer — resume banner + History affordances

**Files:**
- Create: `src/renderer/src/resume-banner.tsx`
- Test: `src/renderer/src/resume-banner.test.tsx`
- Modify: `src/renderer/src/app.tsx`
- Modify: `src/renderer/src/history-view.tsx`
- Modify: i18n files under `src/renderer/src/i18n/`

- [ ] **Step 1: Write the failing banner test**

Create `src/renderer/src/resume-banner.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResumeBanner } from './resume-banner'

const jobs = [{ jobId: 'j1', title: 'My Mix', done: 12, total: 40 }]

describe('ResumeBanner', () => {
  it('renders the first interrupted job with its progress', () => {
    render(<ResumeBanner jobs={jobs} onResume={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/My Mix/)).toBeTruthy()
    expect(screen.getByText(/12/)).toBeTruthy()
  })

  it('renders nothing when there are no interrupted jobs', () => {
    const { container } = render(
      <ResumeBanner jobs={[]} onResume={() => {}} onDismiss={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('fires onResume / onDismiss with the jobId', () => {
    const onResume = vi.fn()
    const onDismiss = vi.fn()
    render(<ResumeBanner jobs={jobs} onResume={onResume} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /resume/i }))
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onResume).toHaveBeenCalledWith('j1')
    expect(onDismiss).toHaveBeenCalledWith('j1')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm vitest run src/renderer/src/resume-banner.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `resume-banner.tsx`**

Create `src/renderer/src/resume-banner.tsx`. Follow the existing renderer style (function component, `useTranslation`). It shows the most recent interrupted job:

```tsx
import React from 'react'
import { useTranslation } from 'react-i18next'

export interface InterruptedJob {
  jobId: string
  title: string
  done: number
  total: number
}

export function ResumeBanner({
  jobs,
  onResume,
  onDismiss
}: {
  jobs: InterruptedJob[]
  onResume: (jobId: string) => void
  onDismiss: (jobId: string) => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const job = jobs[0]
  if (!job) return null
  return (
    <div className="resume-banner" role="status">
      <span className="resume-banner__text">
        {t('resume.banner', { title: job.title, done: job.done, total: job.total })}
      </span>
      <span className="resume-banner__actions">
        <button onClick={() => onResume(job.jobId)}>{t('resume.action')}</button>
        <button onClick={() => onDismiss(job.jobId)}>{t('resume.dismiss')}</button>
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Add i18n strings**

In every locale JSON under `src/renderer/src/i18n/` (at least `en` and `de`), add a `resume` block. English:

```json
"resume": {
  "banner": "Resume \"{{title}}\" — {{done}} of {{total}} done?",
  "action": "Resume",
  "dismiss": "Dismiss",
  "badge": "Interrupted",
  "retryFailed": "Retry failed"
}
```

German (mirror the keys; translate values, e.g. `"action": "Fortsetzen"`, `"dismiss": "Verwerfen"`, `"badge": "Unterbrochen"`, `"retryFailed": "Fehlgeschlagene wiederholen"`, and `"banner": "\"{{title}}\" fortsetzen — {{done}} von {{total}} fertig?"`).

- [ ] **Step 5: Minimal banner styling**

In `src/renderer/src/index.css`, add a small rule block consistent with the existing toolbar styling (fl: row, padded, accent border). Keep it short:

```css
.resume-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  background: color-mix(in srgb, var(--color-accent) 14%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--color-accent) 40%, transparent);
  font-size: 13px;
}
.resume-banner__actions {
  display: flex;
  gap: 8px;
}
```

- [ ] **Step 6: Wire the banner into `app.tsx`**

In `src/renderer/src/app.tsx`, add state + load/subscribe + handlers, and render `<ResumeBanner>` above the main content. Imports:

```tsx
import { ResumeBanner, type InterruptedJob } from './resume-banner'
```

State (with the other `useState`s):

```tsx
  const [interrupted, setInterrupted] = useState<InterruptedJob[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
```

Effect to load + subscribe (after the existing effects):

```tsx
  useEffect(() => {
    const load = (): void => {
      window.plucker.listInterruptedJobs().then(setInterrupted)
    }
    load()
    return window.plucker.onInterruptedChanged(load)
  }, [])
```

Handlers:

```tsx
  const visibleInterrupted = interrupted.filter((j) => !dismissed.has(j.jobId))
  const handleResume = (jobId: string): void => {
    setDismissed((prev) => new Set(prev).add(jobId))
    window.plucker.resumeJob(jobId)
  }
  const handleDismiss = (jobId: string): void => {
    setDismissed((prev) => new Set(prev).add(jobId))
  }
```

Render the banner just inside the top of the page layout (above `<Header>` or just below it — match where other full-width bars render). For example, immediately before the main view container:

```tsx
        <ResumeBanner
          jobs={visibleInterrupted}
          onResume={handleResume}
          onDismiss={handleDismiss}
        />
```

- [ ] **Step 7: History view — interrupted badge + Resume; partial Retry-failed**

In `src/renderer/src/history-view.tsx`, where each entry's outcome badge is rendered, add an `interrupted` case mapping to the `resume.badge` label (reuse the existing badge component / class used by `cancelled`). For an entry with `outcome === 'interrupted'` and a truthy `entry.jobId`, render a Resume button calling `window.plucker.resumeJob(entry.jobId)`. For an entry with `outcome === 'partial'`, render a Retry-failed button calling `window.plucker.retryFailed(entry.id)`.

Concrete snippet to place beside the existing per-entry actions:

```tsx
{entry.outcome === 'interrupted' && entry.jobId && (
  <button onClick={() => window.plucker.resumeJob(entry.jobId!)}>{t('resume.action')}</button>
)}
{entry.outcome === 'partial' && (
  <button onClick={() => window.plucker.retryFailed(entry.id)}>{t('resume.retryFailed')}</button>
)}
```

> Match the surrounding markup: if history actions go through the existing context-menu (`history-card-menu.ts`), add the two actions there instead, using the same i18n keys. Use whichever pattern the file already establishes — do not introduce a second action style.

- [ ] **Step 8: Run renderer tests + typecheck**

Run: `pnpm vitest run src/renderer/src/resume-banner.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/resume-banner.tsx src/renderer/src/resume-banner.test.tsx src/renderer/src/app.tsx src/renderer/src/history-view.tsx src/renderer/src/index.css src/renderer/src/i18n
git commit -m "feat(renderer): resume banner + history resume/retry affordances"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Lint, typecheck, and the whole test suite**

Run: `pnpm lint && pnpm typecheck && pnpm vitest run`
Expected: all PASS. Fix anything that fails before continuing.

- [ ] **Step 2: Production build**

Run: `pnpm build` (or the project's build script from `package.json`).
Expected: build succeeds.

- [ ] **Step 3: Manual smoke (document results)**

Use the `run` skill / `pnpm dev` to exercise:
1. Start a multi-track playlist download; quit (Cmd+Q) mid-job → relaunch → confirm the banner offers resume and History shows an `interrupted` entry.
2. Resume → confirm only the not-yet-done tracks re-download and the entry settles to `completed`/`partial`; the checkpoint file under `~/.plucker/jobs/` is gone.
3. Force-kill the app mid-job (Activity Monitor) → relaunch → confirm the same recovery path works with no shutdown hook.
4. A job with a failed track → click Retry-failed → confirm the failed track is re-attempted and the entry's outcome recomputes.

- [ ] **Step 4: Final commit (only if Steps 1–2 required fixes)**

```bash
git add -A
git commit -m "test(resume): fix lint/type/test issues from verification"
```

---

## Self-review notes

- **Spec coverage:** checkpoint store (Task 2) ⇄ design §1–2; resume execution (Tasks 4–6) ⇄ §3; detection+UX (Tasks 6–8) ⇄ §4; interrupted marking + crash recovery (Task 6) ⇄ §5; retry-failed (Task 6/8) ⇄ §6; error handling (atomic write Task 2, corrupt tolerance Task 2, moved-file re-queue Task 3) ⇄ §7; tests across Tasks 2–8 ⇄ §8.
- **Type consistency:** `JobCheckpointSink` (begin/settle) used identically in `job-checkpoint.ts`, `pipeline.ts`, and `index.ts`; `CheckpointEntry`/`JobCheckpoint` defined once in `types.ts`; `outcomeFromTracks`/`mergeResumed`/`partitionCheckpoint`/`synthesizeEntry` names match across `resume-merge.ts` and `index.ts`.
- **No placeholders:** every code step shows complete code; Task 6 (Electron glue) intentionally has no unit test and is verified by typecheck/build/manual smoke, which is called out explicitly.
