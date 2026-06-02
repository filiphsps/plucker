import { mkdirSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type {
  Settings,
  JobProgress,
  JobStatus,
  JobOutcome,
  TrackProgress,
  HistoryTrack,
  PlaylistEntry,
  ResolvedJob,
  StartJobRequest
} from '../shared/types'

export type { PlaylistEntry, ResolvedJob } from '../shared/types'
import { watchUrl } from '../shared/youtube-url'
import { sanitizeFileName } from './rename'
import {
  buildDownloadArgs,
  runYtDlp,
  priorityToNice,
  type ProgressEvent,
  type SpawnResult
} from './ytdlp'
import { spawnManaged, killGroup, pauseGroup, resumeGroup } from './spawn'
import {
  needsCookieEscalation,
  isCookiePermissionError,
  exportBrowserCookies,
  cleanupCookieFile
} from './cookies'
import { buildRegistry } from './transforms/registry'
import { runTransformChain } from './transforms/run-chain'
import { transformLog } from './transforms/transform-logger'
import { createPool } from './pool'
import { startSpan, timed } from './bench'
import { log } from './log'
import { hashAudioFile } from './audio-hash'
import { probeAudio } from './audio-meta'
import { extractSourceMetadata, type SourceMetadata } from './source-metadata'
import type { MetadataCache } from './metadata-cache'
import type { OffThreadAnalyze } from './workers/analyze-protocol'
import type { OffThreadMedia } from './workers/media-protocol'
import type { BinaryPaths } from './binaries'
import type { JobCheckpointSink } from './job-checkpoint'

export function destFolderFor(
  base: string,
  jobTitle: string,
  perPlaylistSubfolder: boolean,
  kind: 'playlist' | 'video'
): string {
  if (kind === 'video' || !perPlaylistSubfolder) return base
  return join(base, sanitizeFileName(jobTitle))
}

/** Pure: turn a yt-dlp --dump-single-json object into kind/title/entries. */
export function parseEntries(json: {
  _type?: string
  title?: string
  id?: string
  webpage_url?: string
  entries?: Array<{ id?: string; title?: string; url?: string }>
}): ResolvedJob {
  const isPlaylist = json._type === 'playlist' || Array.isArray(json.entries)
  if (isPlaylist) {
    const entries: PlaylistEntry[] = (json.entries ?? []).map((e, i) => ({
      videoId: e.id ?? String(i + 1),
      title: e.title ?? e.id ?? `Track ${i + 1}`,
      index: i + 1,
      url: e.url
    }))
    return { kind: 'playlist', title: json.title ?? 'Plucker', entries }
  }
  return {
    kind: 'video',
    title: json.title ?? 'Plucker',
    entries: [
      { videoId: json.id ?? '1', title: json.title ?? 'Plucker', index: 1, url: json.webpage_url }
    ]
  }
}

/**
 * Resolve playlist/video metadata via yt-dlp --dump-single-json.
 *
 * Uses async `spawn` (never `spawnSync`) so the Electron main process keeps
 * pumping its event loop — IPC, progress events and window controls — while
 * yt-dlp resolves. A synchronous spawn here is what froze the whole UI at the
 * start of every job on slow machines.
 */
/** Verbose yt-dlp stderr is noisy: drop the `[debug]` env dump and blank lines,
 *  keep extraction/progress/info/warning/error lines for the status panel. */
export function isRelevantStatusLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  if (t.startsWith('[debug] ')) return false
  return true
}

export async function resolvePlaylist(
  ytdlpPath: string,
  url: string,
  onLine?: (line: string) => void,
  signal?: AbortSignal,
  cookieArgs: string[] = []
): Promise<ResolvedJob> {
  const { stdout, stderr, code, error } = await new Promise<{
    stdout: string
    stderr: string
    code: number
    error?: Error
  }>((resolve) => {
    // `--verbose` makes yt-dlp emit extraction progress on stderr; stdout stays
    // pure JSON. Lines are forwarded (filtered) to `onLine` for the status panel.
    // Managed + signal-aware so cancelling during resolution force-kills it.
    const child = spawnManaged(
      ytdlpPath,
      ['--verbose', '--flat-playlist', '--dump-single-json', ...cookieArgs, url],
      {},
      signal
    )
    let stdout = ''
    let stderr = ''
    let pending = ''
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
      pending += d.toString()
      const parts = pending.split('\n')
      pending = parts.pop() ?? ''
      for (const ln of parts) if (onLine && isRelevantStatusLine(ln)) onLine(ln.trim())
    })
    child.on('error', (error) => resolve({ stdout, stderr, code: -1, error }))
    child.on('close', (c) => {
      if (onLine && isRelevantStatusLine(pending)) onLine(pending.trim())
      resolve({ stdout, stderr, code: c ?? -1 })
    })
  })
  if (error) throw new Error(`yt-dlp failed to start: ${error.message}`)
  if (code !== 0) throw new Error(stderr.slice(-2000) || `yt-dlp exited ${code}`)
  if (!stdout.trim()) throw new Error('yt-dlp returned no metadata')
  return parseEntries(JSON.parse(stdout))
}

