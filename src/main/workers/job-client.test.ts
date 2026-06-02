import { describe, it, expect, vi } from 'vitest'
import { createJobClient, type JobWorkerLike } from './job-client'
import type { JobWorkerCommand, JobWorkerEvent } from './job-protocol'

function fakeWorker(): JobWorkerLike & {
  emit: (e: JobWorkerEvent) => void
  emitExit: () => void
  sent: JobWorkerCommand[]
} {
  const listeners: Record<string, ((arg: unknown) => void)[]> = {}
  return {
    sent: [],
    postMessage(msg: JobWorkerCommand) {
      this.sent.push(msg)
    },
    on(event: string, cb: (arg: never) => void) {
      ;(listeners[event] ??= []).push(cb as (arg: unknown) => void)
    },
    terminate() {},
    emit(e) {
      listeners['message']?.forEach((cb) => cb(e))
    },
    emitExit() {
      listeners['exit']?.forEach((cb) => cb(0 as never))
    }
  }
}

describe('createJobClient', () => {
  it('forwards start and controls as commands', () => {
    const w = fakeWorker()
    const client = createJobClient(() => w, {})
    client.start(
      'J1',
      { kind: 'download', req: { url: 'u', title: 't', kind: 'video', entries: [] } },
      { initialLimit: 4 } as never
    )
    client.setLimit(2)
    client.pause()
    client.skipTrack(3)
    expect(w.sent[0]).toMatchObject({ type: 'start', jobId: 'J1' })
    expect(w.sent[1]).toEqual({ type: 'setLimit', limit: 2 })
    expect(w.sent[2]).toEqual({ type: 'pause' })
    expect(w.sent[3]).toEqual({ type: 'skipTrack', index: 3 })
  })

  it('routes worker events to handlers', () => {
    const w = fakeWorker()
    const onProgress = vi.fn()
    const onDone = vi.fn()
    const client = createJobClient(() => w, { onProgress, onDone })
    client.start('J1', { kind: 'download' } as never, { initialLimit: 1 } as never)
    w.emit({ type: 'progress', progress: { jobTitle: 't' } as never })
    w.emit({ type: 'done', result: { title: 't' } as never })
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ jobTitle: 't' }))
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ title: 't' }))
  })

  it('surfaces an unexpected exit as an error event', () => {
    const w = fakeWorker()
    const onError = vi.fn()
    const client = createJobClient(() => w, { onError })
    client.start('J1', { kind: 'download' } as never, { initialLimit: 1 } as never)
    w.emitExit()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ cancelled: false }))
  })
})
