// src/shared/defaults.test.ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_TRANSFORMS } from './defaults'

describe('DEFAULT_TRANSFORMS', () => {
  it('places square-cover last in the default chain', () => {
    const last = DEFAULT_TRANSFORMS[DEFAULT_TRANSFORMS.length - 1]
    expect(last.type).toBe('square-cover')
    expect(last.enabled).toBe(true)
  })

  it('opens the default chain with auto-tag enabled', () => {
    const entry = DEFAULT_TRANSFORMS[0]
    expect(entry.type).toBe('auto-tag')
    expect(entry.enabled).toBe(true)
  })
})
