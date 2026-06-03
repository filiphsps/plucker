import { describe, it, expect, vi } from 'vitest'
import { createJobPool } from './job-pool'
import type { JobClient, JobClientHandlers } from '@app/workers/job-client'

interface FakeRec {
  handlers: JobClientHandlers
  started: string[]
  limits: number[]
  cancelled: boolean
  terminated: boolean
}

/** A fake JobClient that records commands and lets the test drive its handlers. */
function makeFakeClientFactory(): {
  factory: (handlers: JobClientHandlers) => JobClient
  clients: FakeRec[]
} {
  const clients: FakeRec[] = []
  const factory = (handlers: JobClientHandlers): JobClient => {
    const rec = {
      handlers,
      started: [] as string[],
      limits: [] as number[],
      cancelled: false,
      terminated: false
    }
    clients.push(rec)
    return {
      start: (jobId: string) => rec.started.push(jobId),
      setLimit: (n: number) => rec.limits.push(n),
      cancel: () => (rec.cancelled = true),
      pause: vi.fn(),
      resume: vi.fn(),
      skipTrack: vi.fn(),
      pauseTrack: vi.fn(),
      resumeTrack: vi.fn(),
      terminate: () => (rec.terminated = true)
    }
  }
  return { factory, clients }
}

const cfg = (): {
  bin: never
  settings: never
  homeBase: string
  cacheDir: string
  jobsDir: string
} => ({
  bin: {} as never,
  settings: {} as never,
  homeBase: '/h',
  cacheDir: '/c',
  jobsDir: '/j'
})

const dl = (): { kind: 'download'; req: never } => ({ kind: 'download', req: {} as never })

describe('createJobPool', () => {
  it('runs at most N=parallel jobs and queues the rest', () => {
    const { factory, clients } = makeFakeClientFactory()
    const pool = createJobPool({
      spawn: factory,
      getParallel: () => 2,
      depsConfig: cfg,
      onRosterChange: vi.fn()
    })
    pool.enqueue('A', dl())
    pool.enqueue('B', dl())
    pool.enqueue('C', dl())
    expect(clients.filter((c) => c.started.length).length).toBe(2)
    expect(pool.roster().map((j) => j.state)).toEqual(['running', 'running', 'queued'])
  })

  it('distributes the budget across running jobs and rebalances on completion', () => {
    const { factory, clients } = makeFakeClientFactory()
    const pool = createJobPool({
      spawn: factory,
      getParallel: () => 4,
      depsConfig: cfg,
      onRosterChange: vi.fn()
    })
    pool.enqueue('A', dl())
    pool.enqueue('B', dl())
    expect(clients[0].limits.at(-1)).toBe(2)
    expect(clients[1].limits.at(-1)).toBe(2)
    clients[0].handlers.onDone?.({ title: 'A' } as never)
    expect(clients[1].limits.at(-1)).toBe(4)
  })

  it('cancelling a queued job removes it without spawning a worker', () => {
    const { factory, clients } = makeFakeClientFactory()
    const pool = createJobPool({
      spawn: factory,
      getParallel: () => 1,
      depsConfig: cfg,
      onRosterChange: vi.fn()
    })
    pool.enqueue('A', dl())
    pool.enqueue('B', dl())
    pool.cancel('B')
    expect(clients.length).toBe(1)
    expect(pool.roster().map((j) => j.jobId)).toEqual(['A'])
  })

  it('pumps the next queued job when a running one finishes', () => {
    const { factory, clients } = makeFakeClientFactory()
    const pool = createJobPool({
      spawn: factory,
      getParallel: () => 1,
      depsConfig: cfg,
      onRosterChange: vi.fn()
    })
    pool.enqueue('A', dl())
    pool.enqueue('B', dl())
    expect(clients.length).toBe(1)
    clients[0].handlers.onDone?.({ title: 'A' } as never)
    expect(clients.length).toBe(2)
  })

  it('routes cancel to the owning running job', () => {
    const { factory, clients } = makeFakeClientFactory()
    const pool = createJobPool({
      spawn: factory,
      getParallel: () => 2,
      depsConfig: cfg,
      onRosterChange: vi.fn()
    })
    pool.enqueue('A', dl())
    pool.cancel('A')
    expect(clients[0].cancelled).toBe(true)
  })
})
