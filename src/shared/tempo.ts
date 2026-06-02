// src/shared/tempo.ts
import { fft } from './fft'

export interface TempoRange {
  minBpm: number
  maxBpm: number
}

const FRAME = 1024
const HOP = 512

// Lags are searched across a wide tempo band so a track's true fundamental is
// always found; the detected tempo is then octave-folded into the caller's
// preferred [minBpm, maxBpm] range. (Searching only the narrow range would miss
// a fundamental whose lag falls outside it, leaving nothing to fold.)
const SEARCH_MIN_BPM = 40
const SEARCH_MAX_BPM = 240

/**
 * Spectral-flux onset envelope: per frame, the sum of positive magnitude
 * increases over the previous frame. Strong onsets (beats) become peaks.
 */
function onsetEnvelope(pcm: Float32Array): number[] {
  const window = new Float32Array(FRAME)
  for (let i = 0; i < FRAME; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1))
  }
  const re = new Float32Array(FRAME)
  const im = new Float32Array(FRAME)
  const half = FRAME / 2
  let prev = new Float32Array(half)
  const env: number[] = []

  for (let start = 0; start + FRAME <= pcm.length; start += HOP) {
    for (let i = 0; i < FRAME; i++) {
      re[i] = pcm[start + i] * window[i]
      im[i] = 0
    }
    fft(re, im)
    let flux = 0
    const cur = new Float32Array(half)
    for (let k = 0; k < half; k++) {
      const mag = Math.hypot(re[k], im[k])
      cur[k] = mag
      const diff = mag - prev[k]
      if (diff > 0) flux += diff
    }
    env.push(flux)
    prev = cur
  }
  return env
}

/** Parabolic interpolation around a discrete peak; returns the refined offset. */
function refinePeak(y0: number, y1: number, y2: number): number {
  const denom = y0 - 2 * y1 + y2
  return denom === 0 ? 0 : (0.5 * (y0 - y2)) / denom
}

/**
 * Estimate tempo (BPM) of mono PCM. Builds an onset envelope, autocorrelates it
 * over the lag window implied by [minBpm, maxBpm], refines the peak with
 * parabolic interpolation, then octave-folds the result into range. Returns null
 * when the signal has no detectable rhythmic structure.
 */
export function estimateBpm(
  pcm: Float32Array,
  sampleRate: number,
  range: TempoRange
): number | null {
  const env = onsetEnvelope(pcm)
  if (env.length < 8) return null

  // Mean-subtract so the autocorrelation peaks on periodicity, not DC.
  const mean = env.reduce((a, b) => a + b, 0) / env.length
  const e = env.map((v) => v - mean)
  const energy = e.reduce((a, b) => a + b * b, 0)
  if (energy < 1e-9) return null

  const hopRateHz = sampleRate / HOP // envelope samples per second
  const searchMax = Math.max(SEARCH_MAX_BPM, range.maxBpm)
  const searchMin = Math.min(SEARCH_MIN_BPM, range.minBpm)
  const minLag = Math.floor((60 / searchMax) * hopRateHz)
  const maxLag = Math.ceil((60 / searchMin) * hopRateHz)

  const acAt = (lag: number): number => {
    let sum = 0
    for (let i = 0; i + lag < e.length; i++) sum += e[i] * e[i + lag]
    return sum
  }

  let bestLag = -1
  let bestVal = -Infinity
  for (let lag = Math.max(1, minLag); lag <= Math.min(maxLag, e.length - 2); lag++) {
    const sum = acAt(lag)
    if (sum > bestVal) {
      bestVal = sum
      bestLag = lag
    }
  }
  if (bestLag < 1) return null

  // Refine the lag to sub-sample precision.
  const refined = bestLag + refinePeak(acAt(bestLag - 1), bestVal, acAt(bestLag + 1))

  let bpm = (60 * hopRateHz) / refined
  while (bpm < range.minBpm) bpm *= 2
  while (bpm > range.maxBpm) bpm /= 2
  return Math.round(bpm)
}
