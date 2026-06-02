// Main-thread client for the media worker. Owns one lazily-spawned worker,
// correlates requests/responses by id, and resets (rejecting all pending) if the
// worker errors or exits so the next call spawns a fresh one. The worker factory
// is injected so the request/lifecycle logic is unit-testable without spawning a
// real thread; the production factory (which imports the bundled worker via
// `?nodeWorker`) lives in media-host.ts so this module — and its test — never
// touches the electron-vite-only import.
import type { TrackTags } from '../../shared/types'
import type {
  MediaOp,
  MediaResult,
  MediaWorkerRequest,
  MediaWorkerResponse,
  OffThreadMedia
} from './media-protocol'

/** The subset of a worker_threads Worker we use; lets tests inject a fake. */
export interface MediaWorkerLike {
  postMessage(msg: MediaWorkerRequest): void
  on(event: 'message', cb: (msg: MediaWorkerResponse) => void): void
  on(event: 'error', cb: (err: Error) => void): void
  on(event: 'exit', cb: (code: number) => void): void
  terminate(): void | Promise<number>
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
}

export function createMediaClient(spawn: () => MediaWorkerLike): OffThreadMedia {
  let worker: MediaWorkerLike | null = null
  let nextId = 1
  const pending = new Map<number, Pending>()

  function failAll(err: Error): void {
    for (const p of pending.values()) p.reject(err)
    pending.clear()
    worker = null
  }

  function ensureWorker(): MediaWorkerLike {
    if (worker) return worker
    const w = spawn()
    w.on('message', (msg) => {
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      if (msg.ok) p.resolve(msg.result)
      else p.reject(new Error(msg.error))
    })
    // A crashed/exited worker rejects every pending request and resets, so the
    // next call spawns a fresh one — and the caller falls back to the sync path.
    w.on('error', (err) => failAll(err))
    w.on('exit', () => failAll(new Error('media worker exited')))
    worker = w
    return w
  }

  function request<O extends MediaOp>(op: O): Promise<MediaResult[O['op']]> {
    return new Promise((resolve, reject) => {
      const w = ensureWorker()
      const id = nextId++
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      w.postMessage({ id, ...op } as MediaWorkerRequest)
    })
  }

  return {
    hash: (file) => request({ op: 'hash', file }),
    readTags: (file) => request({ op: 'readTags', file }),
    writeTags: (file, tags: TrackTags) => request({ op: 'writeTags', file, tags }),
    embedCover: (file, image, mime) => request({ op: 'embedCover', file, image, mime }),
    readCover: (file) =>
      request({ op: 'readCover', file }).then((c) =>
        c ? { image: Buffer.from(c.image), mime: c.mime } : null
      ),
    terminate() {
      if (worker) worker.terminate()
      failAll(new Error('media client terminated'))
    }
  }
}
