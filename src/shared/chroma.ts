// src/shared/chroma.ts
import { fft } from './fft'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

// Temperley's revised key profiles (from "Music and Probability"). These track
// real tonal music better than the original Krumhansl–Schmuckler weights,
// noticeably reducing relative-major/minor and perfect-fifth confusions.
const MAJOR_PROFILE = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0]
const MINOR_PROFILE = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0]

// Larger window than a generic STFT: at 11025 Hz this gives ~1.3 Hz bins, enough
// to separate low (bass) semitones where key information is dense.
const FRAME = 8192
const HOP = FRAME / 4

// Sub-semitone resolution for the chromagram. Accumulating into 3 bins per
// semitone lets us estimate the recording's global tuning offset and realign
// before collapsing to 12 pitch classes — many tracks are not at A440.
const BINS_PER_SEMITONE = 3
const HI_BINS = 12 * BINS_PER_SEMITONE // 36

// Musical frequency range to consider (≈ A1 .. C7). Below this is mostly rumble;
// above it, harmonics dominate and pitch class is unreliable.
const MIN_FREQ = 55
const MAX_FREQ = 2093

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
 * Build a high-resolution (36-bin) chromagram, then collapse it to 12 pitch
 * classes after estimating and correcting the global tuning offset. Magnitudes
 * are square-root compressed so a few loud partials don't swamp the profile.
 * Returns null when the signal carries effectively no tonal energy.
 */
function chromagram(pcm: Float32Array, sampleRate: number): number[] | null {
  const hi = new Array(HI_BINS).fill(0)
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
    for (let k = 1; k < FRAME / 2; k++) {
      const freq = (k * sampleRate) / FRAME
      if (freq < MIN_FREQ || freq > MAX_FREQ) continue
      const mag = Math.sqrt(Math.hypot(re[k], im[k])) // compress dynamics
      // Continuous pitch in 36ths of an octave, indexed from C.
      const semis = 12 * Math.log2(freq / 440) + 69 // MIDI, A440 reference
      const bin = ((Math.round(semis * BINS_PER_SEMITONE) % HI_BINS) + HI_BINS) % HI_BINS
      hi[bin] += mag
      total += mag
    }
  }

  if (total < 1e-6) return null

  // Estimate tuning: of the BINS_PER_SEMITONE sub-positions, the one carrying the
  // most energy is where the music's pitches actually sit. Convert that phase to
  // a signed semitone offset δ in (−0.5, 0.5].
  let bestOffset = 0
  let bestEnergy = -1
  for (let off = 0; off < BINS_PER_SEMITONE; off++) {
    let energy = 0
    for (let b = off; b < HI_BINS; b += BINS_PER_SEMITONE) energy += hi[b]
    if (energy > bestEnergy) {
      bestEnergy = energy
      bestOffset = off
    }
  }
  let delta = bestOffset / BINS_PER_SEMITONE
  if (delta > 0.5) delta -= 1

  // Collapse to 12 classes, mapping each sub-bin to its tuning-corrected pitch
  // class — round(semitone − δ) — so notes near a semitone boundary land in the
  // right class instead of spilling into the neighbour.
  const chroma = new Array(12).fill(0)
  for (let b = 0; b < HI_BINS; b++) {
    const pc = ((Math.round(b / BINS_PER_SEMITONE - delta) % 12) + 12) % 12
    chroma[pc] += hi[b]
  }
  for (let i = 0; i < 12; i++) chroma[i] /= total
  return chroma
}

/**
 * Estimate the musical key of mono PCM: build a tuning-corrected chromagram and
 * correlate it against all 24 major/minor profile rotations, picking the best.
 * Major keys return "C".."B"; minor keys append "m" ("Am"). Returns null when
 * the signal is silent / has no tonal content.
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
