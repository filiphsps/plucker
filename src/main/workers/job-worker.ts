// Worker-thread entry that runs a whole job (resolve → download → transform) off
// the main thread. Self-contained: it reconstructs its own metadata cache,
// checkpoint sink, and INLINE analyze/media services (essentia WASM boots once per
// worker), and spawns/owns its own yt-dlp/ffmpeg child processes. The main process
// addresses it purely by message (see job-protocol.ts).
//
// Built as a separate main-process entry (electron.vite.config) and loaded via the
// `?nodeWorker` import in job-host.ts.
import { parentPort } from 'node:worker_threads'
import {
  runPipeline,
  buildDownloadSourceFromEntries,
  type RunJobDeps,
  type JobControls
} from '../pipeline'
import { buildRetransformSource } from '../retransform-source'
import { createMetadataCache } from '../metadata-cache'
import { createCheckpointSink } from '../job-checkpoint'
import { resumeAllChildren, pauseAllChildren } from '../spawn'
import { analyzeTrack, buildAnalyzeDeps } from '../transforms/analyze-key-bpm'
import { readTrackTags, writeTrackTags, embedCover, readCoverImage } from '../tagger'
import { hashAudioFile } from '../audio-hash'
import { addLogTransport } from '../log'
import type { OffThreadAnalyze, AnalyzeLogLine } from './analyze-protocol'
import type { OffThreadMedia } from './media-protocol'
import type { TransformLog } from '../transforms/types'
import type { JobWorkerCommand, JobWorkerEvent, JobDepsConfig, JobStartPayload } from './job-protocol'

if (!parentPort) throw new Error('job-worker must be run as a worker thread')
const port = parentPort

const emit = (e: JobWorkerEvent): void => port.postMessage(e)

// Forward this worker's log entries to the main process so the console window +
// log file still capture job output. The worker has no other transports attached
// (applyConsoleLogging only runs in main), so this is the only consumer.
addLogTransport((entry) => emit({ type: 'log', entry }))

let controls: JobControls | null = null
let limit = 1
let ffmpegPath = ''
const abort = new AbortController()

/** Inline analyze service — runs essentia on THIS worker thread. */
const analyze: OffThreadAnalyze = async (file, config) => {
  const logs: AnalyzeLogLine[] = []
  const log: TransformLog = {
    debug: (...a) => logs.push({ level: 'debug', message: a.map(String).join(' ') }),
    info: (...a) => logs.push({ level: 'info', message: a.map(String).join(' ') }),
    warn: (...a) => logs.push({ level: 'warn', message: a.map(String).join(' ') })
  }
  const deps = buildAnalyzeDeps(log, ffmpegPath, abort.signal)
  const { tags, samples } = await analyzeTrack(file, config, deps)
  return { tags, samples, logs }
}

/** Inline media service — runs node-id3 / hashing on THIS worker thread. */
const media: OffThreadMedia = {
  hash: async (file) => hashAudioFile(file),
  readTags: async (file) => readTrackTags(file),
  writeTags: async (file, tags) => writeTrackTags(file, tags),
  embedCover: async (file, image, mime) => embedCover(file, Buffer.from(image), mime),
  readCover: async (file) => readCoverImage(file),
  terminate: () => {}
}

function buildDeps(jobId: string, cfg: JobDepsConfig): RunJobDeps {
  ffmpegPath = cfg.bin.ffmpeg
  limit = cfg.initialLimit
  return {
    bin: cfg.bin,
    settings: cfg.settings,
    homeBase: cfg.homeBase,
    folderOverride: cfg.folderOverride,
    cache: createMetadataCache(cfg.cacheDir),
    checkpoint: createCheckpointSink(cfg.jobsDir, jobId, () => Date.now()),
    analyze,
    media,
    signal: abort.signal,
    getLimit: () => limit,
    onProgress: (progress) => emit({ type: 'progress', progress }),
    onStatus: (status) => emit({ type: 'status', status }),
    onControls: (c) => {
      controls = c
      c.setLimit(limit)
    }
  }
}

async function start(jobId: string, cfg: JobDepsConfig, payload: JobStartPayload): Promise<void> {
  const deps = buildDeps(jobId, cfg)
  const source =
    payload.kind === 'retransform'
      ? buildRetransformSource(payload.targets)
      : buildDownloadSourceFromEntries(payload.req, deps, cfg.cookieFile)
  try {
    const result = await runPipeline(source, deps)
    emit({ type: 'done', result })
  } catch (err) {
    emit({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      cancelled: abort.signal.aborted
    })
  }
}

port.on('message', (msg: JobWorkerCommand) => {
  switch (msg.type) {
    case 'start':
      void start(msg.jobId, msg.deps, msg.payload)
      break
    case 'setLimit':
      limit = msg.limit
      controls?.setLimit(msg.limit)
      break
    case 'cancel':
      resumeAllChildren() // clear any paused flag so children die cleanly
      abort.abort()
      break
    case 'pause':
      pauseAllChildren()
      emit({ type: 'paused', paused: true })
      break
    case 'resume':
      resumeAllChildren()
      emit({ type: 'paused', paused: false })
      break
    case 'skipTrack':
      controls?.skipTrack(msg.index)
      break
    case 'pauseTrack':
      controls?.pauseTrack(msg.index)
      emit({ type: 'trackPaused', index: msg.index, paused: true })
      break
    case 'resumeTrack':
      controls?.resumeTrack(msg.index)
      emit({ type: 'trackPaused', index: msg.index, paused: false })
      break
  }
})
