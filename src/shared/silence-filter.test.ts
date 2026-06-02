// src/shared/silence-filter.test.ts
import { describe, it, expect } from 'vitest'
import { silenceRemoveFilter } from './silence-filter'

describe('silenceRemoveFilter', () => {
  it('returns null for mode none', () => {
    expect(silenceRemoveFilter({ mode: 'none', thresholdDb: -90, minDurationSec: 0.1 })).toBeNull()
  })

  it('trims only the leading silence for mode start', () => {
    const f = silenceRemoveFilter({ mode: 'start', thresholdDb: -90, minDurationSec: 0.1 })
    expect(f).toBe('silenceremove=start_periods=1:start_threshold=-90dB:start_duration=0.1')
  })

  it('reverses, trims, reverses back for mode end', () => {
    const f = silenceRemoveFilter({ mode: 'end', thresholdDb: -50, minDurationSec: 0.2 })
    expect(f).toBe(
      'areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_duration=0.2,areverse'
    )
  })

  it('chains start then reversed end for mode both', () => {
    const f = silenceRemoveFilter({ mode: 'both', thresholdDb: -90, minDurationSec: 0.1 })
    expect(f).toBe(
      'silenceremove=start_periods=1:start_threshold=-90dB:start_duration=0.1,' +
        'areverse,silenceremove=start_periods=1:start_threshold=-90dB:start_duration=0.1,areverse'
    )
  })
})
