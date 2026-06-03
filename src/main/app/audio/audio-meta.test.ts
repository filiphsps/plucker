import { describe, it, expect } from 'vitest'
import { parseFfmpegInfo } from './audio-meta'

const STEREO_320 = `
ffmpeg version 6.1.1 Copyright (c) 2000-2023 the FFmpeg developers
Input #0, mp3, from 'Midnight City.mp3':
  Metadata:
    title           : Midnight City
    artist          : M83
  Duration: 00:04:03.18, start: 0.025057, bitrate: 320 kb/s
  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 320 kb/s
`

const MONO_128 = `
Input #0, mp3, from 'voice.mp3':
  Duration: 00:01:09.50, start: 0.000000, bitrate: 128 kb/s
  Stream #0:0: Audio: mp3 (mp3float), 22050 Hz, mono, fltp, 128 kb/s
`

const SURROUND = `
Input #0, mov,mp4, from 'movie.m4a':
  Duration: 01:02:03.00, bitrate: 256 kb/s
  Stream #0:0: Audio: aac (LC), 48000 Hz, 5.1, fltp, 256 kb/s
`

describe('parseFfmpegInfo', () => {
  it('parses a stereo 320kbps mp3', () => {
    expect(parseFfmpegInfo(STEREO_320)).toEqual({
      codec: 'mp3',
      sampleRateHz: 44100,
      channels: 2,
      bitrateKbps: 320,
      durationSec: 243.18
    })
  })

  it('parses a mono 128kbps mp3', () => {
    expect(parseFfmpegInfo(MONO_128)).toEqual({
      codec: 'mp3',
      sampleRateHz: 22050,
      channels: 1,
      bitrateKbps: 128,
      durationSec: 69.5
    })
  })

  it('parses 5.1 surround and hour-long duration', () => {
    const r = parseFfmpegInfo(SURROUND)
    expect(r.codec).toBe('aac')
    expect(r.channels).toBe(6)
    expect(r.sampleRateHz).toBe(48000)
    expect(r.durationSec).toBe(3723)
  })

  it('returns an empty object when nothing matches', () => {
    expect(parseFfmpegInfo('no useful info here')).toEqual({})
  })
})