/** Read a yt-dlp `.info.json` sidecar for the canonical id + title + full source metadata. */
function readSidecar(path: string): { id?: string; title?: string; source?: SourceMetadata } {
  if (!existsSync(path)) return {}
  try {
    const info = JSON.parse(readFileSync(path, 'utf8'))
    return {
      id: typeof info.id === 'string' ? info.id : undefined,
      title: typeof info.title === 'string' ? info.title : undefined,
      source: extractSourceMetadata(info)
    }
  } catch {
    return {}
  }
}

/** Per-track controls handed to the IPC layer for a live job. */
export interface JobControls {
  skipTrack(index: number): void
  pauseTrack(index: number): void
  resumeTrack(index: number): void
}

export interface RunJobDeps {
  bin: BinaryPaths
  settings: Settings
  homeBase: string
  onProgress: (p: JobProgress) => void
  /** Pre-resolution lifecycle status (resolving phase + console lines). */
  onStatus?: (s: JobStatus) => void
  mbFetch?: typeof fetch
  signal?: AbortSignal
  /** When set, download into this exact folder instead of deriving from base/title. */
  folderOverride?: string
  /** Content-addressed metadata cache; enables reuse of audio probes + auto-tag. */
  cache?: MetadataCache
  /** Off-thread key/BPM analyzer; keeps the main thread responsive during DSP. */
  analyze?: OffThreadAnalyze
  /** Off-thread media I/O (ID3 tags + audio hashing); keeps the main thread free. */
  media?: OffThreadMedia
  /** Receives a controls handle once the track list exists, for skip/pause/resume IPC. */
  onControls?: (controls: JobControls) => void
  /** Durable resume checkpoint; persists per-track terminal state during the run. */
  checkpoint?: JobCheckpointSink
}

export interface JobResult {
  title: string
  folder: string
  url: string
  kind: 'playlist' | 'video'
  /** Overall job outcome for the history badge. */
  outcome: JobOutcome
  /** Every terminal track (done/failed/skipped/cancelled), in playlist order. */
  tracks: HistoryTrack[]
}

/** A track is settled once it reaches one of these — anything else is still in flight. */
const TERMINAL_STATUSES: ReadonlySet<TrackProgress['status']> = new Set([
  'done',
  'failed',
  'skipped'
])

/**
 * Backstop run after the pool drains: any track still in a non-terminal state
 * (`queued`/`downloading`/`transforming`) never reached done/failed/skipped, so
 * count it as failed. Without this a track that threw mid-transform stays
 * `transforming` forever, which the UI reads as a live job — pinning the deck in
 * a "downloading" state with nothing left to cancel. Mutates in place and
 * returns the tracks it rescued so the caller can log them.
 */
export function finalizePendingTracks(tracks: TrackProgress[]): TrackProgress[] {
  const rescued: TrackProgress[] = []
  for (const t of tracks) {
    if (TERMINAL_STATUSES.has(t.status)) continue
    t.status = 'failed'
    t.stage = undefined
    t.reason = t.reason ?? 'Download failed'
    rescued.push(t)
  }
  return rescued
}

/**
 * Settle a track that just came out of an aborted/finished stage. A user skip
 * wins over the generic fallback (failed) but never over a job-wide cancel —
 * that case is left untouched for {@link markCancelledTracks} to relabel.
 */
export function classifySettled(
  t: TrackProgress,
  opts: { skipRequested: boolean; jobAborted: boolean; fallback: TrackProgress['status'] }
): void {
  if (opts.jobAborted) return
  if (opts.skipRequested) {
    t.status = 'skipped'
    t.stage = undefined
    t.reason = 'Skipped by user'
    return
  }
  t.status = opts.fallback
}

