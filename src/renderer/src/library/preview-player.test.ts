import { describe, it, expect } from 'vitest'
import { easeInOut, loopPosition } from './preview-player'

describe('preview-player helpers', () => {
  it('easeInOut is a smooth 0→1 S-curve', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5)
    expect(easeInOut(0.25)).toBeLessThan(0.25) // eased-in (slow start)
  })
  it('loopPosition maps currentTime within [t0,t1) to 0..1 and wraps at the end', () => {
    expect(loopPosition(6, 6, 22)).toBeCloseTo(0, 5) // start
    expect(loopPosition(14, 6, 22)).toBeCloseTo(0.5, 5) // middle
    expect(loopPosition(22, 6, 22)).toBeCloseTo(0, 5) // t1 wraps back to 0
  })
})
