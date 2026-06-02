# Interactive Job Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-track skip + per-track pause/resume to a running download job, expose them via a context menu, and insert a resolve→review→Start staging step before any download begins.

**Architecture:** A keyed process registry in `spawn.ts` lets us pause/kill one track's child-process tree (group key = track index) with union semantics against the existing global pause. The pipeline owns one `AbortController` per track (combined with the job signal via `AbortSignal.any`), redirects each track's yt-dlp intermediates to a per-track temp dir for clean skip-cleanup, and exposes a `JobControls` handle the IPC layer routes skip/pause/resume to. A new `job:resolve` IPC resolves a URL without downloading; `job:start` takes a curated, reordered entry list and downloads it via a pre-resolved source.

**Tech Stack:** Electron 42 (Node ≥20, `AbortSignal.any` native), TypeScript, React + react-i18next, Vitest. Package manager: **pnpm**.

**Execution constraints (from user):** Work inline on the current branch. Do **not** create branches/worktrees, stash, or run any other git mutation. The only git allowed: before each commit, verify nothing is already staged (`git diff --cached --quiet`), then `git add <explicit files> && git commit -m "…"`. Conventional Commits required.

---

## File Structure

**Main process**
- `src/main/spawn.ts` (modify) — keyed process groups + `pauseGroup`/`resumeGroup`/`killGroup`.
- `src/main/spawn.test.ts` (modify) — group/union tests.
- `src/main/ytdlp.ts` (modify) — `tempDir` → `--paths temp:` arg; `groupKey` through `runYtDlp`.
- `src/main/pipeline.ts` (modify) — per-track temp dir, combined signal, `groupKey`, skip classification, `JobControls`, `resolveJob`, `buildDownloadSourceFromEntries`.
- `src/main/pipeline.test.ts` (modify) — skip + source tests.
- `src/main/transforms/types.ts` (modify) — `groupKey?` on `TransformServices`.
- `src/main/transforms/run-chain.ts` (modify) — already spreads services (no logic change; confirm groupKey flows).
- `src/main/audio-pcm.ts`, `src/main/image-crop.ts`, `src/main/audio-trim.ts` (modify) — `groupKey` param → `spawnManaged`.
- `src/main/transforms/analyze-key-bpm.ts`, `square-cover.ts`, `trim-silence.ts` (modify) — pass `services.groupKey`.
- `src/main/index.ts` (modify) — `job:resolve`, new `job:start` payload, `job:skipTrack/pauseTrack/resumeTrack`, `job:trackPaused` emit, `pendingResolve` cookie handoff, `jobControls`.

**Shared / preload**
- `src/shared/types.ts` (modify) — move `PlaylistEntry`/`ResolvedJob` here; add `StartJobRequest`.
- `src/preload/index.ts` (modify) — `resolveJob`, new `startDownload`, per-track controls, `onTrackPaused`.

**Renderer**
- `src/renderer/src/staging-list.ts` (create) — pure remove/move reducer.
- `src/renderer/src/staging-list.test.ts` (create).
- `src/renderer/src/download-view.tsx` (modify) — staging UI (resolve → list → Start, remove + reorder).
- `src/renderer/src/track-row-menu.ts` (modify) — skip/pause/resume items.
- `src/renderer/src/track-row-menu.test.ts` (modify).
- `src/renderer/src/app.tsx` (modify) — per-track paused state, redownload→stage request, deck wiring.
- `src/renderer/src/history-view.tsx` (modify) — route entry redownload through staging.
- `src/renderer/src/i18n/locales/en.ts`, `de.ts` (modify) — `context.skip/pauseTrack/resumeTrack`, `download.startDownload`, `download.staged*`.

---

## Task 1: `spawn.ts` — keyed process groups + union pause

**Files:**
- Modify: `src/main/spawn.ts`
- Test: `src/main/spawn.test.ts`

- [ ] **Step 1: Write failing tests** — append to `src/main/spawn.test.ts`:

```ts
import {
  spawnManaged,
  killAllChildren,
  pauseAllChildren,
  resumeAllChildren,
  pauseGroup,
  resumeGroup,
  killGroup
} from './spawn'

describe('per-group pause/resume', () => {
  afterEach(() => {
    resumeAllChildren()
    killAllChildren()
  })

  itPosix('pauses and resumes only the targeted group', async () => {
    const a = spawnManaged('sleep', ['30'], {}, undefined, undefined, 1)
    const b = spawnManaged('sleep', ['30'], {}, undefined, undefined, 2)
    pauseGroup(1)
    await tick()
    expect(procState(a.pid as number)).toBe('T') // group 1 stopped
    expect(procState(b.pid as number)).not.toBe('T') // group 2 untouched
    resumeGroup(1)
    await tick()
    expect(procState(a.pid as number)).not.toBe('T')
  })

  itPosix('global resume leaves an individually-paused group stopped', async () => {
    const a = spawnManaged('sleep', ['30'], {}, undefined, undefined, 1)
    pauseGroup(1)
    pauseAllChildren()
    await tick()
    expect(procState(a.pid as number)).toBe('T')
    resumeAllChildren() // group 1 is still individually paused
    await tick()
    expect(procState(a.pid as number)).toBe('T')
    resumeGroup(1)
    await tick()
    expect(procState(a.pid as number)).not.toBe('T')
  })

  itPosix('killGroup reaps only its own group', async () => {
    const a = spawnManaged('sleep', ['30'], {}, undefined, undefined, 1)
    const b = spawnManaged('sleep', ['30'], {}, undefined, undefined, 2)
    const aClosed = closed(a)
    killGroup(1)
    await aClosed
    expect(a.signalCode).toBe('SIGKILL')
    expect(procState(b.pid as number)).not.toBe('') // group 2 alive
  })
})
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm exec vitest run src/main/spawn.test.ts`
Expected: FAIL — `pauseGroup`/`resumeGroup`/`killGroup` not exported.

- [ ] **Step 3: Implement keyed registry** — replace the registry + pause internals in `src/main/spawn.ts`.

Replace the `live` declaration and `paused` flag (lines ~21–32) with:

```ts
type GroupKey = number | string
const UNGROUPED: GroupKey = '__ungrouped__'

/** Every still-running managed child, so orphans can be reaped on app quit. */
const live = new Set<ChildProcess>()
/** Children bucketed by group key (a track index) for per-track control. */
const groups = new Map<GroupKey, Set<ChildProcess>>()
/** Reverse lookup so cleanup can find a child's group without scanning. */
const groupOf = new WeakMap<ChildProcess, GroupKey>()

/** Whether ALL managed children are paused (the global deck pause). */
let globalPaused = false
/** Group keys individually paused, independent of the global flag. */
const pausedGroups = new Set<GroupKey>()

const isWindows = process.platform === 'win32'

/** A child is frozen if the global pause is on, or its own group is paused. */
function shouldStop(key: GroupKey): boolean {
  return globalPaused || pausedGroups.has(key)
}

function childrenOf(key: GroupKey): ChildProcess[] {
  return [...(groups.get(key) ?? [])]
}
```

Change `spawnManaged`'s signature to accept `groupKey` and register it. Update the signature line and the registration block:

```ts
export function spawnManaged(
  command: string,
  args: string[],
  options: SpawnOptions = {},
  signal?: AbortSignal,
  priority?: number,
  groupKey?: GroupKey
): ChildProcessWithoutNullStreams {
  const child = spawn(command, args, {
    ...options,
    detached: !isWindows
  }) as ChildProcessWithoutNullStreams
  const key = groupKey ?? UNGROUPED
  live.add(child)
  let bucket = groups.get(key)
  if (!bucket) {
    bucket = new Set()
    groups.set(key, bucket)
  }
  bucket.add(child)
  groupOf.set(child, key)

  // Came up while frozen (global pause OR this group paused) — stop it now.
  if (shouldStop(key)) signalGroup(child, 'SIGSTOP')
```