/**
 * When a job is aborted, relabel every track that did not finish (anything other
 * than `done` or an intentional `skipped`) as `cancelled` — so history can tell
 * user cancellation apart from genuine failures. Mutates in place.
 */
export function markCancelledTracks(tracks: TrackProgress[]): void {
  for (const t of tracks) {
    if (t.status === 'done' || t.status === 'skipped') continue
    t.status = 'cancelled'
    t.stage = undefined
    t.reason = undefined
  }
}

/**
 * Build the history track list from the final pipeline state. Successfully
 * downloaded tracks reuse the rich record collected during the run (file + tags
 * + hash); every other terminal track is recorded minimally with its status and
 * failure reason so the row still shows up, just without a file.
 */
export function toHistoryTracks(
  tracks: TrackProgress[],
  byIndex: (HistoryTrack | undefined)[]
): HistoryTrack[] {
  return tracks.map((t) => {
    const done = byIndex[t.index - 1]
    if (done) return done
    return {
      title: t.title,
      status: (t.status === 'failed' || t.status === 'skipped' || t.status === 'cancelled'
        ? t.status
        : 'failed') as HistoryTrack['status'],
      reason: t.reason,
      errorCode: t.errorCode,
      videoId: t.videoId
    }
  })
}

/** Derive the overall job outcome from the recorded tracks. */
export function jobOutcome(tracks: HistoryTrack[], aborted: boolean): JobOutcome {
  if (aborted) return 'cancelled'
  const failed = tracks.filter((t) => t.status === 'failed').length
  const done = tracks.filter((t) => t.status === 'done').length
  if (failed === 0) return 'completed' // all done and/or intentionally skipped
  if (done === 0) return 'failed' // nothing succeeded
  return 'partial'
}

/** How a finished yt-dlp download for one entry should be classified. */
export type DownloadClassification =
  | { kind: 'done'; file: string }
  | { kind: 'skipped'; reason: 'below minimum quality' }
  | { kind: 'failed'; reason: string }

/**
 * Decide a single download's terminal status from its yt-dlp result.
 *
 * The subtle case is `skipped`: yt-dlp emits "Requested format is not available"
 * whenever the format selector matches nothing, but that only means *below minimum
 * quality* when we actually asked for a source-bitrate floor (`-f ba[abr>=N]`, no
 * fallback). With no floor configured (`minBitrate == null`) that same message is a
 * real extraction failure — a restricted/geo response, a video yt-dlp can't read, a
 * stale extractor — and must surface as a failure, not be disguised as a quality skip.
 */
export function classifyDownload(
  downloadedFile: string | null,
  result: Pick<SpawnResult, 'skipped' | 'errors'>,
  minBitrate: number | null
): DownloadClassification {
  if (downloadedFile) return { kind: 'done', file: downloadedFile }
  if (result.skipped.length > 0 && minBitrate != null) {
    return { kind: 'skipped', reason: 'below minimum quality' }
  }
  // parseErrorLine excludes the format-not-available line, so when that was the only
  // signal `errors` is empty — give an honest reason instead of a bare "Download failed".
  const reason =
    result.errors[result.errors.length - 1]?.message ??
    (result.skipped.length > 0 ? 'No downloadable audio format found' : 'Download failed')
  return { kind: 'failed', reason }
}

/** 0..1 progress for one track: download weighted 0.8, transforms 0.2. */
function trackProgress(t: TrackProgress): number {
  if (t.status === 'done' || t.status === 'failed' || t.status === 'skipped') return 1
  return ((t.percent ?? 0) / 100) * 0.8 + ((t.transformPercent ?? 0) / 100) * 0.2
}

/** Outcome of acquiring one entry's local file (download, or already on disk). */
export type ProvideOutcome =
  | { kind: 'file'; file: string }
  | { kind: 'skipped'; reason: string }
  | { kind: 'failed'; reason: string; errorCode?: string }

/** One work item: where its output goes + how to obtain its local file. */
export interface SourceEntry {
  index: number
  title: string
  videoId?: string
  /** Per-entry destination folder (the transform chain commits here). */
  destFolder: string
  /**
   * Acquire the local working file for this entry. `report` flushes a progress
   * frame to the deck; `provide` may update `t` (title/percent/speed) as it goes.
   * `tempDir`, when given, is a per-track scratch dir for partial/intermediate
   * files so a skipped/killed acquire leaves nothing in the shared output folder.
   */
  provide(
    t: TrackProgress,
    report: () => void,
    signal?: AbortSignal,
    tempDir?: string
  ): Promise<ProvideOutcome>
}

