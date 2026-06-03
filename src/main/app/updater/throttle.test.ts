import { describe, it, expect } from 'vitest'
import { nextPause } from './throttle'

describe('nextPause', () => {
  it('never pauses when throttling is disabled', () => {
    expect(nextPause(10_000_000, 0, 0)).toBe(0)
    expect(nextPause(10_000_000, -1, 0)).toBe(0)
  })

  it('does not pause until the per-second budget is spent', () => {
    expect(nextPause(500, 1000, 100)).toBe(0)
    expect(nextPause(999, 1000, 100)).toBe(0)
  })

  it('pauses for the rest of the second once the budget is reached', () => {
    expect(nextPause(1000, 1000, 200)).toBe(800)
    expect(nextPause(1500, 1000, 0)).toBe(1000)
  })

  it('does not pause when the window already ran a full second', () => {
    expect(nextPause(2000, 1000, 1000)).toBe(0)
    expect(nextPause(2000, 1000, 1500)).toBe(0)
  })
})
