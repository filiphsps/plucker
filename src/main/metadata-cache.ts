import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { TrackTags } from '../shared/types'
import type { AudioInfo } from './audio-meta'

/** Content-derived data cached per audio-content hash (tag-independent). */
export interface CacheEntry {
  /** Technical audio properties probed once via ffmpeg. */
  audio?: AudioInfo
  /** MusicBrainz auto-tag enrichment result, reused to skip the network lookup. */
  mb?: TrackTags
}

export interface MetadataCache {
  read(hash: string): CacheEntry | null
  writeAudio(hash: string, audio: AudioInfo): void
  writeAutoTag(hash: string, mb: TrackTags, cover?: Buffer): void
  readCover(hash: string): Buffer | null
}

/**
 * A global, content-addressed metadata cache backed by a directory: one
 * `<hash>.json` per track plus an optional `<hash>.cover.jpg` for cover bytes.
 * Writes read-modify-write so audio and auto-tag blocks never clobber each other.
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
    const next: CacheEntry = { ...(read(hash) ?? {}), ...patch }
    writeFileSync(jsonPath(hash), JSON.stringify(next), 'utf8')
  }

  return {
    read,
    writeAudio: (hash, audio) => merge(hash, { audio }),
    writeAutoTag: (hash, mb, cover) => {
      merge(hash, { mb })
      if (cover) {
        ensureDir()
        writeFileSync(coverPath(hash), cover)
      }
    },
    readCover: (hash) => {
      const path = coverPath(hash)
      return existsSync(path) ? readFileSync(path) : null
    }
  }
}
