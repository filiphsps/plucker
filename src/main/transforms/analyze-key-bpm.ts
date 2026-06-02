// src/main/transforms/analyze-key-bpm.ts
import type { ConfigField } from '../../shared/transforms'
import type { TransformDefinition, TrackContext, TransformServices, TransformLog } from './types'
import type { AnalysisTags } from '../tagger'
import { writeAnalysisTags } from '../tagger'
import { decodePcm, ffmpegPcmDeps } from '../audio-pcm'
import { estimateKey } from '../../shared/chroma'
import { estimateBpm, type TempoRange } from '../../shared/tempo'
import { keyToCamelot } from '../../shared/camelot'
import {
  getEssentia,
  analyzeKeyEssentia,
  analyzeBpmEssentia,
  KEY_STRENGTH_MIN,
  BPM_CONFIDENCE_MIN,
  type EssentiaLike
} from '../essentia'

export interface AnalyzeKeyBpmConfig {
  detectKey: boolean
  detectBpm: boolean
  minBpm: number
  maxBpm: number
}

// Essentia's KeyExtractor profiles and RhythmExtractor2013 are tuned for 44.1 kHz
// (RhythmExtractor2013 in particular assumes it), so decode at that rate. The
// pure-TS fallback estimators read the sample rate as a parameter and work here too.
const ANALYSIS_SR = 44100

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
 * frames. Returns the tags that were written (empty when nothing was detected,
 * which is intentional) plus the analyzed sample count, so callers can log.
 */
export async function analyzeTrack(
  file: string,
  config: AnalyzeKeyBpmConfig,
  deps: AnalyzeDeps
): Promise<{ tags: AnalysisTags; samples: number }> {
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
  return { tags, samples: pcm.length }
}

/**
 * Build the real {@link AnalyzeDeps} (ffmpeg decode + Essentia/fallback DSP +
 * tag writing). Shared by the inline path and the off-thread worker so both
 * produce identical results and log lines — the worker passes a capturing
 * logger; the inline path passes the live transform logger.
 */
export function buildAnalyzeDeps(
  log: TransformLog,
  ffmpegPath: string,
  signal: AbortSignal | undefined,
  groupKey?: number,
  getEs: (onError?: (msg: string) => void) => EssentiaLike | null = getEssentia
): AnalyzeDeps {
  // Boot Essentia once; null means it failed to load and we transparently fall
  // back to the pure-TS estimators so a WASM problem never drops the tags.
  const es = getEs((msg) => log.warn(msg))
  log.debug(`analysis engine: ${es ? 'essentia (wasm)' : 'fallback DSP'}`)
  return {
    decode: (file, sr) => decodePcm(file, sr, ffmpegPcmDeps(ffmpegPath, signal, groupKey)),
    estimateKey: (pcm, sr) => {
      if (es) {
        try {
          const r = analyzeKeyEssentia(es, pcm, sr)
          log.debug(`key via essentia: ${r.key} strength=${r.strength.toFixed(2)}`)
          if (r.strength >= KEY_STRENGTH_MIN) return r.key
          log.debug(`key strength ${r.strength.toFixed(2)} < ${KEY_STRENGTH_MIN}; inconclusive`)
          return null
        } catch (err) {
          log.warn(`essentia key failed, using fallback: ${String(err)}`)
        }
      }
      return estimateKey(pcm, sr)
    },
    estimateBpm: (pcm, sr, range) => {
      if (es) {
        try {
          const r = analyzeBpmEssentia(es, pcm, range)
          log.debug(`bpm via essentia: ${r.bpm} confidence=${r.confidence.toFixed(2)}`)
          if (r.confidence >= BPM_CONFIDENCE_MIN) return r.bpm
          log.debug(
            `bpm confidence ${r.confidence.toFixed(2)} < ${BPM_CONFIDENCE_MIN}; inconclusive`
          )
          return null
        } catch (err) {
          log.warn(`essentia bpm failed, using fallback: ${String(err)}`)
        }
      }
      return estimateBpm(pcm, sr, range)
    },
    keyToCamelot,
    writeTags: writeAnalysisTags
  }
}

/**
 * Run the analysis off the main thread when an off-thread analyzer is wired
 * (production), replaying its captured logs into the live logger; otherwise
 * (tests, or if the worker fails) analyze inline. The worker writes the tags to
 * the file itself, so both paths leave the file in the same state.
 */
async function runAnalysis(
  file: string,
  config: AnalyzeKeyBpmConfig,
  services: TransformServices
): Promise<{ tags: AnalysisTags; samples: number }> {
  if (services.analyze) {
    try {
      const out = await services.analyze(file, config)
      for (const l of out.logs) services.log[l.level](l.message)
      return { tags: out.tags, samples: out.samples }
    } catch (err) {
      services.log.warn(`off-thread analysis failed, running inline: ${String(err)}`)
    }
  }
  return analyzeTrack(
    file,
    config,
    buildAnalyzeDeps(services.log, services.bin.ffmpeg, services.signal, services.groupKey)
  )
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
 * TKEY, TBPM, and a TXXX:CAMELOT frame. Uses Essentia (WASM) when available and
 * falls back to the pure-TS estimators otherwise; low-confidence results are
 * dropped as inconclusive. Skip-on-failure so a bad analysis never aborts the
 * chain or drops other tags.
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
    const { tags, samples } = await runAnalysis(ctx.workingFile, config, services)
    const seconds = (samples / ANALYSIS_SR).toFixed(1)
    services.log.debug(`decoded ${samples} samples (${seconds}s @ ${ANALYSIS_SR}Hz)`)
    const detected: string[] = []
    if (config.detectKey) {
      detected.push(tags.key ? `key=${tags.key} (${tags.camelot ?? '?'})` : 'key=inconclusive')
    }
    if (config.detectBpm)
      detected.push(tags.bpm !== undefined ? `bpm=${tags.bpm}` : 'bpm=inconclusive')
    if (tags.key || tags.bpm) services.log.info(`wrote ${detected.join(' ')}`)
    else services.log.warn(`nothing detected (${detected.join(' ') || 'all analyses disabled'})`)
  }
}