/** A pluggable acquire phase. `entries()` is called after `resolve()`. */
export interface JobSource {
  resolve(signal?: AbortSignal): Promise<{ title: string; kind: 'playlist' | 'video'; url: string }>
  entries(): SourceEntry[]
  /** Release any resources held across the run (e.g. an exported cookie file). */
  cleanup?(): void
}

/**
 * Run a job against a pluggable {@link JobSource}: resolve → acquire each entry's
 * file → transform/probe/cache it as it lands. The download path and the in-place
 * re-transform path are just different sources over this same engine.
 */
export async function runPipeline(source: JobSource, deps: RunJobDeps): Promise<JobResult> {
  const { bin, settings, onProgress, signal } = deps
  const jobSpan = startSpan('job', 'pipeline')
  // Per-track scratch root; partial/intermediate download files live here so a
  // skipped/killed track leaves nothing in the shared output folder. Declared at
  // function scope so the outer `finally` can always reap it.
  let tempRoot = ''

  try {
    const resolved = await source.resolve(signal)
    const entries = source.entries()
    for (const dir of new Set(entries.map((e) => e.destFolder))) {
      mkdirSync(dir, { recursive: true })
    }
    const repFolder = entries[0]?.destFolder ?? ''

    // Pre-populate every entry as queued so the whole list shows immediately.
    const tracks: TrackProgress[] = entries.map((e) => ({
      index: e.index,
      title: e.title,
      videoId: e.videoId,
      status: 'queued',
      percent: 0,
      transformPercent: 0
    }))

    // Seed the durable resume checkpoint with the full (all-queued) track list, so a
    // crash mid-run leaves a record of what this job intended to do.
    deps.checkpoint?.begin({
      url: resolved.url,
      folder: repFolder,
      jobTitle: resolved.title,
      kind: resolved.kind,
      entries: tracks.map((t) => ({
        index: t.index,
        videoId: t.videoId,
        title: t.title,
        status: t.status
      }))
    })

    // Per-track abort + skip bookkeeping. Each track gets its own controller,
    // combined with the job signal so a skip aborts just that track's work.
    const trackAbort = new Map<number, AbortController>()
    const skipRequested = new Set<number>()
    for (const t of tracks) trackAbort.set(t.index, new AbortController())
    const signalFor = (index: number): AbortSignal | undefined => {
      const ac = trackAbort.get(index)
      if (!ac) return signal
      return signal ? AbortSignal.any([signal, ac.signal]) : ac.signal
    }

    tempRoot = join(tmpdir(), 'plucker', randomUUID())
    const tempDirFor = (index: number): string => join(tempRoot, String(index))

    deps.onControls?.({
      skipTrack(index) {
        skipRequested.add(index)
        trackAbort.get(index)?.abort()
        killGroup(index)
      },
      pauseTrack(index) {
        pauseGroup(index)
      },
      resumeTrack(index) {
        resumeGroup(index)
      }
    })

    const overall = (): number =>
      tracks.length ? tracks.reduce((sum, t) => sum + trackProgress(t), 0) / tracks.length : 0
    // Assigned once the checkpoint flush is wired (after historyByIndex exists); the
    // first emit() below runs before then and harmlessly hits this no-op.
    let afterEmit: () => void = () => {}
    const emit = (): void => {
      onProgress({
        jobTitle: resolved.title,
        total: tracks.length,
        tracks: [...tracks],
        folder: repFolder,
        url: resolved.url,
        overall: overall()
      })
      afterEmit()
    }
    emit()

    const registry = buildRegistry()
    const enabled = settings.transforms.filter((i) => i.enabled)
    const services = {
      bin,
      fetch: deps.mbFetch ?? fetch,
      signal,
      log: transformLog(),
      cache: deps.cache,
      analyze: deps.analyze,
      media: deps.media
    }
    // Two independent stages, each with its own concurrency budget, so the
    // pipeline behaves like decoupled worker queues: a slow transform never holds
    // a download slot (and a slow download never holds a transform slot). The
    // download stage (I/O-bound: yt-dlp child processes) feeds the transform stage
    // (CPU-bound, now mostly off-thread) the moment each file lands, so both run
    // concurrently instead of competing for a single shared pool.
    const limit = Math.max(1, settings.performance.parallel)
    const downloadPool = createPool(limit)
    const transformPool = createPool(limit)
    // Collect history by track index so the recorded order is stable regardless
    // of which concurrent track finishes first.
    const historyByIndex: (HistoryTrack | undefined)[] = new Array(tracks.length)

    // Persist each track to the resume checkpoint the first time it reaches a terminal
    // status, so a crash mid-run leaves a resumable record. Driven off emit() (which
    // fires after every state change) and de-duped via `settledIndices`.
    const settledIndices = new Set<number>()
    const CHECKPOINT_TERMINAL: ReadonlySet<TrackProgress['status']> = new Set([
      'done',
      'failed',
      'skipped',
      'cancelled'
    ])
    const flushCheckpoint = (): void => {
      if (!deps.checkpoint) return
      for (const t of tracks) {
        if (!CHECKPOINT_TERMINAL.has(t.status) || settledIndices.has(t.index)) continue
        settledIndices.add(t.index)
        deps.checkpoint.settle({
          index: t.index,
          videoId: t.videoId,
          title: t.title,
          status: t.status,
          track:
            historyByIndex[t.index - 1] ??
            ({
              title: t.title,
              status: (t.status === 'failed' || t.status === 'skipped' || t.status === 'cancelled'
                ? t.status
                : 'failed') as HistoryTrack['status'],
              reason: t.reason,
              errorCode: t.errorCode,
              videoId: t.videoId
            } satisfies HistoryTrack)
        })
      }
    }
    afterEmit = flushCheckpoint

    /** Hash + transform an acquired file, updating the track + history. */
    const finishTrack = async (
      t: TrackProgress,
      filePath: string,
      entry: SourceEntry
    ): Promise<void> => {
      const sidecarPath = filePath.replace(/\.mp3$/i, '.info.json')
      const sidecar = readSidecar(sidecarPath)
      // Per-track services: a skip aborts only this track's transform, and its
      // ffmpeg children register under this track's group so per-track pause works.
      const trackSig = signalFor(t.index)
      const trackServices = { ...services, signal: trackSig, groupKey: t.index }
      // Hash the audio frames once (tag-independent), so auto-tag + probe can reuse
      // cached results and history can point straight at the cache entry.
      t.speedBytesPerSec = undefined
      let hash: string | undefined
      try {
        t.stage = 'hashing'
        emit()
        hash = await timed('hash', 'pipeline', () =>
          deps.media ? deps.media.hash(filePath) : hashAudioFile(filePath)
        )
        t.hash = hash
      } catch {
        /* unreadable file — proceed without a cache key */
      }
      t.status = 'transforming'
      t.percent = 100
      t.transformPercent = 0
      emit()

      // Sidecar identity is canonical for a fresh download; the re-transform source
      // has no sidecar, so fall back to the entry's recorded id/title.
      const videoId = sidecar.id ?? entry.videoId
      const transformSpan = startSpan('transform-chain', 'pipeline')
      const res = await runTransformChain(
        filePath,
        entry.destFolder,
        {
          videoId,
          rawTitle: sidecar.title ?? entry.title ?? t.title,
          sourceFile: filePath,
          index: t.index,
          contentHash: hash,
          source: sidecar.source
        },
        enabled,
        registry,
        trackServices,
        (f) => {
          t.transformPercent = Math.round(f * 100)
          emit()
        },
        (stage) => {
          t.stage = stage
          emit()
        }
      )
      transformSpan.end(t.title)
      if (existsSync(sidecarPath)) rmSync(sidecarPath, { force: true })
      if (res.failed) {
        t.status = 'failed'
        t.stage = undefined
        t.reason = res.reason
        log.warn('transform', `transform failed for "${t.title}": ${res.reason}`)
        emit()
        return
      }
      if (res.outputFile !== filePath && existsSync(filePath)) rmSync(filePath, { force: true })
      // Probe technical audio properties once and cache them by content hash;
      // a cache hit (re-download of identical audio) skips the ffmpeg probe.
      // Also record the track's display identity so the cache manager can list it.
      if (hash && deps.cache) {
        if (!deps.cache.read(hash)?.audio) {
          let sizeBytes: number | undefined
          try {
            sizeBytes = statSync(res.outputFile).size
          } catch {
            /* stat failed — leave size undefined */
          }
          t.stage = 'probing'
          emit()
          deps.cache.writeAudio(hash, {
            ...(await timed('probe', 'pipeline', () =>
              probeAudio(bin.ffmpeg, res.outputFile, trackSig)
            )),
            sizeBytes
          })
        }
        deps.cache.writeTrack(hash, {
          title: res.tags.title ?? t.title,
          file: res.outputFile,
          videoId
        })
      }
      t.status = 'done'
      t.stage = undefined
      t.file = res.outputFile
      t.artist = res.tags.artist
      t.album = res.tags.album
      t.year = res.tags.year
      if (res.tags.title) t.title = res.tags.title
      t.transformPercent = 100
      historyByIndex[t.index - 1] = {
        status: 'done',
        file: res.outputFile,
        title: res.tags.title ?? t.title,
        artist: res.tags.artist,
        album: res.tags.album,
        year: res.tags.year,
        videoId,
        hash
      }
      log.info('app', `track done: ${t.title}`)
      emit()
    }

    /** Run the transform stage for an acquired file on the transform pool. */
    const runTransformStage = (
      entry: SourceEntry,
      t: TrackProgress,
      file: string,
      trackSpan: ReturnType<typeof startSpan>
    ): void => {
      transformPool.run(async () => {
        // A throw inside finishTrack (hash/transform/probe) would otherwise leave the
        // track stuck in `transforming`. Mark it failed here so the row settles
        // immediately rather than waiting on the end-of-job backstop.
        try {
          await finishTrack(t, file, entry)
          t.elapsedMs = Math.round(trackSpan.end(t.title))
        } catch (err) {
          // A skip during transform aborts the chain — settle as skipped, not failed.
          classifySettled(t, {
            skipRequested: skipRequested.has(t.index),
            jobAborted: signal?.aborted ?? false,
            fallback: 'failed'
          })
          if (t.status === 'failed') {
            t.reason = t.reason ?? (err instanceof Error ? err.message : 'Transform failed')
          }
          t.elapsedMs = Math.round(trackSpan.end(`${t.title} (${t.status})`))
          log.warn('transform', `track ${t.status} "${t.title}": ${t.reason}`)
        }
        emit()
      })
    }

    /**
     * Download stage: acquire one entry's file via the source. On success, hand it
     * off to the transform stage (its own pool) and return immediately — freeing
     * this download slot to start the next entry while the transform runs.
     */
    const acquireEntry = async (entry: SourceEntry, t: TrackProgress): Promise<void> => {
      const trackSpan = startSpan('track-process', 'pipeline')
      const tempDir = tempDirFor(t.index)
      mkdirSync(tempDir, { recursive: true })
      const outcome = await entry.provide(t, emit, signalFor(t.index), tempDir)
      // Reap this track's scratch dir as soon as the download stage ends, so a
      // skipped/killed download leaves no orphaned `.part` files behind.
      rmSync(tempDir, { recursive: true, force: true })
      t.stage = undefined
      t.speedBytesPerSec = undefined
      // A user skip during download settles as 'skipped', regardless of how the
      // killed yt-dlp's exit code was otherwise classified.
      if (skipRequested.has(t.index) && !(signal?.aborted ?? false)) {
        t.status = 'skipped'
        t.reason = 'Skipped by user'
        t.elapsedMs = Math.round(trackSpan.end(`${t.title} (skipped)`))
        emit()
        return
      }
      if (outcome.kind === 'skipped') {
        t.status = 'skipped'
        t.reason = outcome.reason
        t.elapsedMs = Math.round(trackSpan.end(`${t.title} (skipped)`))
        emit()
        return
      }
      if (outcome.kind === 'failed') {
        t.status = 'failed'
        t.reason = outcome.reason
        if (outcome.errorCode) t.errorCode = outcome.errorCode
        t.elapsedMs = Math.round(trackSpan.end(`${t.title} (failed)`))
        emit()
        return
      }
      runTransformStage(entry, t, outcome.file, trackSpan)
    }

    // Kick off every download on the download pool. Each acquireEntry enqueues its
    // transform on the transform pool before resolving, so once downloads drain,
    // every transform has been queued — then drain transforms.
    entries.forEach((entry, i) => downloadPool.run(() => acquireEntry(entry, tracks[i])))
    await downloadPool.drain()
    await transformPool.drain()

    const aborted = signal?.aborted ?? false
    if (aborted) {
      // User cancelled: relabel every unfinished track as cancelled (distinct from
      // a genuine failure) so the history badge and rows read correctly.
      markCancelledTracks(tracks)
    } else {
      // Safety net: a slot that threw before assigning a terminal status (e.g. a
      // throw during transform/probe) counts as failed, so the job always settles
      // to idle once every track has been attempted.
      for (const t of finalizePendingTracks(tracks)) {
        log.warn('app', `track did not complete "${t.title}": ${t.reason}`)
      }
    }
    emit()

    // Record every terminal track (not just the successes) so failed/cancelled
    // attempts still appear in history, clearly marked.
    const history = toHistoryTracks(tracks, historyByIndex)
    const outcome = jobOutcome(history, aborted)

    const doneCount = tracks.filter((t) => t.status === 'done').length
    const failedCount = tracks.filter((t) => t.status === 'failed').length
    const skippedCount = tracks.filter((t) => t.status === 'skipped').length
    const cancelledCount = tracks.filter((t) => t.status === 'cancelled').length
    jobSpan.end(`${doneCount} done, ${failedCount} failed, ${skippedCount} skipped`)
    log.info(
      'app',
      `job ${outcome} "${resolved.title}": ${doneCount} done, ${failedCount} failed, ${skippedCount} skipped, ${cancelledCount} cancelled`
    )

    return {
      title: resolved.title,
      folder: repFolder,
      url: resolved.url,
      kind: resolved.kind,
      outcome,
      tracks: history
    }
  } finally {
    source.cleanup?.()
    // Backstop: reap any per-track scratch dirs the per-track cleanup missed
    // (e.g. a throw before the download stage's own rmSync).
    if (tempRoot) {
      try {
        rmSync(tempRoot, { recursive: true, force: true })
      } catch {
        /* already gone */
      }
    }
  }
}

