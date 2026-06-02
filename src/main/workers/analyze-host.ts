// Production wiring for the analyze worker. Kept separate from analyze-client.ts
// because the `?nodeWorker` import is an electron-vite build feature that the
// unit-test runner (vitest) can't resolve — the client's tests import only the
// pure factory, never this module.
import createAnalyzeWorker from './analyze-worker?nodeWorker'
import { createAnalyzeClient, type AnalyzeClient, type WorkerLike } from './analyze-client'

let singleton: AnalyzeClient | null = null

/** App-wide analyze client; one worker reused across jobs (boots WASM once). */
export function getAnalyzeClient(): AnalyzeClient {
  if (!singleton) {
    singleton = createAnalyzeClient(() => createAnalyzeWorker({}) as unknown as WorkerLike)
  }
  return singleton
}

export function terminateAnalyzeClient(): void {
  singleton?.terminate()
  singleton = null
}
