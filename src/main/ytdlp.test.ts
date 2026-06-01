import { describe, it, expect } from 'vitest'
import { buildDownloadArgs, parseProgressLine, parseSkipLine } from './ytdlp'
import { DEFAULT_SETTINGS } from '../shared/defaults'

describe('buildDownloadArgs', () => {
  it('includes audio extraction, bitrate, ffmpeg location and output template', () => {
    const args = buildDownloadArgs({
      url: 'https://yt/playlist',
      destFolder: '/out',
      settings: DEFAULT_SETTINGS,
      ffmpegPath: '/bin/ffmpeg'
    })
    expect(args).toContain('--extract-audio')
    expect(args).toContain('--audio-format')
    expect(args).toContain('mp3')
    expect(args).toContain('--audio-quality')
    expect(args).toContain('320K')
    expect(args).toContain('--ffmpeg-location')
    expect(args).toContain('/bin/ffmpeg')
    expect(args).toContain('--ignore-errors')
    expect(args).toContain('--write-info-json')
    expect(args.some((a) => a.includes('/out/'))).toBe(true)
    expect(args[args.length - 1]).toBe('https://yt/playlist')
  })

  it('adds cookies-from-browser when source is a browser', () => {
    const s = { ...DEFAULT_SETTINGS, cookies: { source: 'edge' as const } }
    const args = buildDownloadArgs({ url: 'u', destFolder: '/o', settings: s, ffmpegPath: '/f' })
    expect(args).toContain('--cookies-from-browser')
    expect(args).toContain('edge')
  })

  it('omits cookies when source is none', () => {
    const s = { ...DEFAULT_SETTINGS, cookies: { source: 'none' as const } }
    const args = buildDownloadArgs({ url: 'u', destFolder: '/o', settings: s, ffmpegPath: '/f' })
    expect(args).not.toContain('--cookies-from-browser')
  })

  it('adds a no-fallback source-bitrate format filter when minBitrate is set', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      audio: { ...DEFAULT_SETTINGS.audio, minBitrate: 128 as const }
    }
    const args = buildDownloadArgs({ url: 'u', destFolder: '/o', settings: s, ffmpegPath: '/f' })
    const fi = args.indexOf('-f')
    expect(fi).toBeGreaterThanOrEqual(0)
    expect(args[fi + 1]).toBe('ba[abr>=128]') // no "/ba" fallback → skips below-floor videos
  })

  it('omits the format filter when minBitrate is null', () => {
    const args = buildDownloadArgs({
      url: 'u',
      destFolder: '/o',
      settings: DEFAULT_SETTINGS,
      ffmpegPath: '/f'
    })
    expect(args).not.toContain('-f')
  })
})

describe('parseProgressLine', () => {
  it('parses index, percent, video id and (space-containing) title', () => {
    expect(parseProgressLine('PLUCKER 3 42.5 dQw4w9WgXcQ Song Title')).toEqual({
      index: 3,
      percent: 42.5,
      videoId: 'dQw4w9WgXcQ',
      title: 'Song Title'
    })
  })
  it('returns null for unrelated lines', () => {
    expect(parseProgressLine('[download] Destination: x')).toBeNull()
  })
  it('coerces a non-numeric (single-video NA) index to 1', () => {
    expect(parseProgressLine('PLUCKER NA 100 dQw4w9WgXcQ Song Title')).toEqual({
      index: 1,
      percent: 100,
      videoId: 'dQw4w9WgXcQ',
      title: 'Song Title'
    })
  })
})

describe('parseSkipLine', () => {
  it('detects a below-floor "format not available" skip and extracts the video id', () => {
    expect(
      parseSkipLine(
        'ERROR: [youtube] dQw4w9WgXcQ: Requested format is not available. Use --list-formats'
      )
    ).toEqual({ videoId: 'dQw4w9WgXcQ' })
  })
  it('returns null for non-skip lines', () => {
    expect(parseSkipLine('[download] 100% of 3.00MiB')).toBeNull()
  })
})
