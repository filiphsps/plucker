import { mkdirSync, readdirSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings, TrackTags, JobProgress, TrackProgress } from '../shared/types'
import { sanitizeFileName, buildFileName } from './rename'
import { parseTitle } from './title-parser'
import { selectBestMatch } from './mb-select'
import { MusicBrainzClient } from './musicbrainz'
import { readTrackTags, writeTrackTags, embedCover } from './tagger'
import { buildDownloadArgs, runYtDlp } from './ytdlp'
import type { BinaryPaths } from './binaries'

export function destFolderFor(
  base: string, jobTitle: string, perPlaylistSubfolder: boolean, kind: 'playlist' | 'video',
): string {
  if (kind === 'video' || !perPlaylistSubfolder) return base
  return join(base, sanitizeFileName(jobTitle))
}

/** YouTube vs MusicBrainz precedence; non-primary only fills gaps. */
export function mergeTags(yt: TrackTags, mb: TrackTags, settings: Settings): TrackTags {
  const primary = settings.tagging.primarySource === 'youtube' ? yt : mb
  const secondary = settings.tagging.primarySource === 'youtube' ? mb : yt
  const pick = (k: keyof TrackTags): string | undefined => primary[k] || secondary[k]
  return {
    artist: pick('artist'), title: pick('title'), album: pick('album'),
    date: pick('date'), year: pick('year'), trackNumber: pick('trackNumber'), genre: pick('genre'),
  }
}

export interface ResolvedJob { kind: 'playlist' | 'video'; title: string }

/** Resolve playlist/video metadata via yt-dlp --dump-single-json. */
export async function resolveJob(ytdlpPath: string, url: string): Promise<ResolvedJob> {
  const { spawnSync } = await import('node:child_process')
  const out = spawnSync(ytdlpPath, ['--flat-playlist', '--dump-single-json', url], { encoding: 'utf8' })
  if (out.status !== 0) throw new Error(out.stderr.slice(-2000) || 'yt-dlp resolve failed')
  const json = JSON.parse(out.stdout)
  const isPlaylist = json._type === 'playlist' || Array.isArray(json.entries)
  return { kind: isPlaylist ? 'playlist' : 'video', title: json.title ?? 'Plucker' }
}

export interface RunJobDeps {
  bin: BinaryPaths
  settings: Settings
  homeBase: string // expanded base folder
  onProgress: (p: JobProgress) => void
  mbFetch?: typeof fetch
  signal?: AbortSignal
}

/** Full pipeline: resolve → download → tag/enrich → rename. */
export async function runJob(url: string, deps: RunJobDeps): Promise<void> {
  const { bin, settings, homeBase, onProgress, signal } = deps
  const job = await resolveJob(bin.ytdlp, url)
  const dest = destFolderFor(homeBase, job.title, settings.downloads.perPlaylistSubfolder, job.kind)
  mkdirSync(dest, { recursive: true })

  const tracks: TrackProgress[] = []
  const emit = (): void => onProgress({ jobTitle: job.title, total: tracks.length, tracks: [...tracks] })

  // Download
  const args = buildDownloadArgs({ url, destFolder: dest, settings, ffmpegPath: bin.ffmpeg })
  const res = await runYtDlp(bin.ytdlp, args, (e) => {
    let t = tracks.find((x) => x.index === e.index)
    if (!t) { t = { index: e.index, title: e.title, status: 'downloading' }; tracks.push(t) }
    t.percent = e.percent; t.status = e.percent >= 100 ? 'tagging' : 'downloading'; t.title = e.title
    emit()
  }, signal)
  if (res.code !== 0 && tracks.length === 0 && res.skipped.length === 0) {
    throw new Error(res.stderrTail || 'Download failed')
  }
  // Below-floor videos that yt-dlp skipped: surface them as 'skipped'.
  let skipIdx = -1
  for (const s of res.skipped) {
    tracks.push({ index: skipIdx--, title: s.videoId, status: 'skipped', reason: 'below minimum quality' })
  }
  if (res.skipped.length) emit()

  // Tag + enrich
  if (settings.tagging.enabled) {
    const mb = new MusicBrainzClient(settings.tagging.userAgentEmail, { fetchImpl: deps.mbFetch })
    for (const file of readdirSync(dest).filter((f) => f.endsWith('.mp3'))) {
      const full = join(dest, file)
      const ytTags = readTrackTags(full)
      const parsed = parseTitle(ytTags.title ?? file.replace(/\.mp3$/, ''))
      const ytNorm: TrackTags = { ...ytTags, artist: ytTags.artist || parsed.artist || undefined, title: parsed.title }

      let mbTags: TrackTags = {}
      if (settings.tagging.enrichWithMusicBrainz) {
        try {
          const search = await mb.searchRecording(ytNorm.artist ?? null, ytNorm.title ?? '')
          const match = selectBestMatch(search, settings.tagging.minMatchScore)
          if (match) {
            mbTags = {
              artist: match.artist ?? undefined, title: match.title,
              album: match.album ?? undefined, date: match.date ?? undefined, year: match.year ?? undefined,
            }
            if (settings.tagging.fetchTrackNumber && match.releaseId) {
              mbTags.trackNumber = (await mb.getTrackNumber(match.releaseId, match.recordingId)) ?? undefined
            }
            if (settings.tagging.fetchGenre && match.releaseGroupId) {
              mbTags.genre = (await mb.getReleaseGroupGenre(match.releaseGroupId)) ?? undefined
            }
            if (settings.tagging.fetchCoverArt && match.releaseId) {
              try {
                const cover = await fetch(`https://coverartarchive.org/release/${match.releaseId}/front-500`)
                if (cover.ok) embedCover(full, Buffer.from(await cover.arrayBuffer()), 'image/jpeg')
              } catch { /* keep embedded youtube thumbnail */ }
            }
          }
        } catch { /* keep youtube tags, not enriched */ }
      }

      const merged = mergeTags(ytNorm, mbTags, settings)
      writeTrackTags(full, merged)

      // Rename
      if (settings.rename.enabled) {
        const newName = buildFileName(settings.rename.template, merged)
        if (newName) {
          const target = join(dest, `${newName}.mp3`)
          if (target !== full && !existsSync(target)) renameSync(full, target)
        }
      }
      const t = tracks.find((x) => x.title && parsed.title.includes(x.title)) ?? tracks.find((x) => x.status === 'tagging')
      if (t) { t.status = 'done'; emit() }
    }
  }
  tracks.forEach((t) => { if (t.status !== 'failed' && t.status !== 'skipped') t.status = 'done' })
  emit()
}
