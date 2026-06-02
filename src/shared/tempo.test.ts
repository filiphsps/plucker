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

  it('returns null for silence', () => {
    expect(estimateBpm(new Float32Array(SR * 4), SR, { minBpm: 70, maxBpm: 180 })).toBeNull()
  })
})
