// Production wiring for the media worker. Kept separate from media-client.ts
// because the `?nodeWorker` import is an electron-vite build feature that the
// unit-test runner (vitest) can't resolve — the client's tests import only the
// pure factory, never this module.
import createMediaWorker from './media-worker?nodeWorker'
import { createMediaClient, type MediaWorkerLike } from './media-client'
import type { OffThreadMedia } from './media-protocol'

let singleton: OffThreadMedia | null = null

/** App-wide media client; one worker reused across jobs. */
export function getMediaClient(): OffThreadMedia {
  if (!singleton) {
    singleton = createMediaClient(() => createMediaWorker({}) as unknown as MediaWorkerLike)
  }
  return singleton
}

export function terminateMediaClient(): void {
  singleton?.terminate()
  singleton = null
}