/**
 * Resolve a URL to its playlist/video entries WITHOUT downloading. Escalates to an
 * exported cookie file once if the live browser store is unreadable; the resulting
 * cookie file (if any) is returned so a subsequent download can reuse it.
 */
export async function resolveJob(
  url: string,
  deps: Pick<RunJobDeps, 'bin' | 'settings' | 'onStatus' | 'signal'>
): Promise<{ job: ResolvedJob; cookieFile?: string }> {
  const { bin, settings, onStatus, signal } = deps
  let cookieFile: string | undefined
  let cookieArgs: string[] = needsCookieEscalation(settings)
    ? ['--cookies-from-browser', settings.cookies.source]
    : []
  const resolveOnce = (): Promise<ResolvedJob> =>
    timed('resolve-playlist', 'pipeline', () =>
      resolvePlaylist(
        bin.ytdlp,
        url,
        (line) => {
          // Drive the inline resolve panel and mirror the verbose line into the console log.
          onStatus?.({ phase: 'resolving', line })
          log.debug('yt-dlp', line)
        },
        signal,
        cookieArgs
      )
    )
  onStatus?.({ phase: 'resolving', key: 'launching' })
  let job: ResolvedJob
  try {
    job = await resolveOnce()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const escalate =
      !(signal?.aborted ?? false) && needsCookieEscalation(settings) && isCookiePermissionError(msg)
    if (!escalate) throw err
    cookieFile = await exportBrowserCookies(bin.ytdlp, settings.cookies.source, url)
    cookieArgs = ['--cookies', cookieFile]
    job = await resolveOnce()
  }
  onStatus?.({ phase: 'resolving', key: 'resolved', params: { count: job.entries.length } })
  log.info('app', `resolved ${job.kind} "${job.title}" — ${job.entries.length} track(s)`)
  return { job, cookieFile }
}

