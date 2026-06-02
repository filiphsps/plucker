import { describe, it, expect } from 'vitest'
import { fft } from './fft'

describe('fft', () => {
  it('transforms a DC signal into a single non-zero bin at index 0', () => {
    const re = new Float32Array([1, 1, 1, 1])
    const im = new Float32Array([0, 0, 0, 0])
    fft(re, im)
    expect(re[0]).toBeCloseTo(4, 5)
    expect(re[1]).toBeCloseTo(0, 5)
    expect(re[2]).toBeCloseTo(0, 5)
    expect(re[3]).toBeCloseTo(0, 5)
  })

  it('puts an impulse signal into a flat-magnitude spectrum', () => {
    const re = new Float32Array([1, 0, 0, 0])
    const im = new Float32Array([0, 0, 0, 0])
    fft(re, im)
    for (let k = 0; k < 4; k++) {
      expect(Math.hypot(re[k], im[k])).toBeCloseTo(1, 5)
    }
  })

  it('throws when the length is not a power of two', () => {
    expect(() => fft(new Float32Array(3), new Float32Array(3))).toThrow()
  })
})
