import { mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings, JobProgress, TrackProgress, HistoryTrack } from '../shared/types'
import { sanitizeFileName } from './rename'
import { buildDownloadArgs, runYtDlp } from './ytdlp'
import { buildRegistry } from './transforms/registry'
import { runTransformChain } from './transforms/run-chain'
import { createPool } from './pool'
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
  entries?: Array<{ id?: string; title?: string }>
}): ResolvedJob {
  const isPlaylist = json._type === 'playlist' || Array.isArray(json.entries)
  if (isPlaylist) {
    const entries: PlaylistEntry[] = (json.entries ?? []).map((e, i) => ({
      videoId: e.id ?? String(i + 1),
      title: e.title ?? e.id ?? `Track ${i + 1}`,
      index: i + 1
    }))
    return { kind: 'playlist', title: json.title ?? 'Plucker', entries }
  }
  return {
    kind: 'video',
    title: json.title ?? 'Plucker',
    entries: [{ videoId: json.id ?? '1', title: json.title ?? 'Plucker', index: 1 }]
  }
}

/** Resolve playlist/video metadata via yt-dlp --dump-single-json. */
export async function resolvePlaylist(ytdlpPath: string, url: string): Promise<ResolvedJob> {
  const { spawnSync } = await import('node:child_process')
  const out = spawnSync(ytdlpPath, ['--flat-playlist', '--dump-single-json', url], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  if (out.error) throw new Error(`yt-dlp failed to start: ${out.error.message}`)
  if (out.status !== 0)
    throw new Error((out.stderr || '').slice(-2000) || `yt-dlp exited ${out.status}`)
  if (!out.stdout?.trim()) throw new Error('yt-dlp returned no metadata')
  return parseEntries(JSON.parse(out.stdout))
}

/** Read a yt-dlp `.info.json` sidecar for the canonical video id + title. */
function readSidecar(path: string): { id?: string; title?: string } {
  if (!existsSync(path)) return {}
  try {
    const info = JSON.parse(readFileSync(path, 'utf8'))
    return {
      id: typeof info.id === 'string' ? info.id : undefined,
      title: typeof info.title === 'string' ? info.title : undefined
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
  mbFetch?: typeof fetch
  signal?: AbortSignal
  /** When set, download into this exact folder instead of deriving from base/title. */
  folderOverride?: string
}

export interface JobResult {
  title: string
  folder: string
  url: string
  kind: 'playlist' | 'video'
  tracks: HistoryTrack[]
}

/** 0..1 progress for one track: download weighted 0.8, transforms 0.2. */
function trackProgress(t: TrackProgress): number {
  if (t.status === 'done' || t.status === 'failed' || t.status === 'skipped') return 1
  return ((t.percent ?? 0) / 100) * 0.8 + ((t.transformPercent ?? 0) / 100) * 0.2
}

/** Full pipeline: resolve all entries → download → transform each track as it lands. */
export async function runJob(url: string, deps: RunJobDeps): Promise<JobResult> {
  const { bin, settings, homeBase, onProgress, signal } = deps
  const job = await resolvePlaylist(bin.ytdlp, url)
  const dest =
    deps.folderOverride ??
    destFolderFor(homeBase, job.title, settings.downloads.perPlaylistSubfolder, job.kind)
  mkdirSync(dest, { recursive: true })

  // Pre-populate every entry as queued so the whole list shows immediately.
  const tracks: TrackProgress[] = job.entries.map((e) => ({
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
      jobTitle: job.title,
      total: tracks.length,
      tracks: [...tracks],
      folder: dest,
      url,
      overall: overall()
    })
  emit()

  const registry = buildRegistry()
  const enabled = settings.transforms.filter((i) => i.enabled)
  const services = {
    bin,
    fetch: deps.mbFetch ?? fetch,
    signal,
    log: (m: string) => console.warn(m)
  }
  const pool = createPool(Math.max(1, settings.performance.parallel))
  const history: HistoryTrack[] = []

  const findByVideo = (videoId?: string): TrackProgress | undefined =>
    videoId ? tracks.find((x) => x.videoId === videoId) : undefined

  const onDownloadProgress = (e: {
    index: number
    percent: number
    videoId: string
    title: string
  }): void => {
    const t = findByVideo(e.videoId) ?? tracks.find((x) => x.index === e.index)
    if (!t) return
    if (t.status === 'queued' || t.status === 'downloading') {
      t.status = 'downloading'
      t.percent = e.percent
      if (e.title) t.title = e.title
    }
    emit()
  }

  const onComplete = (filePath: string): void => {
    const sidecarPath = filePath.replace(/\.mp3$/i, '.info.json')
    const sidecar = readSidecar(sidecarPath)
    const t = findByVideo(sidecar.id) ?? tracks.find((x) => x.status === 'downloading')
    if (!t) return
    t.status = 'transforming'
    t.percent = 100
    t.transformPercent = 0
    emit()
    pool.run(async () => {
      const res = await runTransformChain(
        filePath,
        dest,
        {
          videoId: sidecar.id,
          rawTitle: sidecar.title ?? t.title,
          sourceFile: filePath,
          index: t.index
        },
        enabled,
        registry,
        services,
        (f) => {
          t.transformPercent = Math.round(f * 100)
          emit()
        }
      )
      if (existsSync(sidecarPath)) rmSync(sidecarPath, { force: true })
      if (res.failed) {
        t.status = 'failed'
        t.reason = res.reason
      } else {
        if (res.outputFile !== filePath && existsSync(filePath)) rmSync(filePath, { force: true })
        t.status = 'done'
        t.file = res.outputFile
        t.artist = res.tags.artist
        t.album = res.tags.album
        t.year = res.tags.year
        if (res.tags.title) t.title = res.tags.title
        t.transformPercent = 100
        history.push({
          file: res.outputFile,
          title: res.tags.title ?? t.title,
          artist: res.tags.artist,
          album: res.tags.album,
          year: res.tags.year,
          videoId: sidecar.id
        })
      }
      emit()
    })
  }

  const args = buildDownloadArgs({ url, destFolder: dest, settings, ffmpegPath: bin.ffmpeg })
  const dl = await runYtDlp(bin.ytdlp, args, onDownloadProgress, onComplete, signal)

  // Mark below-floor skips reported by yt-dlp.
  for (const s of dl.skipped) {
    const t = findByVideo(s.videoId)
    if (t && (t.status === 'queued' || t.status === 'downloading')) {
      t.status = 'skipped'
      t.reason = 'below minimum quality'
    }
  }

  // Wait for all in-flight transform tasks before finalizing.
  await pool.drain()

  // Any track that never completed downloading is a failure.
  tracks.forEach((t) => {
    if (t.status === 'queued' || t.status === 'downloading') t.status = 'failed'
  })
  emit()

  return { title: job.title, folder: dest, url, kind: job.kind, tracks: history }
}
