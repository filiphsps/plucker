// Worker-thread entry for key/BPM analysis. Runs the same `analyzeTrack`
// orchestration the inline path uses — ffmpeg decode + Essentia/fallback DSP +
// tag writing — but on a worker thread so the multi-second WASM compute never
// blocks the Electron main thread (and thus the job's progress IPC).
//
// Built as a separate main-process entry (see electron.vite.config) and loaded
// from beside index.js at runtime.
import { parentPort } from 'node:worker_threads'
import { analyzeTrack, buildAnalyzeDeps } from '../transforms/analyze-key-bpm'
import type { TransformLog } from '../transforms/types'
import type {
  AnalyzeLogLine,
  AnalyzeWorkerCancel,
  AnalyzeWorkerRequest,
  AnalyzeWorkerResponse
} from './analyze-protocol'

if (!parentPort) throw new Error('analyze-worker must be run as a worker thread')
const port = parentPort

/** Abort controllers for in-flight requests, so the client can cancel decode. */
const inFlight = new Map<number, AbortController>()

function isCancel(msg: AnalyzeWorkerRequest | AnalyzeWorkerCancel): msg is AnalyzeWorkerCancel {
  return 'cancel' in msg
}

port.on('message', async (msg: AnalyzeWorkerRequest | AnalyzeWorkerCancel) => {
  if (isCancel(msg)) {
    inFlight.get(msg.cancel)?.abort()
    return
  }

  const logs: AnalyzeLogLine[] = []
  const log: TransformLog = {
    debug: (...a) => logs.push({ level: 'debug', message: a.map(String).join(' ') }),
    info: (...a) => logs.push({ level: 'info', message: a.map(String).join(' ') }),
    warn: (...a) => logs.push({ level: 'warn', message: a.map(String).join(' ') })
  }
  const controller = new AbortController()
  inFlight.set(msg.id, controller)
  try {
    const deps = buildAnalyzeDeps(log, msg.ffmpegPath, controller.signal)
    const { tags, samples } = await analyzeTrack(msg.file, msg.config, deps)
    const res: AnalyzeWorkerResponse = { id: msg.id, ok: true, result: { tags, samples, logs } }
    port.postMessage(res)
  } catch (err) {
    const res: AnalyzeWorkerResponse = { id: msg.id, ok: false, error: String(err), logs }
    port.postMessage(res)
  } finally {
    inFlight.delete(msg.id)
  }
})
