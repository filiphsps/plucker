import { describe, it, expect, vi } from 'vitest'
import { createAnalyzeClient, type WorkerLike } from './analyze-client'
import type { AnalyzeWorkerRequest, AnalyzeWorkerResponse } from './analyze-protocol'

const CONFIG = { detectKey: true, detectBpm: true, minBpm: 70, maxBpm: 180 }
const OUTCOME = { tags: { key: 'Am' }, samples: 100, logs: [] }

/** A controllable fake worker that records posts and lets a test drive events. */
function fakeWorker(): {
  worker: WorkerLike
  posted: (AnalyzeWorkerRequest | { cancel: number })[]
  emit: (event: string, arg: unknown) => void
} {
  const handlers: Record<string, ((arg: unknown) => void)[]> = {}
  const posted: (AnalyzeWorkerRequest | { cancel: number })[] = []
  const worker: WorkerLike = {
    postMessage: (m) => posted.push(m),
    on: (event: string, cb: (arg: never) => void) => {
      ;(handlers[event] ??= []).push(cb as (arg: unknown) => void)
    },
    terminate: vi.fn()
  }
  const emit = (event: string, arg: unknown): void => handlers[event]?.forEach((cb) => cb(arg))
  return { worker, posted, emit }
}

describe('createAnalyzeClient', () => {
  it('resolves a request when the worker replies ok, correlating by id', async () => {
    const f = fakeWorker()
    const client = createAnalyzeClient(() => f.worker)
    const p = client.analyze('a.mp3', CONFIG, '/ffmpeg')
    expect(f.posted).toHaveLength(1)
    const id = (f.posted[0] as AnalyzeWorkerRequest).id
    const res: AnalyzeWorkerResponse = { id, ok: true, result: OUTCOME }
    f.emit('message', res)
    await expect(p).resolves.toEqual(OUTCOME)
  })

  it('rejects when the worker replies with an error', async () => {
    const f = fakeWorker()
    const client = createAnalyzeClient(() => f.worker)
    const p = client.analyze('a.mp3', CONFIG, '/ffmpeg')
    const id = (f.posted[0] as AnalyzeWorkerRequest).id
    f.emit('message', { id, ok: false, error: 'boom', logs: [] })
    await expect(p).rejects.toThrow('boom')
  })

  it('reuses one worker across requests and matches each reply to its caller', async () => {
    const fakes: ReturnType<typeof fakeWorker>[] = []
    const client = createAnalyzeClient(() => {
      const f = fakeWorker()
      fakes.push(f)
      return f.worker
    })
    const p1 = client.analyze('1.mp3', CONFIG, '/ffmpeg')
    const p2 = client.analyze('2.mp3', CONFIG, '/ffmpeg')
    expect(fakes).toHaveLength(1) // single worker reused
    const f = fakes[0]
    const id1 = (f.posted[0] as AnalyzeWorkerRequest).id
    const id2 = (f.posted[1] as AnalyzeWorkerRequest).id
    // Reply out of order: id2 first.
    f.emit('message', { id: id2, ok: true, result: { ...OUTCOME, samples: 2 } })
    f.emit('message', { id: id1, ok: true, result: { ...OUTCOME, samples: 1 } })
    expect((await p1).samples).toBe(1)
    expect((await p2).samples).toBe(2)
  })

  it('rejects all pending requests when the worker exits, then respawns', async () => {
    const fakes: ReturnType<typeof fakeWorker>[] = []
    const client = createAnalyzeClient(() => {
      const f = fakeWorker()
      fakes.push(f)
      return f.worker
    })
    const p = client.analyze('a.mp3', CONFIG, '/ffmpeg')
    fakes[0].emit('exit', 1)
    await expect(p).rejects.toThrow(/exited/)
    // Next call spawns a fresh worker.
    void client.analyze('b.mp3', CONFIG, '/ffmpeg')
    expect(fakes).toHaveLength(2)
  })

  it('cancels an in-flight request on abort, posting a cancel message', async () => {
    const f = fakeWorker()
    const client = createAnalyzeClient(() => f.worker)
    const ac = new AbortController()
    const p = client.analyze('a.mp3', CONFIG, '/ffmpeg', ac.signal)
    const id = (f.posted[0] as AnalyzeWorkerRequest).id
    ac.abort()
    await expect(p).rejects.toThrow('aborted')
    expect(f.posted).toContainEqual({ cancel: id })
  })

  it('rejects immediately if the signal is already aborted', async () => {
    const f = fakeWorker()
    const client = createAnalyzeClient(() => f.worker)
    const ac = new AbortController()
    ac.abort()
    await expect(client.analyze('a.mp3', CONFIG, '/ffmpeg', ac.signal)).rejects.toThrow('aborted')
    expect(f.posted).toHaveLength(0)
  })
})
