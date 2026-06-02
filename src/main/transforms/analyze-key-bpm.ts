// src/main/transforms/analyze-key-bpm.ts
import type { ConfigField } from '../../shared/transforms'
import type { TransformDefinition, TrackContext, TransformServices } from './types'
import type { AnalysisTags } from '../tagger'
import { writeAnalysisTags } from '../tagger'
import { decodePcm, ffmpegPcmDeps } from '../audio-pcm'
import { estimateKey } from '../../shared/chroma'
import { estimateBpm, type TempoRange } from '../../shared/tempo'
import { keyToCamelot } from '../../shared/camelot'

export interface AnalyzeKeyBpmConfig {
  detectKey: boolean
  detectBpm: boolean
  minBpm: number
  maxBpm: number
}

/** Sample rate for analysis — low enough to be fast, high enough for tempo/key. */
const ANALYSIS_SR = 11025

/** Injectable collaborators so the orchestration is testable without ffmpeg/DSP. */
export interface AnalyzeDeps {
  decode: (file: string, sampleRate: number) => Promise<Float32Array>
  estimateKey: (pcm: Float32Array, sampleRate: number) => string | null
  estimateBpm: (pcm: Float32Array, sampleRate: number, range: TempoRange) => number | null
  keyToCamelot: (key: string) => string | undefined
  writeTags: (file: string, tags: AnalysisTags) => void
}

/**
 * Decode `file` once, run the enabled analyses, and write any results to ID3
 * frames. Writing nothing when nothing is detected is intentional.
 */
export async function analyzeTrack(
  file: string,
  config: AnalyzeKeyBpmConfig,
  deps: AnalyzeDeps
): Promise<void> {
  const pcm = await deps.decode(file, ANALYSIS_SR)
  const tags: AnalysisTags = {}

  if (config.detectKey) {
    const key = deps.estimateKey(pcm, ANALYSIS_SR)
    if (key) {
      tags.key = key
      tags.camelot = deps.keyToCamelot(key)
    }
  }
  if (config.detectBpm) {
    const bpm = deps.estimateBpm(pcm, ANALYSIS_SR, {
      minBpm: config.minBpm,
      maxBpm: config.maxBpm
    })
    if (bpm !== null) tags.bpm = bpm
  }

  if (tags.key || tags.bpm) deps.writeTags(file, tags)
}

const CONFIG_SCHEMA: ConfigField[] = [
  {
    key: 'detectKey',
    labelKey: 'transforms.analyzeKeyBpm.fields.detectKey',
    type: 'boolean',
    default: true
  },
  {
    key: 'detectBpm',
    labelKey: 'transforms.analyzeKeyBpm.fields.detectBpm',
    type: 'boolean',
    default: true
  },
  {
    key: 'minBpm',
    labelKey: 'transforms.analyzeKeyBpm.fields.minBpm',
    type: 'number',
    default: 70,
    min: 30,
    max: 300
  },
  {
    key: 'maxBpm',
    labelKey: 'transforms.analyzeKeyBpm.fields.maxBpm',
    type: 'number',
    default: 180,
    min: 30,
    max: 300
  }
]

/**
 * Estimate the track's musical key and tempo from its audio and write them to
 * TKEY, TBPM, and a TXXX:CAMELOT frame. Pure-TS DSP over ffmpeg-decoded PCM;
 * skip-on-failure so a bad analysis never aborts the chain or drops other tags.
 */
export const analyzeKeyBpmTransform: TransformDefinition<AnalyzeKeyBpmConfig> = {
  type: 'analyze-key-bpm',
  apiVersion: 1,
  labelKey: 'transforms.analyzeKeyBpm.label',
  descriptionKey: 'transforms.analyzeKeyBpm.description',
  allowMultiple: false,
  failureMode: 'skip',
  configSchema: CONFIG_SCHEMA,
  defaultConfig: { detectKey: true, detectBpm: true, minBpm: 70, maxBpm: 180 },
  async run(
    ctx: TrackContext,
    config: AnalyzeKeyBpmConfig,
    services: TransformServices
  ): Promise<void> {
    await analyzeTrack(ctx.workingFile, config, {
      decode: (file, sr) =>
        decodePcm(file, sr, ffmpegPcmDeps(services.bin.ffmpeg, services.signal)),
      estimateKey,
      estimateBpm,
      keyToCamelot,
      writeTags: writeAnalysisTags
    })
    services.log(`[analyze-key-bpm] analyzed ${ctx.workingFile}`)
  }
}
