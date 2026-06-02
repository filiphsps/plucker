import { describe, it, expect, vi } from 'vitest'
import { createMediaClient, type MediaWorkerLike } from './media-client'
import type { MediaWorkerRequest, MediaWorkerResponse } from './media-protocol'

/** A controllable fake worker that records posts and lets a test drive events. */
function fakeWorker(): {
  worker: MediaWorkerLike
  posted: MediaWorkerRequest[]
  emit: (event: string, arg: unknown) => void
} {
  const handlers: Record<string, ((arg: unknown) => void)[]> = {}
  const posted: MediaWorkerRequest[] = []
  const worker: MediaWorkerLike = {
    postMessage: (m) => posted.push(m),
    on: (event: string, cb: (arg: never) => void) => {
      ;(handlers[event] ??= []).push(cb as (arg: unknown) => void)
    },
    terminate: vi.fn()
  }
  const emit = (event: string, arg: unknown): void => handlers[event]?.forEach((cb) => cb(arg))
  return { worker, posted, emit }
}

describe('createMediaClient', () => {
  it('resolves a hash request when the worker replies ok, correlating by id', async () => {
    const f = fakeWorker()
    const client = createMediaClient(() => f.worker)
    const p = client.hash('a.mp3')
    expect(f.posted).toHaveLength(1)
    expect(f.posted[0]).toMatchObject({ op: 'hash', file: 'a.mp3' })
    const res: MediaWorkerResponse = { id: f.posted[0].id, ok: true, result: 'deadbeef' }
    f.emit('message', res)
    await expect(p).resolves.toBe('deadbeef')
  })

  it('rejects when the worker replies with an error', async () => {
    const f = fakeWorker()
    const client = createMediaClient(() => f.worker)
    const p = client.writeTags('a.mp3', { title: 'x' })
    f.emit('message', { id: f.posted[0].id, ok: false, error: 'boom' })
    await expect(p).rejects.toThrow('boom')
  })

  it('reuses one worker across requests and matches each reply to its caller', async () => {
    const fakes: ReturnType<typeof fakeWorker>[] = []
    const client = createMediaClient(() => {
      const f = fakeWorker()
      fakes.push(f)
      return f.worker
    })
    const p1 = client.hash('1.mp3')
    const p2 = client.hash('2.mp3')
    expect(fakes).toHaveLength(1) // single worker reused
    const f = fakes[0]
    // Reply out of order: second request first.
    f.emit('message', { id: f.posted[1].id, ok: true, result: 'two' })
    f.emit('message', { id: f.posted[0].id, ok: true, result: 'one' })
    expect(await p1).toBe('one')
    expect(await p2).toBe('two')
  })

  it('rebuilds a Buffer cover from the worker Uint8Array, or null when absent', async () => {
    const f = fakeWorker()
    const client = createMediaClient(() => f.worker)
    const p = client.readCover('a.mp3')
    f.emit('message', {
      id: f.posted[0].id,
      ok: true,
      result: { image: new Uint8Array([1, 2, 3]), mime: 'image/png' }
    })
    const cover = await p
    expect(Buffer.isBuffer(cover?.image)).toBe(true)
    expect([...(cover?.image ?? [])]).toEqual([1, 2, 3])
    expect(cover?.mime).toBe('image/png')

    const p2 = client.readCover('b.mp3')
    f.emit('message', { id: f.posted[1].id, ok: true, result: null })
    await expect(p2).resolves.toBeNull()
  })

  it('rejects all pending requests when the worker exits, then respawns', async () => {
    const fakes: ReturnType<typeof fakeWorker>[] = []
    const client = createMediaClient(() => {
      const f = fakeWorker()
      fakes.push(f)
      return f.worker
    })
    const p = client.hash('a.mp3')
    fakes[0].emit('exit', 1)
    await expect(p).rejects.toThrow(/exited/)
    // Next call spawns a fresh worker.
    void client.hash('b.mp3')
    expect(fakes).toHaveLength(2)
  })
})
