import { describe, it, expect } from 'vitest'
import { verifyMatch } from './mb-verify'

const opts = { durationToleranceSec: 5, nameSimilarityThreshold: 70 }

describe('verifyMatch', () => {
  it('accepts when duration is within tolerance and names agree', () => {
    expect(
      verifyMatch(
        { lengthMs: 200000, artist: 'Daft Punk', title: 'Da Funk' },
        { durationSec: 202, artist: 'Daft Punk', title: 'Da Funk' },
        opts
      ).ok
    ).toBe(true)
  })
  it('rejects when duration is too far off', () => {
    expect(
      verifyMatch(
        { lengthMs: 200000, artist: 'Daft Punk', title: 'Da Funk' },
        { durationSec: 240, artist: 'Daft Punk', title: 'Da Funk' },
        opts
      ).ok
    ).toBe(false)
  })
  it('rejects when names disagree even if duration matches', () => {
    expect(
      verifyMatch(
        { lengthMs: 200000, artist: 'Someone Else', title: 'Other Song' },
        { durationSec: 200, artist: 'Daft Punk', title: 'Da Funk' },
        opts
      ).ok
    ).toBe(false)
  })
  it('with no MB length, requires stronger name agreement (still accepts exact)', () => {
    expect(
      verifyMatch(
        { artist: 'Daft Punk', title: 'Da Funk' },
        { durationSec: 200, artist: 'Daft Punk', title: 'Da Funk' },
        opts
      ).ok
    ).toBe(true)
  })
  it('with no MB length, rejects a merely-similar name', () => {
    expect(
      verifyMatch(
        { artist: 'Daft Punk', title: 'Da Funk (Remix)' },
        { durationSec: 200, artist: 'Daft Punk', title: 'Around the World' },
        opts
      ).ok
    ).toBe(false)
  })
})
