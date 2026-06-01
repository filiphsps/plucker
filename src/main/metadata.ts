import { statSync, readFileSync } from 'node:fs'
import { readTrackTags } from './tagger'
import { probeAudio, type AudioInfo } from './audio-meta'
import { audioContentHash } from './audio-hash'
import type { MetadataCache } from './metadata-cache'
import type { BinaryPaths } from './binaries'
import type { TrackMetadata, TrackTags } from '../shared/types'

/** Injectable I/O for {@link getTrackMetadata} (real implementations in {@link forBinaries}). */
export interface MetaDeps {
  cache: MetadataCache
  probe: (file: string) => AudioInfo
  readTags: (file: string) => TrackTags
  fileSize: (file: string) => number | undefined
  /** Derive the content hash from the file on disk (for backfilling old tracks). */
  hashFile: (file: string) => string | undefined
}

/**
 * Assemble the file-derived metadata for the expanded panel. Tags + file size
 * are read live (cheap, and tags can change); the technical audio block is
 * served from the content-hash cache when available, probed once otherwise.
 */
export function getTrackMetadata(
  file: string,
  hash: string | undefined,
  deps: MetaDeps
): TrackMetadata {
  const tags = deps.readTags(file)
  // Fall back to hashing the file so the cache can be backfilled for tracks
  // recorded before content hashing existed.
  const key = hash ?? deps.hashFile(file)
  let audio = key ? deps.cache.read(key)?.audio : undefined
  if (!audio) {
    console.info(`[metadata] no cached metadata for ${file}${key ? ` (${key})` : ''} — probing`)
    audio = deps.probe(file)
    if (key) deps.cache.writeAudio(key, audio)
  }
  return { tags, audio: { ...audio, sizeBytes: deps.fileSize(file) } }
}

/** Build real {@link MetaDeps} backed by the bundled ffmpeg + on-disk cache. */
export function forBinaries(bin: BinaryPaths, cache: MetadataCache): MetaDeps {
  return {
    cache,
    probe: (file) => probeAudio(bin.ffmpeg, file),
    readTags: (file) => {
      try {
        return readTrackTags(file)
      } catch {
        return {}
      }
    },
    fileSize: (file) => {
      try {
        return statSync(file).size
      } catch {
        return undefined
      }
    },
    hashFile: (file) => {
      try {
        return audioContentHash(readFileSync(file))
      } catch {
        return undefined
      }
    }
  }
}