Update the existing `cleanup` closure inside `spawnManaged` to also drop the child from its group bucket:

```ts
  const cleanup = (): void => {
    live.delete(child)
    const k = groupOf.get(child) ?? UNGROUPED
    const set = groups.get(k)
    if (set) {
      set.delete(child)
      if (set.size === 0) groups.delete(k)
    }
    signal?.removeEventListener('abort', onAbort)
  }
```

Replace `pauseAllChildren`/`resumeAllChildren`/`isPaused` and add the group fns:

```ts
export function killAllChildren(): void {
  for (const child of live) hardKill(child)
  live.clear()
  groups.clear()
}

export function pauseAllChildren(): void {
  globalPaused = true
  for (const child of live) signalGroup(child, 'SIGSTOP')
}

export function resumeAllChildren(): void {
  globalPaused = false
  // Resume everything EXCEPT children whose group is still individually paused.
  for (const child of live) {
    if (!pausedGroups.has(groupOf.get(child) ?? UNGROUPED)) signalGroup(child, 'SIGCONT')
  }
}

export function isPaused(): boolean {
  return globalPaused
}

/** Freeze one group's process trees (SIGSTOP). Independent of the global pause. */
export function pauseGroup(key: GroupKey): void {
  pausedGroups.add(key)
  for (const child of childrenOf(key)) signalGroup(child, 'SIGSTOP')
}

/** Wake one group — but only if the global pause isn't also holding it down. */
export function resumeGroup(key: GroupKey): void {
  pausedGroups.delete(key)
  if (globalPaused) return
  for (const child of childrenOf(key)) signalGroup(child, 'SIGCONT')
}

/** Force-kill one group's process trees (skip). */
export function killGroup(key: GroupKey): void {
  for (const child of childrenOf(key)) hardKill(child)
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run src/main/spawn.test.ts`
Expected: PASS (all, including the original abort/global tests).

- [ ] **Step 5: Commit** (verify nothing pre-staged first)

```bash
git diff --cached --quiet || { echo "ABORT: index not empty"; exit 1; }
git add src/main/spawn.ts src/main/spawn.test.ts
git commit -m "feat(spawn): keyed process groups with per-group pause/resume/kill"
```

---

## Task 2: `ytdlp.ts` — temp-dir redirect + groupKey

**Files:**
- Modify: `src/main/ytdlp.ts`
- Test: `src/main/ytdlp.test.ts` (exists; check with `ls src/main/ytdlp.test.ts`)

- [ ] **Step 1: Write failing test** — add to `src/main/ytdlp.test.ts` (create the file with the import header below if it does not exist):

```ts
import { describe, it, expect } from 'vitest'
import { buildDownloadArgs } from './ytdlp'
import { defaultSettings } from '../shared/defaults'

const base = {
  url: 'https://x',
  destFolder: '/out',
  settings: defaultSettings(),
  ffmpegPath: '/ff'
}

describe('buildDownloadArgs tempDir', () => {
  it('omits --paths when no tempDir', () => {
    expect(buildDownloadArgs(base).join(' ')).not.toContain('--paths')
  })
  it('redirects intermediates to a temp dir', () => {
    const args = buildDownloadArgs({ ...base, tempDir: '/tmp/p/3' })
    const i = args.indexOf('--paths')
    expect(i).toBeGreaterThan(-1)
    expect(args[i + 1]).toBe('temp:/tmp/p/3')
  })
})
```

> Verify `defaultSettings` is the correct export name: `grep -n "export" src/shared/defaults.ts`. If it differs (e.g. `DEFAULT_SETTINGS`), use that name in the test.

- [ ] **Step 2: Run, verify failure**

Run: `pnpm exec vitest run src/main/ytdlp.test.ts`
Expected: FAIL — `tempDir` not honored.

- [ ] **Step 3: Implement** — in `src/main/ytdlp.ts`:

Add to `DownloadArgsInput`:

```ts
  /** When set, yt-dlp keeps `.part`/intermediate files here (final mp3 still goes to -o). */
  tempDir?: string
```

Destructure it (`const { url, destFolder, settings, ffmpegPath, singleVideo, cookieFile, tempDir } = input`) and, right before the `if (cookieFile)` block, add:

```ts
  // Keep partial/intermediate files in a per-track temp dir so a skipped or
  // killed download leaves no orphaned `.part` files in the shared output folder.
  if (tempDir) {
    args.push('--paths', `temp:${tempDir}`)
  }
```

Add a `groupKey` param to `runYtDlp` and forward it to `spawnManaged`:

```ts
export function runYtDlp(
  ytdlpPath: string,
  args: string[],
  onProgress: (e: ProgressEvent) => void,
  onComplete: (filePath: string) => void,
  signal?: AbortSignal,
  priority?: number,
  groupKey?: number | string
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawnManaged(ytdlpPath, args, {}, signal, priority, groupKey)
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run src/main/ytdlp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git diff --cached --quiet || { echo "ABORT: index not empty"; exit 1; }
git add src/main/ytdlp.ts src/main/ytdlp.test.ts
git commit -m "feat(ytdlp): per-track temp-dir redirect and process group key"
```

---

## Task 3: Shared types — move `PlaylistEntry`/`ResolvedJob`, add `StartJobRequest`

**Files:**
- Modify: `src/shared/types.ts`, `src/main/pipeline.ts`

- [ ] **Step 1: Add to `src/shared/types.ts`** (near the bottom, after `HistoryEntry`):

```ts
/** One entry in a resolved playlist/video, before download. */
export interface PlaylistEntry {
  videoId: string
  title: string
  index: number
  /** Per-entry page URL from the flat playlist, used to download this video alone. */
  url?: string
}

/** Result of resolving a URL without downloading. */
export interface ResolvedJob {
  kind: 'playlist' | 'video'
  title: string
  entries: PlaylistEntry[]
}

/** Curated, reordered job the user confirmed in the staging list. */
export interface StartJobRequest {
  url: string
  title: string
  kind: 'playlist' | 'video'
  entries: PlaylistEntry[]
  /** Force a specific output folder (history redownload reuses the original). */
  folderOverride?: string
}
```

- [ ] **Step 2: Re-export from `pipeline.ts`** — in `src/main/pipeline.ts`, delete the local `PlaylistEntry` and `ResolvedJob` interface declarations (lines ~51–63) and replace with an import + re-export so existing `import { ... } from './pipeline'` sites keep working:

```ts
import type {
  Settings,
  JobProgress,
  JobStatus,
  JobOutcome,
  TrackProgress,
  HistoryTrack,
  PlaylistEntry,
  ResolvedJob,
  StartJobRequest
} from '../shared/types'

export type { PlaylistEntry, ResolvedJob } from '../shared/types'
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit -p .` (or `pnpm typecheck` — confirm script name in `package.json`)
Expected: PASS (no references broke).

- [ ] **Step 4: Commit**

```bash
git diff --cached --quiet || { echo "ABORT: index not empty"; exit 1; }
git add src/shared/types.ts src/main/pipeline.ts
git commit -m "refactor(types): move PlaylistEntry/ResolvedJob to shared, add StartJobRequest"
```

---

## Task 4: `TransformServices.groupKey` + thread through ffmpeg helpers

