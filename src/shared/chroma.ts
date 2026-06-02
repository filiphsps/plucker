// src/shared/chroma.ts
import { fft } from './fft'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

// Krumhansl–Schmuckler key profiles (tone-weight templates).
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

const FRAME = 4096 // power of two; ~0.37 s at 11025 Hz
const HOP = FRAME / 2

/** Pearson correlation between two equal-length arrays. */
function pearson(a: number[], b: number[]): number {
  const n = a.length
  let ma = 0
  let mb = 0
  for (let i = 0; i < n; i++) {
    ma += a[i]
    mb += b[i]
  }
  ma /= n
  mb /= n
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma
    const y = b[i] - mb
    num += x * y
    da += x * x
    db += y * y
  }
  const den = Math.sqrt(da * db)
  return den === 0 ? 0 : num / den
}

/**
 * Accumulate a 12-bin chromagram (energy per pitch class) over the signal.
 * Returns null if the signal carries effectively no energy.
 */
function chromagram(pcm: Float32Array, sampleRate: number): number[] | null {
  const chroma = new Array(12).fill(0)
  const window = new Float32Array(FRAME)
  for (let i = 0; i < FRAME; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)) // Hann
  }
  const re = new Float32Array(FRAME)
  const im = new Float32Array(FRAME)
  let total = 0

  for (let start = 0; start + FRAME <= pcm.length; start += HOP) {
    for (let i = 0; i < FRAME; i++) {
      re[i] = pcm[start + i] * window[i]
      im[i] = 0
    }
    fft(re, im)
    // Only the lower half holds unique bins. Skip bin 0 (DC).
    for (let k = 1; k < FRAME / 2; k++) {
      const freq = (k * sampleRate) / FRAME
      if (freq < 27.5 || freq > 5000) continue // ~A0 .. above musical range
      const mag = Math.hypot(re[k], im[k])
      const midi = Math.round(69 + 12 * Math.log2(freq / 440))
      const pc = ((midi % 12) + 12) % 12
      chroma[pc] += mag
      total += mag
    }
  }

  if (total < 1e-6) return null
  for (let i = 0; i < 12; i++) chroma[i] /= total
  return chroma
}

/**
 * Estimate the musical key of mono PCM via the Krumhansl–Schmuckler algorithm:
 * correlate the chromagram against all 24 major/minor profile rotations and pick
 * the best. Major keys return "C".."B"; minor keys append "m" ("Am"). Returns
 * null when the signal is silent / has no tonal content.
 */
export function estimateKey(pcm: Float32Array, sampleRate: number): string | null {
  const chroma = chromagram(pcm, sampleRate)
  if (!chroma) return null

  let best = { score: -Infinity, name: '' }
  for (let rot = 0; rot < 12; rot++) {
    const major = MAJOR_PROFILE.map((_, i) => MAJOR_PROFILE[(i - rot + 12) % 12])
    const minor = MINOR_PROFILE.map((_, i) => MINOR_PROFILE[(i - rot + 12) % 12])
    const majorScore = pearson(chroma, major)
    const minorScore = pearson(chroma, minor)
    if (majorScore > best.score) best = { score: majorScore, name: NOTE_NAMES[rot] }
    if (minorScore > best.score) best = { score: minorScore, name: `${NOTE_NAMES[rot]}m` }
  }
  return best.name || null
}
