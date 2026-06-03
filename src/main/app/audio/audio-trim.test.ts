// src/main/audio-trim.test.ts
import { describe, it, expect, vi } from 'vitest'
import { trimSilence, detectArgs, encodeArgs, type TrimDeps } from './audio-trim'
import type { SilenceFilterOpts } from '@shared/silence-filter'

const BOTH: SilenceFilterOpts = { mode: 'both', thresholdDb: -90, minDurationSec: 0.1 }

const WITH_EDGE_SILENCE = `
  Duration: 00:03:21.20, start: 0.0, bitrate: 256 kb/s
    Stream #0:0: Audio: mp3, 44100 Hz, stereo, 256 kb/s
[silencedetect] silence_start: 0
[silencedetect] silence_end: 1.2 | silence_duration: 1.2
`

const NO_SILENCE = `
  Duration: 00:03:21.20, start: 0.0, bitrate: 320 kb/s
    Stream #0:0: Audio: mp3, 44100 Hz, stereo, 320 kb/s
`

describe('trimSilence', () => {
  it('returns the original file without encoding for mode none', async () => {
    const encode = vi.fn()
    const detect = vi.fn()
    const result = await trimSilence('/tmp/t.mp3', { ...BOTH, mode: 'none' }, { detect, encode })
    expect(result).toEqual({ file: '/tmp/t.mp3', trimmed: false, leadingSec: 0, trailingSec: 0 })
    expect(detect).not.toHaveBeenCalled()
    expect(encode).not.toHaveBeenCalled()
  })

  it('skips encoding when there is no edge silence', async () => {
    const encode = vi.fn()
    const deps: TrimDeps = { detect: vi.fn(async () => NO_SILENCE), encode }
    const result = await trimSilence('/tmp/t.mp3', BOTH, deps)
    expect(result).toEqual({ file: '/tmp/t.mp3', trimmed: false, leadingSec: 0, trailingSec: 0 })
    expect(encode).not.toHaveBeenCalled()
  })

  it('encodes to a sibling temp at the source bitrate when there is edge silence', async () => {
    const encode = vi.fn(async () => {})
    const deps: TrimDeps = { detect: vi.fn(async () => WITH_EDGE_SILENCE), encode }
    const result = await trimSilence('/tmp/t.mp3', BOTH, deps)
    // Leading region [0, 1.2] → 1.2s removed from the start; no trailing silence.
    expect(result).toEqual({
      file: '/tmp/t.mp3.trim.mp3',
      trimmed: true,
      leadingSec: 1.2,
      trailingSec: 0
    })
    expect(encode).toHaveBeenCalledWith(
      '/tmp/t.mp3',
      '/tmp/t.mp3.trim.mp3',
      'silenceremove=start_periods=1:start_threshold=-90dB:start_duration=0.1,' +
        'areverse,silenceremove=start_periods=1:start_threshold=-90dB:start_duration=0.1,areverse',
      256
    )
  })
})

describe('detectArgs', () => {
  it('builds a silencedetect probe to the null muxer', () => {
    const args = detectArgs('/tmp/t.mp3', BOTH)
    expect(args).toEqual([
      '-hide_banner',
      '-i',
      '/tmp/t.mp3',
      '-af',
      'silencedetect=noise=-90dB:d=0.1',
      '-f',
      'null',
      '-'
    ])
  })
})

describe('encodeArgs', () => {
  it('re-encodes audio with the filter while copying cover and metadata', () => {
    const args = encodeArgs('/in.mp3', '/out.mp3', 'silenceremove=...', 256)
    expect(args).toContain('-map')
    expect(args).toContain('libmp3lame')
    expect(args[args.indexOf('-b:a') + 1]).toBe('256k')
    expect(args[args.indexOf('-af') + 1]).toBe('silenceremove=...')
    expect(args[args.length - 1]).toBe('/out.mp3')
  })
})
