import type { JobMeta, JobProgress } from '../../shared/types'

/** A job's renderer-side view: roster meta + the latest progress/paused state. */
export interface JobView {
  meta: JobMeta
  progress: JobProgress | null
  paused: boolean
  trackPaused: Record<number, boolean>
  /** True once the job has left the pool roster but is kept around for review. */
  finished?: boolean
}
