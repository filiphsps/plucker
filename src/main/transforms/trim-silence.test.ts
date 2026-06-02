// src/main/transforms/trim-silence.test.ts
import { describe, it, expect } from 'vitest'
import { trimSilenceTransform } from './trim-silence'

describe('trimSilenceTransform', () => {
  it('is a multiple-allowed, skip-on-failure transform with the expected type', () => {
    expect(trimSilenceTransform.type).toBe('trim-silence')
    expect(trimSilenceTransform.allowMultiple).toBe(true)
    expect(trimSilenceTransform.failureMode).toBe('skip')
  })

  it('defaults to trimming both ends at true silence', () => {
    expect(trimSilenceTransform.defaultConfig).toEqual({
      mode: 'both',
      thresholdDb: -90,
      minDurationSec: 0.1
    })
  })

  it('exposes mode, threshold and min-duration config fields', () => {
    const keys = trimSilenceTransform.configSchema.map((f) => f.key)
    expect(keys).toEqual(['mode', 'thresholdDb', 'minDurationSec'])
    const mode = trimSilenceTransform.configSchema.find((f) => f.key === 'mode')!
    expect(mode.type).toBe('enum')
  })
})
