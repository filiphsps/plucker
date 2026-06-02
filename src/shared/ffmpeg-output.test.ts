// src/shared/ffmpeg-output.test.ts
import { describe, it, expect } from 'vitest'
import {
  parseSilenceRegions,
  parseDurationSec,
  parseBitrateKbps,
  hasTrimmableSilence
} from './ffmpeg-output'

const SAMPLE = `
Input #0, mp3, from 'track.mp3':
  Duration: 00:03:21.20, start: 0.025057, bitrate: 320 kb/s
    Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 320 kb/s
[silencedetect @ 0x55] silence_start: 0
[silencedetect @ 0x55] silence_end: 1.5 | silence_duration: 1.5
[silencedetect @ 0x55] silence_start: 199.9
[silencedetect @ 0x55] silence_end: 201.2 | silence_duration: 1.3
`

describe('parseSilenceRegions', () => {
  it('pairs each silence_start with its silence_end', () => {
    expect(parseSilenceRegions(SAMPLE)).toEqual([
      { start: 0, end: 1.5 },
      { start: 199.9, end: 201.2 }
    ])
  })

  it('returns an empty array when there is no silence', () => {
    expect(parseSilenceRegions('no silence here')).toEqual([])
  })
})

describe('parseDurationSec', () => {
  it('parses HH:MM:SS.ss into seconds', () => {
    expect(parseDurationSec(SAMPLE)).toBeCloseTo(201.2, 1)
  })

  it('returns null when no duration is present', () => {
    expect(parseDurationSec('nope')).toBeNull()
  })
})

describe('parseBitrateKbps', () => {
  it('prefers the audio stream bitrate', () => {
    expect(parseBitrateKbps(SAMPLE)).toBe(320)
  })

  it('returns null when no bitrate is present', () => {
    expect(parseBitrateKbps('nope')).toBeNull()
  })
})

describe('hasTrimmableSilence', () => {
  const dur = 201.2
  const leading = [{ start: 0, end: 1.5 }]
  const trailing = [{ start: 199.9, end: 201.2 }]
  const mid = [{ start: 90, end: 92 }]

  it('detects leading silence for mode start', () => {
    expect(hasTrimmableSilence(leading, dur, 'start')).toBe(true)
    expect(hasTrimmableSilence(trailing, dur, 'start')).toBe(false)
  })

  it('detects trailing silence for mode end', () => {
    expect(hasTrimmableSilence(trailing, dur, 'end')).toBe(true)
    expect(hasTrimmableSilence(leading, dur, 'end')).toBe(false)
  })

  it('ignores mid-track silence', () => {
    expect(hasTrimmableSilence(mid, dur, 'both')).toBe(false)
  })

  it('mode both accepts either end', () => {
    expect(hasTrimmableSilence(leading, dur, 'both')).toBe(true)
    expect(hasTrimmableSilence(trailing, dur, 'both')).toBe(true)
  })
})
