// src/main/transforms/types.ts
import type { TrackTags } from '../../shared/types'
import type { ConfigField } from '../../shared/transforms'
import type { BinaryPaths } from '../binaries'

/** Mutable state threaded through a transform chain for one track. */
export interface TrackContext {
  /** Temp working copy; audio-rewriting transforms mutate it & may reassign it. */
  workingFile: string
  /** In-memory tags, last-wins; flushed to the file at commit. */
  tags: TrackTags
  info: { videoId?: string; rawTitle: string; sourceFile: string; index: number }
  /** Desired final basename (no extension); set by rename, used at commit. */
  outputName?: string
}

/** Cross-cutting services available to every transform. */
export interface TransformServices {
  bin: BinaryPaths
  fetch: typeof fetch
  signal?: AbortSignal
  log: (msg: string) => void
  /** Report 0..1 progress within this transform's step (optional to call). */
  reportProgress: (fraction: number) => void
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
