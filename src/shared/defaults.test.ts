// src/shared/defaults.test.ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_TRANSFORMS } from './defaults'

describe('DEFAULT_TRANSFORMS', () => {
  it('places square-cover last in the default chain', () => {
    const last = DEFAULT_TRANSFORMS[DEFAULT_TRANSFORMS.length - 1]
    expect(last.type).toBe('square-cover')
    expect(last.enabled).toBe(true)
  })

  it('includes trim-silence (both ends, true silence) right after auto-tag', () => {
    const entry = DEFAULT_TRANSFORMS[1]
    expect(entry.type).toBe('trim-silence')
    expect(entry.enabled).toBe(true)
    expect(entry.config).toEqual({ mode: 'both', thresholdDb: -90, minDurationSec: 0.1 })
  })
})
