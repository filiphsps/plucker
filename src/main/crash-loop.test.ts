import { describe, it, expect } from 'vitest'
import { createCrashLoopDetector } from './crash-loop'

describe('createCrashLoopDetector', () => {
  it('treats a single crash as recoverable', () => {
    const d = createCrashLoopDetector({ threshold: 3, windowMs: 30_000 })
    expect(d.record(0)).toBe(false)
  })

  it('recovers up to `threshold` crashes, then trips on the next within the window', () => {
    const d = createCrashLoopDetector({ threshold: 3, windowMs: 30_000 })
    expect(d.record(0)).toBe(false)
    expect(d.record(1_000)).toBe(false)
    expect(d.record(2_000)).toBe(false)
    expect(d.record(3_000)).toBe(true) // 4th crash within 30s → loop
  })

  it('forgets crashes older than the window so spaced-out crashes never trip', () => {
    const d = createCrashLoopDetector({ threshold: 3, windowMs: 30_000 })
    expect(d.record(0)).toBe(false)
    expect(d.record(40_000)).toBe(false) // first dropped (≥30s old)
    expect(d.record(80_000)).toBe(false)
    expect(d.record(120_000)).toBe(false)
  })

  it('slides the window rather than resetting it at fixed boundaries', () => {
    const d = createCrashLoopDetector({ threshold: 2, windowMs: 10_000 })
    expect(d.record(0)).toBe(false)
    expect(d.record(5_000)).toBe(false)
    expect(d.record(9_000)).toBe(true) // 3 within 10s
    // t=11000 drops only the t=0 crash; {5000,9000,11000} is still 3 > 2 → still a loop.
    expect(d.record(11_000)).toBe(true)
  })

  it('reset() clears the history', () => {
    const d = createCrashLoopDetector({ threshold: 1, windowMs: 30_000 })
    expect(d.record(0)).toBe(false)
    expect(d.record(1)).toBe(true)
    d.reset()
    expect(d.record(2)).toBe(false)
  })
})
