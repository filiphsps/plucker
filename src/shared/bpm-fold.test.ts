import { describe, it, expect } from 'vitest'
import { foldBpm } from './bpm-fold'

const range = { minBpm: 70, maxBpm: 180 }

describe('foldBpm', () => {
  it('leaves an in-range tempo untouched (just rounded)', () => {
    expect(foldBpm(128.4, range)).toBe(128)
    expect(foldBpm(150, range)).toBe(150)
  })

  it('doubles a too-slow tempo into range', () => {
    expect(foldBpm(60, range)).toBe(120)
    expect(foldBpm(35, range)).toBe(70) // 35*2=70, already in range
  })

  it('halves a too-fast tempo into range', () => {
    expect(foldBpm(240, range)).toBe(120)
    expect(foldBpm(300, range)).toBe(150) // 300 -> 150
  })

  it('handles a sub-octave range without looping forever', () => {
    // 100 cannot fit in [120,160]; nearest octave (100) is returned, no hang.
    expect(foldBpm(100, { minBpm: 120, maxBpm: 160 })).toBe(100)
  })

  it('returns rounded input for degenerate inputs', () => {
    expect(foldBpm(0, range)).toBe(0)
    expect(foldBpm(-5, range)).toBe(-5)
    expect(foldBpm(120, { minBpm: 70, maxBpm: 0 })).toBe(120)
  })
})
