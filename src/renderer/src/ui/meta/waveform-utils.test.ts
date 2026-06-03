import { describe, it, expect } from 'vitest'
import { clamp, timeAtFraction, downsamplePeaks } from './waveform-utils'

describe('clamp', () => {
  it('keeps values inside the range and clamps the rest', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})

describe('timeAtFraction', () => {
  it('maps a fraction to a timestamp within the duration', () => {
    expect(timeAtFraction(0, 240)).toBe(0)
    expect(timeAtFraction(0.5, 240)).toBe(120)
    expect(timeAtFraction(1, 240)).toBe(240)
  })

  it('clamps out-of-range fractions', () => {
    expect(timeAtFraction(-1, 240)).toBe(0)
    expect(timeAtFraction(2, 240)).toBe(240)
  })
})

describe('downsamplePeaks', () => {
  it('returns the input unchanged when already at or below the bucket count', () => {
    expect(downsamplePeaks([0.2, 0.8], 4)).toEqual([0.2, 0.8])
    expect(downsamplePeaks([], 4)).toEqual([])
  })

  it('takes the loudest peak within each bucket', () => {
    expect(downsamplePeaks([0, 1, 0.2, 0.9], 2)).toEqual([1, 0.9])
    expect(downsamplePeaks([0.1, 0.4, 0.3, 0.2, 0.9, 0.5], 3)).toEqual([0.4, 0.3, 0.9])
  })

  it('returns [] for a non-positive bucket count', () => {
    expect(downsamplePeaks([0.1, 0.2], 0)).toEqual([])
    expect(downsamplePeaks([0.1, 0.2], -3)).toEqual([])
  })
})
