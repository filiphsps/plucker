// Wire types shared between the main-thread analyze client and the worker that
// runs key/BPM analysis off the main thread. Pure types only (no runtime code),
// so importing this never pulls the worker or its deps into a bundle.
import type { AnalyzeKeyBpmConfig } from '../transforms/analyze-key-bpm'
import type { AnalysisTags } from '../tagger'

/** A log line captured in the worker, replayed by the caller into its logger. */
export interface AnalyzeLogLine {
  level: 'debug' | 'info' | 'warn'
  message: string
}

/** Result of one off-thread key/BPM analysis run. */
export interface AnalyzeOutcome {
  /** Tags the worker wrote to the file (key/camelot/bpm); empty if inconclusive. */
  tags: AnalysisTags
  /** Decoded sample count, for the caller's "decoded N samples" log. */
  samples: number
  logs: AnalyzeLogLine[]
}

/**
 * Off-thread analyzer injected into the transform services. When present, the
 * analyze-key-bpm transform offloads its decode + DSP to a worker instead of
 * blocking the Electron main thread (and thus every IPC progress event).
 */
export type OffThreadAnalyze = (
  file: string,
  config: AnalyzeKeyBpmConfig
) => Promise<AnalyzeOutcome>

/** Main → worker: analyze this file with this config. */
export interface AnalyzeWorkerRequest {
  id: number
  file: string
  config: AnalyzeKeyBpmConfig
  ffmpegPath: string
}

/** Main → worker: cancel an in-flight request (best-effort; kills its ffmpeg). */
export interface AnalyzeWorkerCancel {
  cancel: number
}

/** Worker → main: the outcome (or failure) for a request id. */
export type AnalyzeWorkerResponse =
  | { id: number; ok: true; result: AnalyzeOutcome }
  | { id: number; ok: false; error: string; logs: AnalyzeLogLine[] }
