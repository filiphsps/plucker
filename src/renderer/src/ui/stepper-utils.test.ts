import { describe, it, expect } from 'vitest'
import { clampStep } from './stepper-utils'

describe('clampStep', () => {
  it('increments within range', () => {
    expect(clampStep(4, +1, 1, 16)).toBe(5)
  })
  it('does not exceed max', () => {
    expect(clampStep(16, +1, 1, 16)).toBe(16)
  })
  it('does not go below min', () => {
    expect(clampStep(1, -1, 1, 16)).toBe(1)
  })
})
