import { describe, it, expect } from 'vitest'
import { estimateKey } from './chroma'

const SR = 11025

/** Generate `seconds` of a sine wave at `freq` Hz. */
function sine(freq: number, seconds: number, sr = SR): Float32Array {
  const out = new Float32Array(Math.floor(seconds * sr))
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / sr)
  return out
}

/** Sum of several sines (a chord). */
function chord(freqs: number[], seconds: number, sr = SR): Float32Array {
  const parts = freqs.map((f) => sine(f, seconds, sr))
  const out = new Float32Array(parts[0].length)
  for (const p of parts) for (let i = 0; i < out.length; i++) out[i] += p[i] / parts.length
  return out
}

describe('estimateKey', () => {
  it('identifies a pure A note as an A-rooted key', () => {
    // 440 Hz is A4. A strong single pitch class biases toward its key.
    const key = estimateKey(sine(440, 4), SR)
    expect(key).toMatch(/^A/)
  })

  it('identifies a C-major triad (C4 E4 G4) as C major', () => {
    const key = estimateKey(chord([261.63, 329.63, 392.0], 4), SR)
    expect(key).toBe('C')
  })

  it('returns null for silence', () => {
    expect(estimateKey(new Float32Array(SR * 2), SR)).toBeNull()
  })
})
