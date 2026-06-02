// Production wiring for the job worker. Kept separate from job-client.ts because
// the `?nodeWorker` import is an electron-vite build feature the unit-test runner
// can't resolve — the client's tests import only the pure factory, never this.
import createJobWorker from './job-worker?nodeWorker'
import {
  createJobClient,
  type JobClient,
  type JobClientHandlers,
  type JobWorkerLike
} from './job-client'

/** Spawn a fresh job worker wired to the given handlers. */
export function spawnJobClient(handlers: JobClientHandlers): JobClient {
  return createJobClient(() => createJobWorker({}) as unknown as JobWorkerLike, handlers)
}
