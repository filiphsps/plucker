import { describe, it, expect } from 'vitest'
import { clamp, timeAtFraction, downsamplePeaks, snippetToTrackFraction } from './waveform-utils'

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

describe('snippetToTrackFraction', () => {
  it('maps a snippet position onto the whole-track fraction', () => {
    // 16s snippet [8,24] over a 160s track: pos 0 → 8/160, pos 1 → 24/160.
    expect(snippetToTrackFraction(0, [8, 24], 160)).toBeCloseTo(0.05, 5)
    expect(snippetToTrackFraction(0.5, [8, 24], 160)).toBeCloseTo(0.1, 5)
    expect(snippetToTrackFraction(1, [8, 24], 160)).toBeCloseTo(0.15, 5)
  })

  it('falls back to the raw snippet position when the duration is unknown', () => {
    expect(snippetToTrackFraction(0.42, [8, 24], null)).toBe(0.42)
    expect(snippetToTrackFraction(0.42, [8, 24], 0)).toBe(0.42)
  })

  it('clamps the result into [0,1]', () => {
    expect(snippetToTrackFraction(1, [8, 24], 10)).toBe(1) // 24/10 → clamped
    expect(snippetToTrackFraction(-1, [8, 24], 160)).toBe(0) // negative → clamped
  })
})
