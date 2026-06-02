// src/main/transforms/types.ts
import type { TrackTags } from '../../shared/types'
import type { ConfigField } from '../../shared/transforms'
import type { BinaryPaths } from '../binaries'
import type { MetadataCache } from '../metadata-cache'
import type { SourceMetadata } from '../source-metadata'
import type { OffThreadAnalyze } from '../workers/analyze-protocol'
import type { OffThreadMedia } from '../workers/media-protocol'

/** Mutable state threaded through a transform chain for one track. */
export interface TrackContext {
  /** Temp working copy; audio-rewriting transforms mutate it & may reassign it. */
  workingFile: string
  /** In-memory tags, last-wins; flushed to the file at commit. */
  tags: TrackTags
  info: {
    videoId?: string
    rawTitle: string
    sourceFile: string
    index: number
    /** Tag-independent audio-content hash; cache key for skipping re-work. */
    contentHash?: string
    /** Full structured metadata captured from the yt-dlp `.info.json` sidecar. */
    source?: SourceMetadata
  }
  /** Desired final basename (no extension); set by rename, used at commit. */
  outputName?: string
}

/**
 * Leveled logger handed to each transform. Lines route into the unified
 * main-process logger under the `transform` scope (file + dev console overlay),
 * and the chain runner prefixes each with its transform type. Variadic like
 * `console.log`, so an `Error` can be passed straight through.
 */
export interface TransformLog {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
}

/** Cross-cutting services available to every transform. */
export interface TransformServices {
  bin: BinaryPaths
  fetch: typeof fetch
  signal?: AbortSignal
  /** Process-group key (the track index) so per-track pause can freeze this track's ffmpeg. */
  groupKey?: number
  log: TransformLog
  /** Report 0..1 progress within this transform's step (optional to call). */
  reportProgress: (fraction: number) => void
  /** Content-addressed metadata cache, used to reuse prior auto-tag results. */
  cache?: MetadataCache
  /**
   * Off-thread key/BPM analyzer. When set, analyze-key-bpm offloads its heavy
   * decode + WASM DSP to a worker so the main thread (and progress IPC) stays
   * responsive. Absent in tests → the transform analyzes inline.
   */
  analyze?: OffThreadAnalyze
  /**
   * Off-thread media I/O. When set, ID3 tag read/write + cover embed run on a
   * worker thread instead of blocking the Electron main thread (node-id3 is
   * synchronous and rewrites the whole file). Absent in tests → the transform
   * uses the synchronous tagger directly.
   */
  media?: OffThreadMedia
}

export interface TransformDefinition<C = Record<string, unknown>> {
  type: string
  apiVersion: 1
  labelKey: string
  descriptionKey: string
  allowMultiple: boolean
  failureMode: 'fatal' | 'skip'
  configSchema: ConfigField[]
  defaultConfig: C
  run(ctx: TrackContext, config: C, services: TransformServices): Promise<void>
}

/** Result of running a chain on one track. */
export interface ChainResult {
  outputFile: string
  tags: TrackTags
  failed: boolean
  reason?: string
}
