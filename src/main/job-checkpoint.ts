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
export function settleEntry(entries: CheckpointEntry[], entry: CheckpointEntry): CheckpointEntry[] {
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

/**
 * Mark a checkpoint as banner-dismissed without deleting it, so the job stays
 * resumable from History but is never offered in the resume banner again. No-op
 * if the checkpoint is missing. `now` is injected (the store never calls the clock).
 */
export function dismissCheckpoint(dir: string, jobId: string, now: number): void {
  const cp = readCheckpoint(join(dir, `${jobId}.json`))
  if (!cp) return
  writeCheckpoint(dir, { ...cp, dismissed: true }, now)
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
