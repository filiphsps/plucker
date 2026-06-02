import type { PlaylistEntry } from '../../shared/types'

/**
 * A resolved-but-not-yet-started job, staged in the rail awaiting Start. Pending
 * jobs live only in the renderer (the main-process pool runs anything enqueued
 * immediately) — they become real jobs the moment the user starts them.
 */
export interface PendingJob {
  /** Local id (e.g. `pending-1`), distinct from a backend jobId. */
  id: string
  url: string
  title: string
  kind: 'playlist' | 'video'
  entries: PlaylistEntry[]
  /** Force a specific output folder (history redownload reuses the original). */
  folderOverride?: string
}