const isHttpUrl = (s?: string): s is string => !!s && /^https?:\/\//.test(s)

/**
 * Build the per-entry acquire function used by every download source: spawn a
 * single-video yt-dlp (intermediates redirected to the pipeline's per-track temp
 * dir, process group keyed to the track index for per-track pause/skip) and
 * classify its result.
 */
function makeDownloadProvide(opts: {
  entryUrl: () => string
  dest: () => string
  bin: BinaryPaths
  settings: Settings
  cookieFile?: string
}): SourceEntry['provide'] {
  const { bin, settings, cookieFile } = opts
  return async function provide(t, report, sig, tempDir) {
    let downloaded: string | null = null
    const onProgress = (ev: ProgressEvent): void => {
      if (t.status === 'queued' || t.status === 'downloading') {
        t.status = 'downloading'
        t.stage = 'downloading'
        t.percent = ev.percent
        t.speedBytesPerSec = ev.speedBytesPerSec
        if (ev.title) t.title = ev.title
      }
      report()
    }
    const args = buildDownloadArgs({
      url: opts.entryUrl(),
      destFolder: opts.dest(),
      settings,
      ffmpegPath: bin.ffmpeg,
      singleVideo: true,
      cookieFile,
      tempDir
    })
    // Mark the track active right before spawning yt-dlp, so the row reflects
    // work immediately instead of sitting on "queued" through process startup.
    if (t.status === 'queued') {
      t.status = 'downloading'
      t.stage = 'downloading'
      log.info('yt-dlp', `downloading "${t.title}"`)
      report()
    }
    const dl = await runYtDlp(
      bin.ytdlp,
      args,
      onProgress,
      (f) => {
        downloaded = f
      },
      sig,
      priorityToNice(settings.performance.priority),
      t.index
    )
    const outcome = classifyDownload(downloaded, dl, settings.audio.minBitrate)
    if (outcome.kind === 'skipped') {
      log.info(
        'yt-dlp',
        `skipped "${t.title}" — no source audio at/above ${settings.audio.minBitrate} kbps`
      )
      return { kind: 'skipped', reason: outcome.reason }
    }
    if (outcome.kind === 'failed') {
      log.warn('yt-dlp', `download failed for "${t.title}": ${outcome.reason}`)
      log.error('yt-dlp', `download result for "${t.title}":`, dl)
      return {
        kind: 'failed',
        reason: outcome.reason,
        errorCode: dl.code ? `yt-dlp ${dl.code}` : undefined
      }
    }
    return { kind: 'file', file: outcome.file }
  }
}

