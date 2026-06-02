import { describe, it, expect } from 'vitest'
import { estimateBpm } from './tempo'

const SR = 11025

/** A click train at `bpm`: short noise bursts spaced one beat apart. */
function clickTrain(bpm: number, seconds: number, sr = SR): Float32Array {
  const out = new Float32Array(Math.floor(seconds * sr))
  const period = Math.round((60 / bpm) * sr)
  for (let i = 0; i < out.length; i += period) {
    for (let j = 0; j < 64 && i + j < out.length; j++) {
      out[i + j] = 1 - j / 64 // a short decaying transient
    }
  }
  return out
}

describe('estimateBpm', () => {
  it('recovers 120 BPM from a 120 BPM click train', () => {
    const bpm = estimateBpm(clickTrain(120, 12), SR, { minBpm: 70, maxBpm: 180 })
    expect(bpm).not.toBeNull()
    expect(Math.abs((bpm as number) - 120)).toBeLessThanOrEqual(2)
  })

  it('folds a half-tempo (60 BPM) train into the configured range', () => {
    // 60 is below minBpm 70, so its detected tempo should fold up to ~120.
    const bpm = estimateBpm(clickTrain(60, 16), SR, { minBpm: 70, maxBpm: 180 })
    expect(bpm).not.toBeNull()
    expect(Math.abs((bpm as number) - 120)).toBeLessThanOrEqual(3)
  })

  it('does not double a 100 BPM beat into 200 (octave-error resistance)', () => {
    // Add an offbeat (eighth-note) accent so naive autocorrelation is tempted by
    // the 200 BPM lag; the tempo prior should still resolve ~100.
    const out = new Float32Array(Math.floor(14 * SR))
    const beat = Math.round((60 / 100) * SR)
    for (let i = 0; i < out.length; i += beat) {
      for (let j = 0; j < 64 && i + j < out.length; j++) out[i + j] = 1 - j / 64
      const off = i + Math.round(beat / 2)
      for (let j = 0; j < 48 && off + j < out.length; j++) out[off + j] = 0.5 * (1 - j / 48)
    }
    const bpm = estimateBpm(out, SR, { minBpm: 70, maxBpm: 180 })
    expect(bpm).not.toBeNull()
    expect(Math.abs((bpm as number) - 100)).toBeLessThanOrEqual(3)
  })

  it('returns null for silence', () => {
    expect(estimateBpm(new Float32Array(SR * 4), SR, { minBpm: 70, maxBpm: 180 })).toBeNull()
  })
})
