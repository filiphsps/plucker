// src/shared/ffmpeg-output.test.ts
import { describe, it, expect } from 'vitest'
import {
  parseSilenceRegions,
  parseDurationSec,
  parseBitrateKbps,
  hasTrimmableSilence,
  measureEdgeSilence
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

  // silenceremove only strips silence anchored at the literal stream edge. A
  // region that starts after some audio (or ends before EOF) is NOT removed, so
  // it must not be reported as trimmable — otherwise we log a trim that never
  // happens and the silence stays on the waveform.
  it('ignores near-edge silence that is not anchored to the edge', () => {
    const nearStart = [{ start: 0.4, end: 0.9 }]
    const nearEnd = [{ start: 200, end: 200.8 }]
    expect(hasTrimmableSilence(nearStart, dur, 'start')).toBe(false)
    expect(hasTrimmableSilence(nearEnd, dur, 'end')).toBe(false)
    expect(hasTrimmableSilence(nearStart, dur, 'both')).toBe(false)
  })
})

describe('measureEdgeSilence', () => {
  const dur = 201.2
  const both = [
    { start: 0, end: 1.5 },
    { start: 199.9, end: 201.2 }
  ]

  it('measures leading and trailing seconds for mode both', () => {
    expect(measureEdgeSilence(both, dur, 'both')).toEqual({ leadingSec: 1.5, trailingSec: 1.3 })
  })

  it('only measures the requested end', () => {
    expect(measureEdgeSilence(both, dur, 'start')).toEqual({ leadingSec: 1.5, trailingSec: 0 })
    expect(measureEdgeSilence(both, dur, 'end')).toEqual({ leadingSec: 0, trailingSec: 1.3 })
  })

  it('reports zero trailing when the duration is unknown', () => {
    expect(measureEdgeSilence(both, null, 'both')).toEqual({ leadingSec: 1.5, trailingSec: 0 })
  })

  it('ignores mid-track silence', () => {
    expect(measureEdgeSilence([{ start: 90, end: 92 }], dur, 'both')).toEqual({
      leadingSec: 0,
      trailingSec: 0
    })
  })

  // Silence that starts after some audio (or ends before EOF) is not removed by
  // silenceremove, so it must measure as zero rather than reporting a phantom trim.
  it('ignores near-edge silence that is not anchored to the edge', () => {
    expect(measureEdgeSilence([{ start: 0.4, end: 0.9 }], dur, 'start')).toEqual({
      leadingSec: 0,
      trailingSec: 0
    })
    expect(measureEdgeSilence([{ start: 200, end: 200.8 }], dur, 'end')).toEqual({
      leadingSec: 0,
      trailingSec: 0
    })
  })
})
