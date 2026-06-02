import { mkdirSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type {
  Settings,
  JobProgress,
  JobStatus,
  JobOutcome,
  TrackProgress,
  HistoryTrack
} from '../shared/types'
import { watchUrl } from '../shared/youtube-url'
import { sanitizeFileName } from './rename'
import {
  buildDownloadArgs,
  runYtDlp,
  priorityToNice,
  type ProgressEvent,
  type SpawnResult
} from './ytdlp'
import { spawnManaged } from './spawn'
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
import type { BinaryPaths } from './binaries'

export function destFolderFor(
  base: string,
  jobTitle: string,
  perPlaylistSubfolder: boolean,
  kind: 'playlist' | 'video'
): string {
  if (kind === 'video' || !perPlaylistSubfolder) return base
  return join(base, sanitizeFileName(jobTitle))
}

export interface PlaylistEntry {
  videoId: string
  title: string
  index: number
  /** Per-entry page URL from the flat playlist, used to download this video alone. */
  url?: string
}

export interface ResolvedJob {
  kind: 'playlist' | 'video'
  title: string
  entries: PlaylistEntry[]
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
   */
  provide(t: TrackProgress, report: () => void, signal?: AbortSignal): Promise<ProvideOutcome>
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

    const overall = (): number =>
      tracks.length ? tracks.reduce((sum, t) => sum + trackProgress(t), 0) / tracks.length : 0
    const emit = (): void =>
      onProgress({
        jobTitle: resolved.title,
        total: tracks.length,
        tracks: [...tracks],
        folder: repFolder,
        url: resolved.url,
        overall: overall()
      })
    emit()

    const registry = buildRegistry()
    const enabled = settings.transforms.filter((i) => i.enabled)
    const services = {
      bin,
      fetch: deps.mbFetch ?? fetch,
      signal,
      log: transformLog(),
      cache: deps.cache,
      analyze: deps.analyze
    }
    // One slot per concurrent track pipeline. Each slot owns a single entry's
    // acquire *and* its transform, so `performance.parallel` is the number of full
    // track pipelines running at once.
    const pool = createPool(Math.max(1, settings.performance.parallel))
    // Collect history by track index so the recorded order is stable regardless
    // of which concurrent track finishes first.
    const historyByIndex: (HistoryTrack | undefined)[] = new Array(tracks.length)

    /** Hash + transform an acquired file, updating the track + history. */
    const finishTrack = async (
      t: TrackProgress,
      filePath: string,
      entry: SourceEntry
    ): Promise<void> => {
      const sidecarPath = filePath.replace(/\.mp3$/i, '.info.json')
      const sidecar = readSidecar(sidecarPath)
      // Hash the audio frames once (tag-independent), so auto-tag + probe can reuse
      // cached results and history can point straight at the cache entry.
      t.speedBytesPerSec = undefined
      let hash: string | undefined
      try {
        t.stage = 'hashing'
        emit()
        hash = await timed('hash', 'pipeline', () => hashAudioFile(filePath))
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
        services,
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
              probeAudio(bin.ffmpeg, res.outputFile, signal)
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

    /** Acquire one entry's file via the source, then hand it to {@link finishTrack}. */
    const processEntry = async (entry: SourceEntry, t: TrackProgress): Promise<void> => {
      const trackSpan = startSpan('track-process', 'pipeline')
      const outcome = await entry.provide(t, emit, signal)
      t.stage = undefined
      t.speedBytesPerSec = undefined
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
      // A throw inside finishTrack (hash/transform/probe) would otherwise leave the
      // track stuck in `transforming`. Mark it failed here so the row settles
      // immediately rather than waiting on the end-of-job backstop.
      try {
        await finishTrack(t, outcome.file, entry)
        t.elapsedMs = Math.round(trackSpan.end(t.title))
      } catch (err) {
        t.status = 'failed'
        t.stage = undefined
        t.reason = t.reason ?? (err instanceof Error ? err.message : 'Transform failed')
        t.elapsedMs = Math.round(trackSpan.end(`${t.title} (failed)`))
        log.warn('transform', `track failed "${t.title}": ${t.reason}`)
      }
      emit()
    }

    entries.forEach((entry, i) => pool.run(() => processEntry(entry, tracks[i])))
    await pool.drain()

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
  }
}

/**
 * The download source: resolve playlist/video metadata via yt-dlp (escalating to
 * an exported cookie file once if the browser cookie store is unreadable), then
 * download each entry on its own.
 */
function buildDownloadSource(url: string, deps: RunJobDeps): JobSource {
  const { bin, settings, homeBase, onStatus, signal } = deps
  log.info('app', `job start: ${url}`)

  // When a browser cookie source is selected we first try reading it directly.
  // If yt-dlp can't access the cookie store (permission error in the packaged
  // app), we escalate ONCE: a privileged step exports the cookies to a temp file
  // that every subsequent (unprivileged) resolve/download reads via `--cookies`.
  let cookieFile: string | undefined
  let cookieArgs: string[] = needsCookieEscalation(settings)
    ? ['--cookies-from-browser', settings.cookies.source]
    : []
  let job: ResolvedJob | undefined
  let dest = ''

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

  const isHttpUrl = (s?: string): s is string => !!s && /^https?:\/\//.test(s)

  return {
    async resolve() {
      onStatus?.({ phase: 'resolving', key: 'launching' })
      try {
        job = await resolveOnce()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const escalate =
          !(signal?.aborted ?? false) &&
          needsCookieEscalation(settings) &&
          !cookieFile &&
          isCookiePermissionError(msg)
        if (!escalate) throw err
        cookieFile = await exportBrowserCookies(bin.ytdlp, settings.cookies.source, url)
        cookieArgs = ['--cookies', cookieFile]
        job = await resolveOnce()
      }
      onStatus?.({ phase: 'resolving', key: 'resolved', params: { count: job.entries.length } })
      log.info('app', `resolved ${job.kind} "${job.title}" — ${job.entries.length} track(s)`)
      dest =
        deps.folderOverride ??
        destFolderFor(homeBase, job.title, settings.downloads.perPlaylistSubfolder, job.kind)
      return { title: job.title, kind: job.kind, url }
    },
    entries() {
      const resolvedJob = job
      if (!resolvedJob) return []
      // Prefer the flat-playlist entry URL; fall back to a watch URL (or, for a single
      // video job, the original URL) so a missing entry URL never blocks a download.
      const entryUrl = (e: PlaylistEntry): string =>
        isHttpUrl(e.url) ? e.url : resolvedJob.kind === 'video' ? url : watchUrl(e.videoId)
      return resolvedJob.entries.map((e) => ({
        index: e.index,
        title: e.title,
        videoId: e.videoId,
        destFolder: dest,
        async provide(t, report, sig) {
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
            url: entryUrl(e),
            destFolder: dest,
            settings,
            ffmpegPath: bin.ffmpeg,
            singleVideo: true,
            cookieFile
          })
          // Mark the track active right before spawning yt-dlp, so the row reflects
          // work immediately instead of sitting on "queued" through process startup
          // and format selection — the first progress line can be seconds away.
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
            priorityToNice(settings.performance.priority)
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
