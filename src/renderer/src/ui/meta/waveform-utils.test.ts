import { describe, it, expect } from 'vitest'
import { clamp, timeAtFraction } from './waveform-utils'

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
