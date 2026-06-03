import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { TrackTags, AudioMeta, CacheTrackIdentity, Waveform } from '@shared/types'

/** Content-derived data cached per audio-content hash (tag-independent). */
export interface CacheEntry {
  /** Technical audio properties probed once via ffmpeg (+ file size). */
  audio?: AudioMeta
  /** Precomputed waveform peaks + duration, generated lazily on first expand. */
  waveform?: Waveform
  /** MusicBrainz auto-tag enrichment result, reused to skip the network lookup. */
  mb?: TrackTags
  /** Last-known display identity for the track that produced this hash. */
  track?: CacheTrackIdentity
  /** ISO timestamp of the last write. */
  updatedAt?: string
}

/** A cache entry paired with its hash, for listing in the cache manager. */
export interface CacheRecord extends CacheEntry {
  hash: string
  hasCover: boolean
}

export interface MetadataCache {
  read(hash: string): CacheEntry | null
  writeAudio(hash: string, audio: AudioMeta): void
  writeWaveform(hash: string, waveform: Waveform): void
  /** Drop a cached waveform so the next read regenerates it from the file. */
  invalidateWaveform(hash: string): void
  writeAutoTag(hash: string, mb: TrackTags, cover?: Buffer): void
  writeTrack(hash: string, track: CacheTrackIdentity): void
  /** Merge corrected tags into the cached MusicBrainz block. */
  update(hash: string, mb: TrackTags): void
  remove(hash: string): void
  clear(): void
  list(): CacheRecord[]
  readCover(hash: string): Buffer | null
}

/**
 * A global, content-addressed metadata cache backed by a directory: one
 * `<hash>.json` per track plus an optional `<hash>.cover.jpg` for cover bytes.
 * Writes read-modify-write so the audio, auto-tag and identity blocks never
 * clobber each other, and every write stamps `updatedAt`.
 */
export function createMetadataCache(dir: string): MetadataCache {
  const jsonPath = (hash: string): string => join(dir, `${hash}.json`)
  const coverPath = (hash: string): string => join(dir, `${hash}.cover.jpg`)

  let ensured = false
  const ensureDir = (): void => {
    if (ensured) return
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      console.info(`[metadata-cache] created metadata cache directory at ${dir}`)
    }
    ensured = true
  }

  const read = (hash: string): CacheEntry | null => {
    const path = jsonPath(hash)
    if (!existsSync(path)) return null
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as CacheEntry
    } catch {
      return null
    }
  }

  const merge = (hash: string, patch: Partial<CacheEntry>): void => {
    ensureDir()
    const next: CacheEntry = {
      ...(read(hash) ?? {}),
      ...patch,
      updatedAt: new Date().toISOString()
    }
    writeFileSync(jsonPath(hash), JSON.stringify(next), 'utf8')
  }

  const mergeTags = (hash: string, mb: TrackTags): void => {
    const prev = read(hash)?.mb ?? {}
    merge(hash, { mb: { ...prev, ...mb } })
  }

  return {
    read,
    writeAudio: (hash, audio) => merge(hash, { audio }),
    writeWaveform: (hash, waveform) => merge(hash, { waveform }),
    invalidateWaveform: (hash) => {
      const entry = read(hash)
      if (!entry?.waveform) return
      const next = { ...entry, updatedAt: new Date().toISOString() }
      delete next.waveform
      ensureDir()
      writeFileSync(jsonPath(hash), JSON.stringify(next), 'utf8')
    },
    writeAutoTag: (hash, mb, cover) => {
      merge(hash, { mb })
      if (cover) {
        ensureDir()
        writeFileSync(coverPath(hash), cover)
      }
    },
    writeTrack: (hash, track) => merge(hash, { track }),
    update: (hash, mb) => mergeTags(hash, mb),
    remove: (hash) => {
      rmSync(jsonPath(hash), { force: true })
      rmSync(coverPath(hash), { force: true })
    },
    clear: () => {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
      ensured = false
    },
    list: () => {
      if (!existsSync(dir)) return []
      return readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
          const hash = f.slice(0, -'.json'.length)
          const entry = read(hash) ?? {}
          return { hash, hasCover: existsSync(coverPath(hash)), ...entry }
        })
    },
    readCover: (hash) => {
      const path = coverPath(hash)
      return existsSync(path) ? readFileSync(path) : null
    }
  }
}