/**
 * Download source over a pre-resolved, curated entry list (from the staging UI):
 * no re-resolution — `resolve()` just echoes the confirmed title/kind/url and
 * `entries()` maps the supplied entries in their (possibly reordered) order.
 */
export function buildDownloadSourceFromEntries(
  req: StartJobRequest,
  deps: RunJobDeps,
  cookieFile?: string
): JobSource {
  const { bin, settings, homeBase } = deps
  log.info('app', `job start (staged): ${req.url} — ${req.entries.length} track(s)`)
  let dest = ''
  const entryUrl = (e: PlaylistEntry): string =>
    isHttpUrl(e.url) ? e.url : req.kind === 'video' ? req.url : watchUrl(e.videoId)
  return {
    async resolve() {
      dest =
        deps.folderOverride ??
        req.folderOverride ??
        destFolderFor(homeBase, req.title, settings.downloads.perPlaylistSubfolder, req.kind)
      return { title: req.title, kind: req.kind, url: req.url }
    },
    entries() {
      return req.entries.map((e) => ({
        index: e.index,
        title: e.title,
        videoId: e.videoId,
        destFolder: dest,
        provide: makeDownloadProvide({
          entryUrl: () => entryUrl(e),
          dest: () => dest,
          bin,
          settings,
          cookieFile
        })
      }))
    },
    cleanup() {
      if (cookieFile) cleanupCookieFile(cookieFile)
    }
  }
}

