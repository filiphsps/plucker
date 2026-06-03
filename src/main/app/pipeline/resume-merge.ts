import { existsSync } from 'node:fs'
import type { CheckpointEntry, HistoryEntry, HistoryTrack, JobCheckpoint } from '@shared/types'

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
export function synthesizeEntry(cp: JobCheckpoint, id: string, completedAt: string): HistoryEntry {
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
