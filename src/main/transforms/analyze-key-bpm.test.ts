import { describe, it, expect, vi } from 'vitest'
import { analyzeTrack, analyzeKeyBpmTransform } from './analyze-key-bpm'

const pcm = new Float32Array([0, 1, 0, -1])
const baseDeps = {
  decode: vi.fn(async () => pcm),
  estimateKey: vi.fn(() => 'Am'),
  estimateBpm: vi.fn(() => 124),
  keyToCamelot: vi.fn(() => '8A'),
  writeTags: vi.fn()
}

describe('analyzeTrack', () => {
  it('writes key (+camelot) and BPM when both are enabled', async () => {
    const deps = { ...baseDeps, writeTags: vi.fn() }
    await analyzeTrack(
      '/tmp/a.mp3',
      { detectKey: true, detectBpm: true, minBpm: 70, maxBpm: 180 },
      deps
    )
    expect(deps.writeTags).toHaveBeenCalledWith('/tmp/a.mp3', {
      key: 'Am',
      camelot: '8A',
      bpm: 124
    })
  })

  it('skips key analysis when detectKey is false', async () => {
    const estimateKey = vi.fn(() => 'Am')
    const writeTags = vi.fn()
    await analyzeTrack(
      '/tmp/a.mp3',
      { detectKey: false, detectBpm: true, minBpm: 70, maxBpm: 180 },
      { ...baseDeps, estimateKey, writeTags }
    )
    expect(estimateKey).not.toHaveBeenCalled()
    expect(writeTags).toHaveBeenCalledWith('/tmp/a.mp3', { bpm: 124 })
  })

  it('passes the configured BPM range to the estimator', async () => {
    const estimateBpm = vi.fn(() => 128)
    await analyzeTrack(
      '/tmp/a.mp3',
      { detectKey: false, detectBpm: true, minBpm: 90, maxBpm: 160 },
      { ...baseDeps, estimateBpm }
    )
    expect(estimateBpm).toHaveBeenCalledWith(pcm, expect.any(Number), { minBpm: 90, maxBpm: 160 })
  })

  it('does not write tags when nothing is detected', async () => {
    const writeTags = vi.fn()
    await analyzeTrack(
      '/tmp/a.mp3',
      { detectKey: true, detectBpm: true, minBpm: 70, maxBpm: 180 },
      { ...baseDeps, estimateKey: () => null, estimateBpm: () => null, writeTags }
    )
    expect(writeTags).not.toHaveBeenCalled()
  })
})

describe('analyzeKeyBpmTransform', () => {
  it('is a non-multiple, skip-on-failure transform with the expected type', () => {
    expect(analyzeKeyBpmTransform.type).toBe('analyze-key-bpm')
    expect(analyzeKeyBpmTransform.allowMultiple).toBe(false)
    expect(analyzeKeyBpmTransform.failureMode).toBe('skip')
    expect(analyzeKeyBpmTransform.defaultConfig).toEqual({
      detectKey: true,
      detectBpm: true,
      minBpm: 70,
      maxBpm: 180
    })
  })
})
