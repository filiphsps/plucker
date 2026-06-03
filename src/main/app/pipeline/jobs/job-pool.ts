// The scheduler. Owns the registry of jobs (queued + running), spawns/reuses job
// workers up to the unified "parallel downloads" budget, distributes that budget
// across the running set, routes jobId-keyed controls to the owning worker, and
// folds each finished job's result back via callbacks. Main stays the sole writer
// of history/settings (see onDone/onError consumers in index.ts).
import { distribute } from '@shared/distribute'
import type { JobClient, JobClientHandlers } from '@app/workers/job-client'
import type { JobProgress, JobStatus, LogEntry, JobMeta } from '@shared/types'
import type { JobResult } from '@app/app/pipeline/pipeline'
import type { JobDepsConfig, JobStartPayload } from '@app/workers/job-protocol'

/** Per-job hooks the host (index.ts) supplies to relay events to the renderer. */
export interface JobPoolHooks {
  onProgress?: (jobId: string, p: JobProgress) => void
  onStatus?: (jobId: string, s: JobStatus) => void
  onPaused?: (jobId: string, paused: boolean) => void
  onTrackPaused?: (jobId: string, index: number, paused: boolean) => void
  onLog?: (jobId: string, entry: LogEntry) => void
  onDone?: (jobId: string, payload: JobStartPayload, result: JobResult) => void
  onError?: (
    jobId: string,
    payload: JobStartPayload,
    e: { message: string; cancelled: boolean }
  ) => void
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

export interface JobPool {
  enqueue: (jobId: string, payload: JobStartPayload) => void
  cancel: (jobId: string) => void
  pause: (jobId: string) => void
  resume: (jobId: string) => void
  skipTrack: (jobId: string, index: number) => void
  pauseTrack: (jobId: string, index: number) => void
  resumeTrack: (jobId: string, index: number) => void
  roster: () => JobMeta[]
  onParallelChanged: () => void
  shutdown: () => void
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
  if (payload.kind === 'libraryEdit') return 'Edit'
  return payload.req.title || payload.req.url
}

export function createJobPool(opts: JobPoolOptions): JobPool {
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
      onLog: (entry) => opts.onLog?.(q.meta.jobId, entry),
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
    const cookieFile = 'cookieFile' in q.payload ? q.payload.cookieFile : undefined
    client.start(q.meta.jobId, q.payload, { ...base, cookieFile, initialLimit: 1 })
    rebalance() // set the real budget now that the running set changed
  }

  const pump = (): void => {
    while (running.size < Math.max(1, opts.getParallel()) && queue.length > 0) {
      startJob(queue.shift()!)
    }
  }

  return {
    enqueue(jobId, payload) {
      queue.push({
        meta: { jobId, title: titleOf(payload), kind: payload.kind, state: 'queued' },
        payload
      })
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
    onParallelChanged: () => rebalance(),
    shutdown: () => {
      for (const r of running.values()) r.client.terminate()
      running.clear()
      queue.length = 0
    }
  }
}