**Files:**
- Modify: `src/main/transforms/types.ts`, `src/main/audio-pcm.ts`, `src/main/image-crop.ts`, `src/main/audio-trim.ts`, `src/main/transforms/analyze-key-bpm.ts`, `src/main/transforms/square-cover.ts`, `src/main/transforms/trim-silence.ts`

No new unit test (pure plumbing; covered by Task 5's pause behavior + existing transform tests). Verify with typecheck + existing suite.

- [ ] **Step 1: Add `groupKey` to `TransformServices`** — in `src/main/transforms/types.ts`, inside the interface:

```ts
  /** Process-group key (the track index) so per-track pause can freeze this track's ffmpeg. */
  groupKey?: number
```

- [ ] **Step 2: `audio-pcm.ts`** — thread groupKey:

```ts
export function ffmpegPcmDeps(ffmpegPath: string, signal?: AbortSignal, groupKey?: number): PcmDeps {
```
and in its body change the spawn call:
```ts
        const child = spawnManaged(ffmpegPath, args, {}, signal, undefined, groupKey)
```

- [ ] **Step 3: `image-crop.ts`** — `cropToSquare` gains `groupKey?: number` after `signal`:

```ts
export function cropToSquare(
  ffmpegPath: string,
  image: Buffer,
  mime: string,
  signal?: AbortSignal,
  groupKey?: number
): Promise<Buffer> {
```
```ts
    const child = spawnManaged(ffmpegPath, ffmpegCropArgs(mime), {}, signal, undefined, groupKey)
```

- [ ] **Step 4: `audio-trim.ts`** — `ffmpegTrimDeps` gains `groupKey?: number`; pass it into the internal `runFfmpeg` calls' spawn. Update `runFfmpeg` (the local helper around line 109) to accept + forward `groupKey`:

```ts
// runFfmpeg(...) helper signature:
  signal?: AbortSignal,
  groupKey?: number
): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawnManaged(ffmpegPath, args, {}, signal, undefined, groupKey)
```
and `ffmpegTrimDeps`:
```ts
export function ffmpegTrimDeps(ffmpegPath: string, signal?: AbortSignal, groupKey?: number): TrimDeps {
```
passing `groupKey` into each `runFfmpeg(ffmpegPath, …, signal, groupKey)` call inside it.

- [ ] **Step 5: Update transform call sites** to pass `services.groupKey`:

`src/main/transforms/square-cover.ts` (~line 55):
```ts
      crop: (image, mime) => cropToSquare(services.bin.ffmpeg, image, mime, services.signal, services.groupKey),
```
`src/main/transforms/analyze-key-bpm.ts` — where it builds ffmpeg deps (lines ~89/148), add `services.groupKey` as the trailing arg to `ffmpegPcmDeps(...)` / `buildAnalyzeDeps(...)`. For `buildAnalyzeDeps(services.log, services.bin.ffmpeg, services.signal)` add `, services.groupKey` and thread it into the `ffmpegPcmDeps` call inside `buildAnalyzeDeps` (update that helper's signature too).
`src/main/transforms/trim-silence.ts` (~line 71):
```ts
      ffmpegTrimDeps(services.bin.ffmpeg, services.signal, services.groupKey)
```

> After editing, grep to confirm no `ffmpegPcmDeps(`/`cropToSquare(`/`ffmpegTrimDeps(` call site was missed: `grep -rn "ffmpegPcmDeps(\|cropToSquare(\|ffmpegTrimDeps(" src/main`.

- [ ] **Step 6: Typecheck + transform tests**

Run: `pnpm exec tsc --noEmit -p . && pnpm exec vitest run src/main/transforms src/main/audio-pcm.test.ts src/main/image-crop.test.ts src/main/audio-trim.test.ts`
Expected: PASS (some test files may not exist — that's fine; run the ones that do).

- [ ] **Step 7: Commit**

```bash
git diff --cached --quiet || { echo "ABORT: index not empty"; exit 1; }
git add src/main/transforms/types.ts src/main/audio-pcm.ts src/main/image-crop.ts src/main/audio-trim.ts src/main/transforms/analyze-key-bpm.ts src/main/transforms/square-cover.ts src/main/transforms/trim-silence.ts
git commit -m "feat(transforms): thread per-track process group key into ffmpeg spawns"
```

---

## Task 5: Pipeline — per-track temp dir, combined signal, skip classification, JobControls

**Files:**
- Modify: `src/main/pipeline.ts`
- Test: `src/main/pipeline.test.ts`

- [ ] **Step 1: Extend `SourceEntry.provide` + add `JobControls`** — in `src/main/pipeline.ts`:

Change the `provide` signature in the `SourceEntry` interface to accept a per-track temp dir:

```ts
  provide(
    t: TrackProgress,
    report: () => void,
    signal?: AbortSignal,
    tempDir?: string
  ): Promise<ProvideOutcome>
```

Add near `RunJobDeps`:

```ts
/** Per-track controls handed to the IPC layer for a live job. */
export interface JobControls {
  skipTrack(index: number): void
  pauseTrack(index: number): void
  resumeTrack(index: number): void
}
```

Add to `RunJobDeps`:

```ts
  /** Receives a controls handle once the track list exists, for skip/pause/resume IPC. */
  onControls?: (controls: JobControls) => void
```

- [ ] **Step 2: Write failing test** — add to `src/main/pipeline.test.ts`:

```ts
import { describe as describe2 } from 'vitest' // (already imported; illustrative)
```
Append a real test for the pure skip-classification helper we will add:

```ts
import { classifySettled } from './pipeline'

describe('classifySettled', () => {
  it('marks a skip-requested track as skipped, not failed', () => {
    const t = tp(1, 'downloading')
    classifySettled(t, { skipRequested: true, jobAborted: false, fallback: 'failed' })
    expect(t.status).toBe('skipped')
    expect(t.reason).toBe('Skipped by user')
  })
  it('uses the fallback when no skip was requested', () => {
    const t = tp(1, 'downloading')
    classifySettled(t, { skipRequested: false, jobAborted: false, fallback: 'failed' })
    expect(t.status).toBe('failed')
  })
  it('does not override a job-wide cancel', () => {
    const t = tp(1, 'downloading')
    classifySettled(t, { skipRequested: true, jobAborted: true, fallback: 'failed' })
    expect(t.status).toBe('downloading') // left for markCancelledTracks
  })
})
```

- [ ] **Step 3: Run, verify failure**

Run: `pnpm exec vitest run src/main/pipeline.test.ts -t classifySettled`
Expected: FAIL — `classifySettled` not exported.

- [ ] **Step 4: Implement `classifySettled`** — add to `src/main/pipeline.ts` (exported, near `finalizePendingTracks`):

```ts
/**
 * Settle a track that just came out of an aborted/finished stage. A user skip
 * wins over the generic fallback (failed) but never over a job-wide cancel —
 * that case is left untouched for `markCancelledTracks` to relabel.
 */
export function classifySettled(
  t: TrackProgress,
  opts: { skipRequested: boolean; jobAborted: boolean; fallback: TrackProgress['status'] }
): void {
  if (opts.jobAborted) return
  if (opts.skipRequested) {
    t.status = 'skipped'
    t.stage = undefined
    t.reason = 'Skipped by user'
    return
  }
  t.status = opts.fallback
}
```

- [ ] **Step 5: Wire per-track control into `runPipeline`** — in `src/main/pipeline.ts`, inside `runPipeline`, after `const tracks: TrackProgress[] = …` and before building the registry, add:

```ts
    // Per-track abort + skip bookkeeping. Each track gets its own controller,
    // combined with the job signal so a skip aborts just that track.
    const trackAbort = new Map<number, AbortController>()
    const skipRequested = new Set<number>()
    for (const t of tracks) trackAbort.set(t.index, new AbortController())
    const signalFor = (index: number): AbortSignal => {
      const ac = trackAbort.get(index)
      return ac && signal ? AbortSignal.any([signal, ac.signal]) : (ac?.signal ?? signal!)
    }

    // Per-track temp root so a killed/skipped download leaves no orphaned parts.
    const tempRoot = join(tmpdir(), 'plucker', randomUUID())
    const tempDirFor = (index: number): string => join(tempRoot, String(index))

    deps.onControls?.({
      skipTrack(index) {
        skipRequested.add(index)
        trackAbort.get(index)?.abort()
        killGroup(index)
      },
      pauseTrack(index) {
        pauseGroup(index)
      },
      resumeTrack(index) {
        resumeGroup(index)
      }
    })
```

Add imports at the top of `pipeline.ts`:
```ts
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { killGroup, pauseGroup, resumeGroup } from './spawn'
```
(`mkdirSync`/`rmSync` already imported from `node:fs`.)

- [ ] **Step 6: Use per-track signal + temp dir + groupKey services.** In `runPipeline`:

The shared `services` object currently carries the job `signal`. Remove `signal` from the shared object and build a per-track services in `finishTrack`. Change `finishTrack`/`runTransformStage` to take the track's services:

In `finishTrack`, replace the `runTransformChain(..., services, ...)` call's services with a per-track one. At the top of `finishTrack` add:
```ts
      const trackServices = { ...services, signal: signalFor(t.index), groupKey: t.index }
```
and pass `trackServices` instead of `services` to `runTransformChain`, and use `trackServices.signal` where the probe/hash use `signal` **for that track** (replace `probeAudio(bin.ffmpeg, res.outputFile, signal)` → `probeAudio(bin.ffmpeg, res.outputFile, trackServices.signal)`). Keep the shared `services` object built without `signal` (or leave `signal` — it is overridden per track).

In `acquireEntry`, create the temp dir and pass the per-track signal + tempDir to `provide`:
```ts
    const acquireEntry = async (entry: SourceEntry, t: TrackProgress): Promise<void> => {
      const trackSpan = startSpan('track-process', 'pipeline')
      const tempDir = tempDirFor(t.index)
      mkdirSync(tempDir, { recursive: true })
      const outcome = await entry.provide(t, emit, signalFor(t.index), tempDir)
      rmSync(tempDir, { recursive: true, force: true })
      t.stage = undefined
      t.speedBytesPerSec = undefined
      // A user skip during download settles as 'skipped', not the provide outcome.
      if (skipRequested.has(t.index) && !(signal?.aborted ?? false)) {
        t.status = 'skipped'
        t.stage = undefined
        t.reason = 'Skipped by user'
        t.elapsedMs = Math.round(trackSpan.end(`${t.title} (skipped)`))
        emit()
        return
      }
      if (outcome.kind === 'skipped') { /* unchanged */ }
      // … rest unchanged …
```

In `runTransformStage`'s `catch`, reclassify a skip:
```ts
        } catch (err) {
          classifySettled(t, {
            skipRequested: skipRequested.has(t.index),
            jobAborted: signal?.aborted ?? false,
            fallback: 'failed'
          })
          if (t.status === 'failed') t.reason = t.reason ?? (err instanceof Error ? err.message : 'Transform failed')
          if (t.status === 'skipped') t.reason = 'Skipped by user'
          t.elapsedMs = Math.round(trackSpan.end(`${t.title} (${t.status})`))
          log.warn('transform', `track ${t.status} "${t.title}": ${t.reason}`)
        }
```

Add a `finally` cleanup of the temp root at the end of `runPipeline`'s `try` (just before `return`), and also in the existing outer `finally`:
```ts
  } finally {
    source.cleanup?.()
    try { rmSync(tempRoot, { recursive: true, force: true }) } catch { /* already gone */ }
  }
```
> `tempRoot` must be in scope of the `finally`. Declare `let tempRoot = ''` just inside the `try` top is not enough — declare it **before** the `try` (function scope) and assign inside. Move the `const tempRoot = …`/`tempDirFor` declarations to function scope: `let tempRoot = ''` above `try`, assign `tempRoot = join(...)` where shown, and define `tempDirFor` after assignment.

- [ ] **Step 7: Run pipeline tests**

Run: `pnpm exec vitest run src/main/pipeline.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git diff --cached --quiet || { echo "ABORT: index not empty"; exit 1; }
git add src/main/pipeline.ts src/main/pipeline.test.ts
git commit -m "feat(pipeline): per-track skip, temp-dir cleanup, and job controls"
```

---

## Task 6: Pipeline — `resolveJob` + `buildDownloadSourceFromEntries`

**Files:**
- Modify: `src/main/pipeline.ts`
- Test: `src/main/pipeline.test.ts`

- [ ] **Step 1: Write failing test** — add to `src/main/pipeline.test.ts`:

```ts
import { buildDownloadSourceFromEntries } from './pipeline'
import type { ResolvedJob } from '../shared/types'

const fakeDeps = () =>
  ({
    bin: { ytdlp: '/yt', ffmpeg: '/ff' },
    settings: defaultSettings(),
    homeBase: '/home/Music',
    onProgress: () => {}
  }) as unknown as Parameters<typeof buildDownloadSourceFromEntries>[1]

describe('buildDownloadSourceFromEntries', () => {
  it('resolves to the supplied job without re-resolving, in entry order', async () => {
    const job: ResolvedJob = {
      kind: 'playlist',
      title: 'Mix',
      entries: [
        { videoId: 'b', title: 'B', index: 2, url: 'https://x/b' },
        { videoId: 'a', title: 'A', index: 1, url: 'https://x/a' }
      ]
    }
    const src = buildDownloadSourceFromEntries({ url: 'https://x', ...job }, fakeDeps())
    const resolved = await src.resolve()
    expect(resolved).toEqual({ title: 'Mix', kind: 'playlist', url: 'https://x' })
    expect(src.entries().map((e) => e.title)).toEqual(['B', 'A']) // preserves curated order
  })
})
```
> Add `import { defaultSettings } from '../shared/defaults'` to the test file if not present (use the real export name).

- [ ] **Step 2: Run, verify failure**

Run: `pnpm exec vitest run src/main/pipeline.test.ts -t buildDownloadSourceFromEntries`
Expected: FAIL — not exported.

- [ ] **Step 3: Extract `resolveJob`** — refactor `buildDownloadSource`'s resolve+escalation into a standalone exported function. Add to `src/main/pipeline.ts`:

```ts
/**
 * Resolve a URL to its playlist/video entries WITHOUT downloading. Escalates to an
 * exported cookie file once if the live browser store is unreadable; the resulting
 * cookie file (if any) is returned so a subsequent download can reuse it.
 */
export async function resolveJob(
  url: string,
  deps: Pick<RunJobDeps, 'bin' | 'settings' | 'onStatus' | 'signal'>
): Promise<{ job: ResolvedJob; cookieFile?: string }> {
  const { bin, settings, onStatus, signal } = deps
  let cookieFile: string | undefined
  let cookieArgs: string[] = needsCookieEscalation(settings)
    ? ['--cookies-from-browser', settings.cookies.source]
    : []
  const resolveOnce = (): Promise<ResolvedJob> =>
    timed('resolve-playlist', 'pipeline', () =>
      resolvePlaylist(
        bin.ytdlp,
        url,
        (line) => {
          onStatus?.({ phase: 'resolving', line })
          log.debug('yt-dlp', line)
        },
        signal,
        cookieArgs
      )
    )
  onStatus?.({ phase: 'resolving', key: 'launching' })
  let job: ResolvedJob
  try {
    job = await resolveOnce()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const escalate =
      !(signal?.aborted ?? false) &&
      needsCookieEscalation(settings) &&
      isCookiePermissionError(msg)
    if (!escalate) throw err
    cookieFile = await exportBrowserCookies(bin.ytdlp, settings.cookies.source, url)
    cookieArgs = ['--cookies', cookieFile]
    job = await resolveOnce()
  }
  onStatus?.({ phase: 'resolving', key: 'resolved', params: { count: job.entries.length } })
  log.info('app', `resolved ${job.kind} "${job.title}" — ${job.entries.length} track(s)`)
  return { job, cookieFile }
}
```

- [ ] **Step 4: Add `buildDownloadSourceFromEntries`** — a `JobSource` built from a pre-resolved, curated request. Reuse the existing per-entry `provide` body from `buildDownloadSource` (extract the shared `makeProvide` so it is not duplicated):

```ts
export function buildDownloadSourceFromEntries(
  req: StartJobRequest,
  deps: RunJobDeps,
  cookieFile?: string
): JobSource {
  const { bin, settings, homeBase } = deps
  log.info('app', `job start (staged): ${req.url} — ${req.entries.length} track(s)`)
  let dest = ''
  const isHttpUrl = (s?: string): s is string => !!s && /^https?:\/\//.test(s)
  const entryUrl = (e: PlaylistEntry): string =>
    isHttpUrl(e.url) ? e.url : req.kind === 'video' ? req.url : watchUrl(e.videoId)
  return {
    async resolve() {
      dest =
        deps.folderOverride ??
        req.folderOverride ??
        destFolderFor(homeBase, req.title, settings.downloads.perPlaylistSubfolder, req.kind)
      return { title: req.title, kind: req.kind, url: req.url }
    },
    entries() {
      return req.entries.map((e) => ({
        index: e.index,
        title: e.title,
        videoId: e.videoId,
        destFolder: dest,
        provide: makeDownloadProvide({ entryUrl: () => entryUrl(e), dest: () => dest, bin, settings, cookieFile })
      }))
    },
    cleanup() {
      if (cookieFile) cleanupCookieFile(cookieFile)
    }
  }
}
```

Extract `makeDownloadProvide` from the existing `provide` closure (the body currently at lines ~697–754). It must use the new `provide(t, report, sig, tempDir)` signature and pass `tempDir` to `buildDownloadArgs` and `groupKey = t.index` to `runYtDlp`:

```ts
function makeDownloadProvide(opts: {
  entryUrl: () => string
  dest: () => string
  bin: BinaryPaths
  settings: Settings
  cookieFile?: string
}): SourceEntry['provide'] {
  const { bin, settings, cookieFile } = opts
  return async function provide(t, report, sig, tempDir) {
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
      url: opts.entryUrl(),
      destFolder: opts.dest(),
      settings,
      ffmpegPath: bin.ffmpeg,
      singleVideo: true,
      cookieFile,
      tempDir
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
      (f) => { downloaded = f },
      sig,
      priorityToNice(settings.performance.priority),
      t.index
    )
    const outcome = classifyDownload(downloaded, dl, settings.audio.minBitrate)
    if (outcome.kind === 'skipped') {
      log.info('yt-dlp', `skipped "${t.title}" — no source audio at/above ${settings.audio.minBitrate} kbps`)
      return { kind: 'skipped', reason: outcome.reason }
    }
    if (outcome.kind === 'failed') {
      log.warn('yt-dlp', `download failed for "${t.title}": ${outcome.reason}`)
      return { kind: 'failed', reason: outcome.reason, errorCode: dl.code ? `yt-dlp ${dl.code}` : undefined }
    }
    return { kind: 'file', file: outcome.file }
  }
}
```

Refactor the existing `buildDownloadSource` to call `resolveJob` + `makeDownloadProvide` (so the legacy internal-resolve path stays DRY) **or** delete it if no caller remains after Task 8. Check callers: `grep -rn "buildDownloadSource\b\|runJob\b" src`. If only `runJob`/`index.ts` use it and Task 8 migrates them, delete `buildDownloadSource` + `runJob`. Otherwise keep `buildDownloadSource` rewritten to delegate to the extracted helpers.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm exec vitest run src/main/pipeline.test.ts && pnpm exec tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git diff --cached --quiet || { echo "ABORT: index not empty"; exit 1; }
git add src/main/pipeline.ts src/main/pipeline.test.ts
git commit -m "feat(pipeline): resolveJob and pre-resolved staged download source"
```

---

## Task 7: Main IPC + preload — resolve, staged start, per-track controls

**Files:**
- Modify: `src/main/index.ts`, `src/preload/index.ts`

No unit test (IPC wiring); verified by the manual smoke test in Task 11.

- [ ] **Step 1: `index.ts` — module state + handlers.** Near `let abort` (line ~50) add:

```ts
let jobControls: import('./pipeline').JobControls | null = null
/** Cookie file exported during the last job:resolve, reused by the next job:start. */
let pendingResolve: { url: string; cookieFile?: string } | null = null
```

Add a `job:resolve` handler (near the other job handlers):

```ts
  ipcMain.handle('job:resolve', async (_e, url: string) => {
    const settings = loadSettings()
    abort = new AbortController()
    const { job, cookieFile } = await resolveJob(url, {
      bin: currentBin(),
      settings,
      onStatus: (s) => getWindow()?.webContents.send('job:status', s),
      signal: abort.signal
    })
    pendingResolve = { url, cookieFile }
    return job
  })
```

Replace the existing `job:start` handler so it takes a `StartJobRequest`. Change `runJob(url, …)` to `runPipeline(buildDownloadSourceFromEntries(req, deps, cookieFile), deps)` and register controls:

```ts
  ipcMain.handle('job:start', async (_e, req: StartJobRequest) => {
    const settings = loadSettings()
    resumeAllChildren()
    getWindow()?.webContents.send('job:paused', false)
    abort = new AbortController()
    const cookieFile = pendingResolve?.url === req.url ? pendingResolve.cookieFile : undefined
    pendingResolve = null
    try {
      const result = await runPipeline(
        buildDownloadSourceFromEntries(req, {
          bin: currentBin(),
          settings,
          homeBase: expandHome(settings.downloads.baseFolder),
          cache: getMetaCache(),
          analyze: (file, config) => getAnalyzeClient().analyze(file, config, currentBin().ffmpeg, abort?.signal),
          media: getMediaClient(),
          onProgress: (p) => {
            const win = getWindow()
            win?.webContents.send('job:progress', p)
            win?.setProgressBar(p.overall > 0 && p.overall < 1 ? p.overall : p.overall >= 1 ? 1 : -1)
          },
          onStatus: (s) => getWindow()?.webContents.send('job:status', s),
          signal: abort.signal,
          folderOverride: req.folderOverride,
          onControls: (c) => { jobControls = c }
        }, cookieFile),
        // second runPipeline arg `deps` — pass the SAME deps object; see note below
      )
      // … existing history-write block, but use result.url/title/etc as today …
    } catch (err) {
      // … existing catch, but use req.url for the minimal failed entry …
    } finally {
      jobControls = null
    }
  })
```

> **Note:** `runPipeline(source, deps)` takes deps twice-shaped here. Refactor to build a single `const deps = { … }` object first, pass it to **both** `buildDownloadSourceFromEntries(req, deps, cookieFile)` and `runPipeline(source, deps)` — do not duplicate the literal. Mirror the existing `job:start` body for the history-write success/catch branches, swapping `url` → `req.url`, `folderOverride` → `req.folderOverride`, and `kind`/`title` from `result`.

Add the per-track control handlers:

```ts
  ipcMain.handle('job:skipTrack', (_e, index: number) => jobControls?.skipTrack(index))
  ipcMain.handle('job:pauseTrack', (_e, index: number) => {
    jobControls?.pauseTrack(index)
    getWindow()?.webContents.send('job:trackPaused', index, true)
  })
  ipcMain.handle('job:resumeTrack', (_e, index: number) => {
    jobControls?.resumeTrack(index)
    getWindow()?.webContents.send('job:trackPaused', index, false)
  })
```

Update imports in `index.ts`:
```ts
import { runPipeline, resolveJob, buildDownloadSourceFromEntries } from './pipeline'
import type { StartJobRequest } from '../shared/types'
```
(Drop `runJob` from the import if it was deleted in Task 6.)

- [ ] **Step 2: `preload/index.ts`** — change `startDownload`, add `resolveJob`, per-track controls, `onTrackPaused`:

```ts
  resolveJob: (url: string): Promise<ResolvedJob> => ipcRenderer.invoke('job:resolve', url),
  startDownload: (req: StartJobRequest): Promise<void> => ipcRenderer.invoke('job:start', req),
  skipTrack: (index: number): Promise<void> => ipcRenderer.invoke('job:skipTrack', index),
  pauseTrack: (index: number): Promise<void> => ipcRenderer.invoke('job:pauseTrack', index),
  resumeTrack: (index: number): Promise<void> => ipcRenderer.invoke('job:resumeTrack', index),
  onTrackPaused: (cb: (index: number, paused: boolean) => void): (() => void) => {
    const fn = (_: unknown, index: number, paused: boolean): void => cb(index, paused)
    ipcRenderer.on('job:trackPaused', fn)
    return () => ipcRenderer.removeListener('job:trackPaused', fn)
  },
```
Add `ResolvedJob, StartJobRequest` to the `from '../shared/types'` import.

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit -p .`
Expected: PASS. (Renderer `startDownload(url)` callers will now error — fixed in Tasks 9/10. If you want a green typecheck at this commit, do Step 1–2 then proceed directly to Task 8–10 before the next full typecheck.)

- [ ] **Step 4: Commit**

```bash
git diff --cached --quiet || { echo "ABORT: index not empty"; exit 1; }
git add src/main/index.ts src/preload/index.ts
git commit -m "feat(ipc): job:resolve, staged job:start, and per-track skip/pause/resume"
```

---

## Task 8: Staging list reducer (pure)

**Files:**
- Create: `src/renderer/src/staging-list.ts`, `src/renderer/src/staging-list.test.ts`

- [ ] **Step 1: Write failing test** — `src/renderer/src/staging-list.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { removeEntry, moveEntry } from './staging-list'
import type { PlaylistEntry } from '../../shared/types'

const list: PlaylistEntry[] = [
  { videoId: 'a', title: 'A', index: 1 },
  { videoId: 'b', title: 'B', index: 2 },
  { videoId: 'c', title: 'C', index: 3 }
]

describe('removeEntry', () => {
  it('drops the entry at the given array position', () => {
    expect(removeEntry(list, 1).map((e) => e.videoId)).toEqual(['a', 'c'])
  })
  it('returns the same length-1 list and never mutates input', () => {
    const copy = [...list]
    removeEntry(list, 0)
    expect(list).toEqual(copy)
  })
})

describe('moveEntry', () => {
  it('moves an item from one position to another', () => {
    expect(moveEntry(list, 0, 2).map((e) => e.videoId)).toEqual(['b', 'c', 'a'])
  })
  it('is a no-op when from === to', () => {
    expect(moveEntry(list, 1, 1)).toEqual(list)
  })
  it('clamps out-of-range targets', () => {
    expect(moveEntry(list, 0, 9).map((e) => e.videoId)).toEqual(['b', 'c', 'a'])
  })
})
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm exec vitest run src/renderer/src/staging-list.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** — `src/renderer/src/staging-list.ts`:

```ts
import type { PlaylistEntry } from '../../shared/types'

/** Remove the entry at array position `pos` (returns a new array). */
export function removeEntry(entries: PlaylistEntry[], pos: number): PlaylistEntry[] {
  return entries.filter((_, i) => i !== pos)
}

/** Move the entry at `from` to `to` (clamped), returning a new array. */
export function moveEntry(entries: PlaylistEntry[], from: number, to: number): PlaylistEntry[] {
  if (from === to) return entries
  const next = [...entries]
  const [item] = next.splice(from, 1)
  if (item === undefined) return entries
  const target = Math.max(0, Math.min(to, next.length))
  next.splice(target, 0, item)
  return next
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run src/renderer/src/staging-list.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git diff --cached --quiet || { echo "ABORT: index not empty"; exit 1; }
git add src/renderer/src/staging-list.ts src/renderer/src/staging-list.test.ts
git commit -m "feat(staging): pure remove/move reducer for the staging list"
```

---

## Task 9: Track-row context menu — skip / pause / resume

**Files:**
- Modify: `src/renderer/src/track-row-menu.ts`, `src/renderer/src/track-row-menu.test.ts`
- Modify: `src/renderer/src/i18n/locales/en.ts`, `de.ts`

- [ ] **Step 1: Write failing test** — add to `src/renderer/src/track-row-menu.test.ts`:

```ts
it('offers Skip + Pause for a downloading track', () => {
  const items = trackRowMenuItems({
    t,
    variant: 'download',
    track: { title: 'X', status: 'downloading', paused: false },
    missing: false,
    failed: false,
    onReveal: () => {},
    onSkip: () => {},
    onPause: () => {},
    onResume: () => {}
  })
  const labels = items.filter((i) => 'label' in i).map((i) => (i as { label: string }).label)
  expect(labels).toContain('context.skip')
  expect(labels).toContain('context.pauseTrack')
  expect(labels).not.toContain('context.resumeTrack')
})

it('shows Resume (not Pause) when the track is paused', () => {
  const items = trackRowMenuItems({
    t, variant: 'download',
    track: { title: 'X', status: 'transforming', paused: true },
    missing: false, failed: false, onReveal: () => {},
    onSkip: () => {}, onPause: () => {}, onResume: () => {}
  })
  const labels = items.filter((i) => 'label' in i).map((i) => (i as { label: string }).label)
  expect(labels).toContain('context.resumeTrack')
  expect(labels).not.toContain('context.pauseTrack')
})

it('offers no skip/pause for a done track', () => {
  const items = trackRowMenuItems({
    t, variant: 'download',
    track: { title: 'X', status: 'done', file: '/a.mp3', paused: false },
    missing: false, failed: false, onReveal: () => {}
  })
  const labels = items.filter((i) => 'label' in i).map((i) => (i as { label: string }).label)
  expect(labels).not.toContain('context.skip')
})
```
> The existing test file's mock `t` returns the key as-is (verify: `grep -n "const t" src/renderer/src/track-row-menu.test.ts`). If it formats differently, assert against whatever it returns.

- [ ] **Step 2: Run, verify failure**

Run: `pnpm exec vitest run src/renderer/src/track-row-menu.test.ts`
Expected: FAIL — `status`/`paused`/`onSkip` not on the types.

- [ ] **Step 3: Implement** — in `src/renderer/src/track-row-menu.ts`:

Extend `TrackMenuTrack`:
```ts
export interface TrackMenuTrack {
  title: string
  file?: string
  videoId?: string
  errorCode?: string
  reason?: string
  status?: import('../../shared/types').TrackStatus
  /** Whether this track is individually paused (download view only). */
  paused?: boolean
}
```
Add the optional handlers to the `opts` param: `onSkip?: () => void; onPause?: () => void; onResume?: () => void`.

After the initial `items` array (and before the `videoId` block), insert the live-control block:
```ts
  const active = track.status === 'downloading' || track.status === 'transforming'
  const skippable = active || track.status === 'queued'
  if (variant === 'download' && skippable && opts.onSkip) {
    if (active && opts.onPause && opts.onResume) {
      items.push(
        track.paused
          ? { label: t('context.resumeTrack'), onClick: opts.onResume }
          : { label: t('context.pauseTrack'), onClick: opts.onPause }
      )
    }
    items.push({ label: t('context.skip'), onClick: opts.onSkip })
    items.push({ type: 'separator' })
  }
```

- [ ] **Step 4: Add i18n keys** — in `src/renderer/src/i18n/locales/en.ts` `context` block:
```ts
    skip: 'Skip',
    pauseTrack: 'Pause',
    resumeTrack: 'Resume',
```
and in `de.ts` `context` block (matching German style of the file):
```ts
    skip: 'Überspringen',
    pauseTrack: 'Pausieren',
    resumeTrack: 'Fortsetzen',
```

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run src/renderer/src/track-row-menu.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git diff --cached --quiet || { echo "ABORT: index not empty"; exit 1; }
git add src/renderer/src/track-row-menu.ts src/renderer/src/track-row-menu.test.ts src/renderer/src/i18n/locales/en.ts src/renderer/src/i18n/locales/de.ts
git commit -m "feat(menu): per-track skip/pause/resume context-menu items"
```

---

## Task 10: DownloadView — staging UI (resolve → list → Start)

**Files:**
- Modify: `src/renderer/src/download-view.tsx`
- Modify: `src/renderer/src/i18n/locales/en.ts`, `de.ts`

No unit test (interactive UI); verified manually in Task 11. The pure list logic is already tested (Task 8).

- [ ] **Step 1: i18n keys** — add to `download` block in `en.ts`:
```ts
    startDownload: 'Start download',
    addToQueue: 'Resolve',
    stagedHint: 'Review the list, remove or reorder tracks, then start.',
    resolving: 'Loading…',
    removeTrack: 'Remove from list',
```
and German equivalents in `de.ts`:
```ts
    startDownload: 'Download starten',
    addToQueue: 'Laden',
    stagedHint: 'Liste prüfen, Titel entfernen oder umsortieren, dann starten.',
    resolving: 'Wird geladen…',
    removeTrack: 'Aus Liste entfernen',
```

- [ ] **Step 2: Rework `DownloadView`.** The command bar action now **resolves** instead of downloading. Add staging state and render an editable list with a Start button. Key changes (apply within `download-view.tsx`):

Add props for redownload-routed staging (set by app/history):
```ts
  redownloadRequest?: { url: string; folder: string } | null
  onRedownloadConsumed?: () => void
```

Add state:
```ts
  const [staged, setStaged] = useState<{
    url: string; title: string; kind: 'playlist' | 'video'; entries: PlaylistEntry[]; folderOverride?: string
  } | null>(null)
  const [resolving, setResolving] = useState(false)
```
Import `PlaylistEntry` from `'../../shared/types'`, and `removeEntry, moveEntry` from `'./staging-list'`.

Replace `start()` with a `resolve()` that stages, plus a `startStaged()`:
```ts
  async function resolve(folderOverride?: string): Promise<void> {
    if (!valid || locked) return
    commit()
    setDismissed(true)
    setResolving(true)
    onStart() // clears prior progress + seeds the resolve log window
    try {
      const job = await window.plucker.resolveJob(trimmed)
      setStaged({ url: trimmed, title: job.title, kind: job.kind, entries: job.entries, folderOverride })
    } catch {
      // surfaced via job:status error panel
    } finally {
      setResolving(false)
    }
  }

  async function startStaged(): Promise<void> {
    if (!staged || staged.entries.length === 0) return
    const req = { ...staged }
    setStaged(null)
    setBusy(true)
    onRunningChange(true)
    try {
      await window.plucker.startDownload(req)
    } catch {
      // surfaced via job:status
    } finally {
      setBusy(false)
      onRunningChange(false)
    }
  }
```
Update `onKeyDown`'s Enter branch to call `void resolve()` instead of `start()`. Update the command-bar primary button to call `resolve()` and label it `t('download.pluck')` (resolve trigger). Update `clear()` to also `setStaged(null)`.

Consume a redownload request (navigated from History):
```ts
  useEffect(() => {
    if (!redownloadRequest) return
    setUrl(redownloadRequest.url)
    void resolve(redownloadRequest.folder)
    onRedownloadConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redownloadRequest])
```

Render priority in the body: **progress** (running job) → **staged list** → **resolving panel** → **empty hint**. Insert a staged branch before the `statusLog !== null` branch:
```tsx
      ) : staged ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[1px] text-ink-faint">
              {staged.title} · {staged.entries.length}
            </span>
            <button
              onClick={startStaged}
              disabled={staged.entries.length === 0}
              className="flex h-8 items-center gap-2 rounded-[7px] bg-accent px-4 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              <Download size={14} strokeWidth={2.2} />
              {t('download.startDownload')}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {staged.entries.map((e, pos) => (
              <StagedRow
                key={e.videoId + pos}
                entry={e}
                pos={pos}
                count={staged.entries.length}
                onRemove={() => setStaged((s) => (s ? { ...s, entries: removeEntry(s.entries, pos) } : s))}
                onMove={(to) => setStaged((s) => (s ? { ...s, entries: moveEntry(s.entries, pos, to) } : s))}
              />
            ))}
          </div>
        </div>
      ) : statusLog !== null || resolving ? (
        <ResolvePanel entries={resolveLog} />
      ) : (
```

- [ ] **Step 3: Add a `StagedRow` component** (same file, above `DownloadView`). Reorder via up/down buttons (simple, dependency-free; drag can be a later enhancement):

```tsx
function StagedRow({
  entry, pos, count, onRemove, onMove
}: {
  entry: PlaylistEntry
  pos: number
  count: number
  onRemove: () => void
  onMove: (to: number) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3 border-b border-line py-2 pl-4 pr-3 text-[12px]">
      <span className="w-[22px] font-mono text-ink-faint">{pos + 1}</span>
      <span className="flex-1 truncate text-ink">{entry.title}</span>
      <button
        aria-label="up"
        disabled={pos === 0}
        onClick={() => onMove(pos - 1)}
        className="rounded p-1 text-ink-faint hover:bg-raise hover:text-ink disabled:opacity-30"
      >
        <ChevronUp size={14} />
      </button>
      <button
        aria-label="down"
        disabled={pos === count - 1}
        onClick={() => onMove(pos + 1)}
        className="rounded p-1 text-ink-faint hover:bg-raise hover:text-ink disabled:opacity-30"
      >
        <ChevronDown size={14} />
      </button>
      <button
        aria-label={t('download.removeTrack')}
        title={t('download.removeTrack')}
        onClick={onRemove}
        className="rounded p-1 text-ink-faint hover:bg-raise hover:text-bad"
      >
        <X size={14} />
      </button>
    </div>
  )
}
```
Add `ChevronUp, ChevronDown` to the `lucide-react` import.

> **Decision recorded:** the spec calls for drag-to-reorder; this plan ships **up/down reorder** first (no drag dependency, fully keyboard/click accessible). Drag is a follow-up enhancement — note it in the PR/commit body. Functionality (user-controlled order) is delivered.

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm exec tsc --noEmit -p . && pnpm lint`
Expected: PASS (renderer `startDownload` now matches the new object signature once Task 11 fixes remaining callers).

- [ ] **Step 5: Commit**

```bash
git diff --cached --quiet || { echo "ABORT: index not empty"; exit 1; }
git add src/renderer/src/download-view.tsx src/renderer/src/i18n/locales/en.ts src/renderer/src/i18n/locales/de.ts
git commit -m "feat(download): resolve-then-stage flow with editable, reorderable track list"
```

---

## Task 11: App + History wiring — per-track paused state, redownload→stage, deck

**Files:**
- Modify: `src/renderer/src/app.tsx`, `src/renderer/src/download-view.tsx` (props), `src/renderer/src/history-view.tsx`

- [ ] **Step 1: `app.tsx` — per-track paused state + redownload request.** Add state:
```ts
  const [trackPaused, setTrackPaused] = useState<Record<number, boolean>>({})
  const [redownloadRequest, setRedownloadRequest] = useState<{ url: string; folder: string } | null>(null)
```
Subscribe to per-track pause + reset on new job:
```ts
  useEffect(
    () =>
      window.plucker.onTrackPaused((index, paused) =>
        setTrackPaused((prev) => ({ ...prev, [index]: paused }))
      ),
    []
  )
```
In the existing `onProgress` effect, when a fresh job starts (no tracks yet / overall 0) the map is stale — clear `trackPaused` in `onStart` (passed to DownloadView) and when navigating. Simplest: clear it in the `onStart` callback below.

Pass new props to `DownloadView`:
```tsx
          <DownloadView
            …
            redownloadRequest={redownloadRequest}
            onRedownloadConsumed={() => setRedownloadRequest(null)}
            onStart={() => {
              setProgress(null)
              setStatusLog([])
              setJobLogStart(logLen.current)
              setTrackPaused({})
            }}
            …
          />
```
Wire the track context-menu actions into the `TrackRow` rendered inside `DownloadView`. **The menu is built inside `download-view.tsx`** (see its `onContextMenu`), so pass `trackPaused` down to `DownloadView` and extend its `trackRowMenuItems(...)` call:
```ts
                    onSkip: () => window.plucker.skipTrack(tr.index),
                    onPause: () => window.plucker.pauseTrack(tr.index),
                    onResume: () => window.plucker.resumeTrack(tr.index),
```
and pass `status: tr.status, paused: trackPaused[tr.index] ?? false` into the `track` object given to `trackRowMenuItems`. Add a `trackPaused: Record<number, boolean>` prop to `DownloadView`.

- [ ] **Step 2: History routes redownload through staging.** In `src/renderer/src/history-view.tsx`, add a prop `onRequestRedownload(url: string, folder: string): void` to the component props and replace the body of `redownload`:
```ts
  function redownload(url: string, folder: string): void {
    onRequestRedownload(url, folder)
  }
```
In `app.tsx`, wire it on the `HistoryView`:
```tsx
          <HistoryView
            onNavigateDownload={() => { setSettingsOpen(false); setView('download') }}
            onRequestRedownload={(url, folder) => {
              setSettingsOpen(false)
              setView('download')
              setRedownloadRequest({ url, folder })
            }}
          />
```
> **Bulk track redownload** (`redownloadTargets`) stays as a direct download path but must use the new `startDownload` object API. Update each call: replace
> `await window.plucker.startDownload(watchUrl(hit.track.videoId), hit.entry.folder)`
> with a resolve-then-start so it uses the curated API:
> ```ts
> const job = await window.plucker.resolveJob(watchUrl(hit.track.videoId))
> await window.plucker.startDownload({ url: watchUrl(hit.track.videoId), title: job.title, kind: job.kind, entries: job.entries, folderOverride: hit.entry.folder })
> ```

- [ ] **Step 3: Update preload `.d.ts` surface** — none needed (types flow from `PluckerApi`). Confirm `src/preload/index.d.ts` still just re-exports `PluckerApi`.

- [ ] **Step 4: Full typecheck + lint + tests**

Run: `pnpm exec tsc --noEmit -p . && pnpm lint && pnpm test`
Expected: PASS. Fix any remaining `startDownload(string)` callers the compiler flags (search: `grep -rn "startDownload(" src/renderer`).

- [ ] **Step 5: Commit**

```bash
git diff --cached --quiet || { echo "ABORT: index not empty"; exit 1; }
git add src/renderer/src/app.tsx src/renderer/src/download-view.tsx src/renderer/src/history-view.tsx
git commit -m "feat(app): wire per-track pause state, context actions, and staged redownload"
```

---

## Task 12: Manual smoke test + final verification

**Files:** none (verification only).

- [ ] **Step 1: Build + run**

Run: `pnpm build && pnpm start` (confirm scripts in `package.json`; `pnpm dev` for HMR is also fine).

- [ ] **Step 2: Staging flow** — paste a small playlist URL, press Enter. Confirm: resolve panel → staged list appears with all entries, a "Start download" button, remove (X) and up/down per row. Remove one, reorder one, click Start. Confirm download begins in the chosen order and the removed track never downloads.

- [ ] **Step 3: Per-track skip** — during a multi-track download, right-click a downloading track → **Skip**. Confirm: that track stops, shows `skipped`, its `.part` files are gone (check the output folder + `$TMPDIR/plucker`), and the rest keep going.

- [ ] **Step 4: Per-track pause** — right-click a downloading track → **Pause**; confirm its speed drops to 0 while siblings continue; the menu now offers **Resume**; Resume restarts it. Then use the deck's global pause and confirm a still-individually-paused track stays paused after a global resume.

- [ ] **Step 5: History redownload** — from History, redownload an entry; confirm it navigates to Download and lands in the staging list (not an immediate download).

- [ ] **Step 6: Regression** — let a normal job finish; confirm history is written, the deck hides, and a single-video URL also stages then downloads.

- [ ] **Step 7: Final commit (if any verification-driven fixes)** — otherwise nothing to commit.

```bash
git diff --cached --quiet || { echo "ABORT: index not empty"; exit 1; }
# only if fixes were made:
git add <changed files>
git commit -m "fix(job): address smoke-test findings for interactive queue"
```

---

## Self-Review notes (addressed)

- **Spec coverage:** spawn groups (T1), temp-redirect/groupKey (T2), shared types (T3), transform pause threading (T4), pipeline skip+controls (T5), resolve/staged source (T6), IPC (T7), staging reducer (T8), context menu (T9), staging UI (T10), app/history wiring (T11), verification (T12). All six spec sections map to tasks.
- **Deviation — drag vs up/down reorder (T10):** the spec said drag-to-reorder; the plan ships up/down buttons first (no drag dep), delivering user-controlled order. Drag is an explicit follow-up. Flagged in-task.
- **Deviation — single `job:start` path:** the plan removes the legacy `startDownload(url)` IPC entirely; bulk history redownload now resolves-then-starts via the curated API (T11). Keeps one start path; documented.
- **Cookie handoff:** `pendingResolve` keyed by url, consumed by the next `job:start`, cleared on consume/new resolve (T7).
- **Type consistency:** `StartJobRequest`, `ResolvedJob`, `PlaylistEntry`, `JobControls`, `classifySettled`, `removeEntry`/`moveEntry`, `skipTrack`/`pauseTrack`/`resumeTrack`, `onTrackPaused` used consistently across tasks.
