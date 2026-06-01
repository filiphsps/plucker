import { describe, it, expect } from 'vitest'
import {
  formatDuration,
  formatBytes,
  formatChannels,
  formatSampleRate,
  formatBitrate,
  formatCodec,
  formatSpeed,
  formatElapsed,
  formatNumber
} from './format'

const DASH = '—'

describe('formatNumber', () => {
  it('groups thousands', () => {
    expect(formatNumber(7300)).toBe('7,300')
  })
  it('groups millions and keeps requested decimals', () => {
    expect(formatNumber(1200300.25, 2)).toBe('1,200,300.25')
  })
  it('formats integers without decimals by default', () => {
    expect(formatNumber(320)).toBe('320')
  })
})

describe('formatDuration', () => {
  it('formats minutes:seconds', () => {
    expect(formatDuration(243)).toBe('4:03')
  })
  it('formats hours:minutes:seconds', () => {
    expect(formatDuration(3723)).toBe('1:02:03')
  })
  it('floors fractional seconds', () => {
    expect(formatDuration(69.9)).toBe('1:09')
  })
  it('returns a dash when missing', () => {
    expect(formatDuration(undefined)).toBe(DASH)
  })
})

describe('formatBytes', () => {
  it('formats megabytes with one decimal', () => {
    expect(formatBytes(10_171_187)).toBe('9.7 MB')
  })
  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2.0 KB')
  })
  it('returns a dash when missing', () => {
    expect(formatBytes(undefined)).toBe(DASH)
  })
})

describe('formatChannels', () => {
  it('names common layouts', () => {
    expect(formatChannels(1)).toBe('Mono')
    expect(formatChannels(2)).toBe('Stereo')
    expect(formatChannels(6)).toBe('5.1')
    expect(formatChannels(8)).toBe('7.1')
  })
  it('falls back to a channel count', () => {
    expect(formatChannels(3)).toBe('3 ch')
  })
  it('returns a dash when missing', () => {
    expect(formatChannels(undefined)).toBe(DASH)
  })
})

describe('formatSampleRate', () => {
  it('formats hertz as kHz', () => {
    expect(formatSampleRate(44100)).toBe('44.1 kHz')
    expect(formatSampleRate(48000)).toBe('48 kHz')
  })
  it('returns a dash when missing', () => {
    expect(formatSampleRate(undefined)).toBe(DASH)
  })
})

describe('formatBitrate', () => {
  it('appends kbps', () => {
    expect(formatBitrate(320)).toBe('320 kbps')
  })
  it('returns a dash when missing', () => {
    expect(formatBitrate(undefined)).toBe(DASH)
  })
})

describe('formatCodec', () => {
  it('uppercases the codec', () => {
    expect(formatCodec('mp3')).toBe('MP3')
  })
  it('returns a dash when missing', () => {
    expect(formatCodec(undefined)).toBe(DASH)
  })
})

describe('formatSpeed', () => {
  it('formats bytes/sec with a /s suffix', () => {
    expect(formatSpeed(1_572_864)).toBe('1.5 MB/s')
  })
  it('returns a dash for zero or missing speed', () => {
    expect(formatSpeed(0)).toBe(DASH)
    expect(formatSpeed(undefined)).toBe(DASH)
  })
})

describe('formatElapsed', () => {
  it('formats sub-second durations in ms', () => {
    expect(formatElapsed(735)).toBe('735ms')
  })
  it('formats longer durations in seconds with one decimal', () => {
    expect(formatElapsed(7200)).toBe('7.2s')
  })
  it('returns a dash when missing', () => {
    expect(formatElapsed(undefined)).toBe(DASH)
  })
})
