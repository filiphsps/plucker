// Main-thread handle around one job worker. Owns a lazily-spawned worker, forwards
// commands, and fans worker events out to injected handlers. The worker factory is
// injected so this logic is unit-testable without a real thread; the production
// factory (which imports the bundled worker via `?nodeWorker`) lives in job-host.ts.
import type { JobProgress, JobStatus, LogEntry } from '@shared/types'
import type { JobResult } from '@app/app/pipeline/pipeline'
import type {
  JobDepsConfig,
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
  onLog?: (entry: LogEntry) => void
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
        handlers.onLog?.(msg.entry)
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