/**
 * The download source: resolve playlist/video metadata via yt-dlp (escalating to
 * an exported cookie file once if the browser cookie store is unreadable), then
 * download each entry on its own.
 */
function buildDownloadSource(url: string, deps: RunJobDeps): JobSource {
  const { bin, settings, homeBase } = deps
  log.info('app', `job start: ${url}`)
  let job: ResolvedJob | undefined
  let cookieFile: string | undefined
  let dest = ''
  const entryUrl = (e: PlaylistEntry, kind: 'playlist' | 'video'): string =>
    isHttpUrl(e.url) ? e.url : kind === 'video' ? url : watchUrl(e.videoId)
  return {
    async resolve() {
      const r = await resolveJob(url, deps)
      job = r.job
      cookieFile = r.cookieFile
      dest =
        deps.folderOverride ??
        destFolderFor(homeBase, job.title, settings.downloads.perPlaylistSubfolder, job.kind)
      return { title: job.title, kind: job.kind, url }
    },
    entries() {
      const resolvedJob = job
      if (!resolvedJob) return []
      return resolvedJob.entries.map((e) => ({
        index: e.index,
        title: e.title,
        videoId: e.videoId,
        destFolder: dest,
        provide: makeDownloadProvide({
          entryUrl: () => entryUrl(e, resolvedJob.kind),
          dest: () => dest,
          bin,
          settings,
          cookieFile
        })
      }))
    },
    cleanup() {
      if (cookieFile) cleanupCookieFile(cookieFile)
    }
  }
}

/** Full download pipeline: resolve all entries → download → transform each track. */
export async function runJob(url: string, deps: RunJobDeps): Promise<JobResult> {
  return runPipeline(buildDownloadSource(url, deps), deps)
}
