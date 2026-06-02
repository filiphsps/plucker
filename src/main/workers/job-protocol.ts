// Wire types shared between the main-thread job client/pool and the worker that
// runs a whole job (resolve → download → transform) off the main thread. Pure
// types only, so importing this never pulls the worker or pipeline into a bundle.
import type {
  JobProgress,
  JobStatus,
  StartJobRequest,
  Settings,
  LogEntry,
  JobKind,
  JobState,
  JobMeta
} from '../../shared/types'
import type { BinaryPaths } from '../binaries'
import type { JobResult } from '../pipeline'
import type { RetransformTarget } from '../retransform-source'
import type { IndexedTrack } from '../resume-merge'
import type { TransformInstance } from '../../shared/transforms'

export type { JobKind, JobState, JobMeta }

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

/**
 * What a `start` message carries for each job kind. The worker only reads `req`
 * (download/resume/retryFailed all build a download source) or `targets`
 * (retransform); the remaining fields are context the MAIN process needs to fold
 * the result back into history (merge for resume, in-place overwrite for retry).
 */
export type JobStartPayload =
  | { kind: 'download'; req: StartJobRequest; cookieFile?: string }
  | { kind: 'resume'; req: StartJobRequest; cookieFile?: string; completed: IndexedTrack[] }
  | { kind: 'retryFailed'; req: StartJobRequest; entryId: string; failedIndices: number[] }
  | { kind: 'retransform'; targets: RetransformTarget[] }
  | {
      kind: 'libraryEdit'
      trackId: string
      branchId: string
      parentVersionId: string
      sourceFile: string
      chain: TransformInstance[]
    }

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
  | { type: 'log'; entry: LogEntry }
  | { type: 'done'; result: JobResult }
  | { type: 'error'; message: string; cancelled: boolean }
