import type { JobMeta, JobProgress } from '../../shared/types'

/** A job's renderer-side view: roster meta + the latest progress/paused state. */
export interface JobView {
  meta: JobMeta
  progress: JobProgress | null
  paused: boolean
  trackPaused: Record<number, boolean>
}
