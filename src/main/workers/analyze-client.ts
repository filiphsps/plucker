// Main-thread client for the analyze worker. Owns one lazily-spawned worker,
// correlates requests/responses by id, and transparently falls back (the caller
// catches a rejection and analyzes inline) if the worker errors or exits. The
// worker factory is injected so the request/lifecycle logic is unit-testable
// without spawning a real thread. The production factory (which imports the
// bundled worker via `?nodeWorker`) lives in analyze-host.ts so this module —
// and its test — never touches the electron-vite-only import.
import type { AnalyzeKeyBpmConfig } from '../transforms/analyze-key-bpm'
import type {
  AnalyzeOutcome,
  AnalyzeWorkerRequest,
  AnalyzeWorkerResponse
} from './analyze-protocol'

/** The subset of a worker_threads Worker we use; lets tests inject a fake. */
export interface WorkerLike {
  postMessage(msg: AnalyzeWorkerRequest | { cancel: number }): void
  on(event: 'message', cb: (msg: AnalyzeWorkerResponse) => void): void
  on(event: 'error', cb: (err: Error) => void): void
  on(event: 'exit', cb: (code: number) => void): void
  terminate(): void | Promise<number>
}

export interface AnalyzeClient {
  analyze(
    file: string,
    config: AnalyzeKeyBpmConfig,
    ffmpegPath: string,
    signal?: AbortSignal
  ): Promise<AnalyzeOutcome>
  terminate(): void
}

interface Pending {
  resolve: (out: AnalyzeOutcome) => void
  reject: (err: Error) => void
}

export function createAnalyzeClient(spawn: () => WorkerLike): AnalyzeClient {
  let worker: WorkerLike | null = null
  let nextId = 1
  const pending = new Map<number, Pending>()

  function failAll(err: Error): void {
    for (const p of pending.values()) p.reject(err)
    pending.clear()
    worker = null
  }

  function ensureWorker(): WorkerLike {
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
    // next analyze() spawns a fresh one — and the caller falls back to inline.
    w.on('error', (err) => failAll(err))
    w.on('exit', () => failAll(new Error('analyze worker exited')))
    worker = w
    return w
  }

  return {
    analyze(file, config, ffmpegPath, signal) {
      return new Promise<AnalyzeOutcome>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error('aborted'))
          return
        }
        const w = ensureWorker()
        const id = nextId++
        pending.set(id, { resolve, reject })
        if (signal) {
          signal.addEventListener(
            'abort',
            () => {
              if (!pending.has(id)) return
              pending.delete(id)
              w.postMessage({ cancel: id })
              reject(new Error('aborted'))
            },
            { once: true }
          )
        }
        w.postMessage({ id, file, config, ffmpegPath })
      })
    },
    terminate() {
      if (worker) worker.terminate()
      failAll(new Error('analyze client terminated'))
    }
  }
}
