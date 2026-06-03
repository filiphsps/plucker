import { statSync } from 'node:fs'
import { readTrackTags } from '@app/app/metadata/id3/tagger'
import { probeAudio, type AudioInfo } from '@app/app/audio/audio-meta'
import { hashAudioFile } from '@app/app/audio/audio-hash'
import type { MetadataCache } from './metadata-cache'
import type { BinaryPaths } from '@app/app/download/binaries'
import type { TrackMetadata, TrackTags } from '@shared/types'

/** Injectable I/O for {@link getTrackMetadata} (real implementations in {@link forBinaries}). */
export interface MetaDeps {
  cache: MetadataCache
  probe: (file: string) => Promise<AudioInfo>
  readTags: (file: string) => TrackTags
  fileSize: (file: string) => number | undefined
  /** Derive the content hash from the file on disk (for backfilling old tracks). */
  hashFile: (file: string) => Promise<string | undefined>
}

/**
 * Assemble the file-derived metadata for the expanded panel. Tags + file size
 * are read live (cheap, and tags can change); the technical audio block is
 * served from the content-hash cache when available, probed once otherwise.
 */
export async function getTrackMetadata(
  file: string,
  hash: string | undefined,
  deps: MetaDeps
): Promise<TrackMetadata> {
  const tags = deps.readTags(file)
  // Fall back to hashing the file so the cache can be backfilled for tracks
  // recorded before content hashing existed.
  const key = hash ?? (await deps.hashFile(file))
  let audio = key ? deps.cache.read(key)?.audio : undefined
  if (!audio) {
    console.info(`[metadata] no cached metadata for ${file}${key ? ` (${key})` : ''} — probing`)
    audio = await deps.probe(file)
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
    hashFile: async (file) => {
      try {
        return await hashAudioFile(file)
      } catch {
        return undefined
      }
    }
  }
}
