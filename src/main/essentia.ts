// src/main/essentia.ts
//
// Essentia.js-backed key and tempo analysis. Essentia is the C++ MIR library
// behind many production music apps; its KeyExtractor and RhythmExtractor2013
// are far more accurate than the hand-rolled chroma/autocorrelation estimators
// in src/shared. This module is the only place that touches the WASM backend —
// it is loaded lazily and once, and the pure mapping/folding logic is split out
// so it can be unit-tested without booting WASM.
import type { TempoRange } from '../shared/tempo'
import { foldBpm } from '../shared/bpm-fold'

/** A std::vector<float> handle owned by the WASM heap; must be freed via delete(). */
export interface EssentiaVector {
  delete(): void
}

/** The subset of the Essentia.js instance we use. Lets tests inject a fake. */
export interface EssentiaLike {
  arrayToVector(arr: Float32Array): EssentiaVector
  KeyExtractor(
    audio: EssentiaVector,
    averageDetuningCorrection: boolean,
    frameSize: number,
    hopSize: number,
    hpcpSize: number,
    maxFrequency: number,
    maximumSpectralPeaks: number,
    minFrequency: number,
    pcpThreshold: number,
    profileType: string,
    sampleRate: number
  ): { key: string; scale: string; strength: number }
  RhythmExtractor2013(
    signal: EssentiaVector,
    maxTempo: number,
    method: string,
    minTempo: number
  ): {
    bpm: number
    confidence: number
    ticks?: EssentiaVector
    estimates?: EssentiaVector
    bpmIntervals?: EssentiaVector
  }
}

// 'edma' (Electronic Dance Music Annotations) is Essentia's best-performing key
// profile in their published cross-genre evaluation — it is not EDM-specific.
const KEY_PROFILE = 'edma'

// KeyExtractor.strength is a 0–1 HPCP/profile correlation. Below this the key is
// close to a coin-flip, so we report inconclusive rather than tag a wrong key.
export const KEY_STRENGTH_MIN = 0.5

// RhythmExtractor2013 (multifeature) confidence spans ~0–5.32 (Essentia treats
// >1.5 as "somewhat confident"). Real full tracks comfortably clear this floor;
// it exists to drop near-noise where the BPM would be a guess. Tunable.
export const BPM_CONFIDENCE_MIN = 1.0

// Essentia may spell black keys as flats depending on profile; Camelot lookup
// and our tags use sharps, so normalise.
const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#'
}

/** Map Essentia's {key, scale} to our tag format ("C", minor → "Cm"). */
export function essentiaKeyToString(key: string, scale: string): string {
  const root = FLAT_TO_SHARP[key] ?? key
  return scale === 'minor' ? `${root}m` : root
}

let cached: EssentiaLike | null | undefined

/**
 * Lazily construct the singleton Essentia instance, booting the WASM backend on
 * first use and caching the result (or null if it fails to load — callers then
 * fall back to the pure-TS estimators). Synchronous: the npm build embeds the
 * WASM binary, so `new Essentia(EssentiaWASM)` compiles it inline.
 */
export function getEssentia(onError?: (msg: string) => void): EssentiaLike | null {
  if (cached !== undefined) return cached
  try {
    // Lazy require so unit tests of the pure helpers never load the 2.5 MB WASM.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('essentia.js') as {
      Essentia: new (wasm: unknown) => EssentiaLike
      EssentiaWASM: unknown
    }
    cached = new mod.Essentia(mod.EssentiaWASM)
  } catch (err) {
    onError?.(`essentia init failed: ${String(err)}`)
    cached = null
  }
  return cached
}

export interface KeyResult {
  key: string
  strength: number
}

/** Run KeyExtractor over `pcm` (mono, `sampleRate`). Frees the input vector. */
export function analyzeKeyEssentia(
  es: EssentiaLike,
  pcm: Float32Array,
  sampleRate: number
): KeyResult {
  const v = es.arrayToVector(pcm)
  try {
    const r = es.KeyExtractor(v, true, 4096, 4096, 12, 3500, 60, 25, 0.2, KEY_PROFILE, sampleRate)
    return { key: essentiaKeyToString(r.key, r.scale), strength: r.strength }
  } finally {
    v.delete()
  }
}

export interface BpmResult {
  bpm: number
  confidence: number
}

/**
 * Run RhythmExtractor2013 (multifeature) over `pcm`, octave-fold the BPM into
 * `range`, and free every WASM vector it allocates. RhythmExtractor2013 assumes
 * a 44.1 kHz signal — the caller decodes at that rate.
 */
export function analyzeBpmEssentia(
  es: EssentiaLike,
  pcm: Float32Array,
  range: TempoRange
): BpmResult {
  const v = es.arrayToVector(pcm)
  try {
    const r = es.RhythmExtractor2013(v, 208, 'multifeature', 40)
    r.ticks?.delete()
    r.estimates?.delete()
    r.bpmIntervals?.delete()
    return { bpm: foldBpm(r.bpm, range), confidence: r.confidence }
  } finally {
    v.delete()
  }
}
