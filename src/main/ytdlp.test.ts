import { describe, it, expect } from 'vitest'
import {
  buildDownloadArgs,
  priorityToNice,
  parseProgressLine,
  parseSkipLine,
  parseCompleteLine,
  parseErrorLine
} from './ytdlp'
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

  it('omits --paths when no tempDir is given', () => {
    const args = buildDownloadArgs({
      url: 'u',
      destFolder: '/o',
      settings: DEFAULT_SETTINGS,
      ffmpegPath: '/f'
    })
    expect(args).not.toContain('--paths')
  })

  it('redirects intermediates to a temp dir via --paths temp:', () => {
    const args = buildDownloadArgs({
      url: 'u',
      destFolder: '/o',
      settings: DEFAULT_SETTINGS,
      ffmpegPath: '/f',
      tempDir: '/tmp/p/3'
    })
    const i = args.indexOf('--paths')
    expect(i).toBeGreaterThan(-1)
    expect(args[i + 1]).toBe('temp:/tmp/p/3')
  })

  it('adds cookies-from-browser when source is a browser', () => {
    const s = { ...DEFAULT_SETTINGS, cookies: { source: 'edge' as const } }
    const args = buildDownloadArgs({ url: 'u', destFolder: '/o', settings: s, ffmpegPath: '/f' })
    expect(args).toContain('--cookies-from-browser')
    expect(args).toContain('edge')
  })

  it('uses --cookies with the exported file and omits --cookies-from-browser', () => {
    const s = { ...DEFAULT_SETTINGS, cookies: { source: 'safari' as const } }
    const args = buildDownloadArgs({
      url: 'u',
      destFolder: '/o',
      settings: s,
      ffmpegPath: '/f',
      cookieFile: '/tmp/c.txt'
    })
    expect(args).toContain('--cookies')
    expect(args[args.indexOf('--cookies') + 1]).toBe('/tmp/c.txt')
    expect(args).not.toContain('--cookies-from-browser')
  })

  it('falls back to --cookies-from-browser when no cookieFile is given', () => {
    const s = { ...DEFAULT_SETTINGS, cookies: { source: 'safari' as const } }
    const args = buildDownloadArgs({ url: 'u', destFolder: '/o', settings: s, ffmpegPath: '/f' })
    expect(args).toContain('--cookies-from-browser')
    expect(args).not.toContain('--cookies')
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

  it('passes the libmp3lame compression level to the audio extractor', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      performance: { ...DEFAULT_SETTINGS.performance, compressionLevel: 7 as const }
    }
    const args = buildDownloadArgs({ url: 'u', destFolder: '/o', settings: s, ffmpegPath: '/f' })
    const i = args.indexOf('--postprocessor-args')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(args[i + 1]).toBe('ExtractAudio:-compression_level 7')
  })

  it('adds --concurrent-fragments when above 1, and omits it at 1', () => {
    const many = {
      ...DEFAULT_SETTINGS,
      performance: { ...DEFAULT_SETTINGS.performance, concurrentFragments: 8 }
    }
    const a = buildDownloadArgs({ url: 'u', destFolder: '/o', settings: many, ffmpegPath: '/f' })
    const i = a.indexOf('--concurrent-fragments')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(a[i + 1]).toBe('8')

    const one = {
      ...DEFAULT_SETTINGS,
      performance: { ...DEFAULT_SETTINGS.performance, concurrentFragments: 1 }
    }
    const b = buildDownloadArgs({ url: 'u', destFolder: '/o', settings: one, ffmpegPath: '/f' })
    expect(b).not.toContain('--concurrent-fragments')
  })

  it('maps the priority setting to a nice value (low = niced down)', () => {
    expect(priorityToNice('normal')).toBe(0)
    expect(priorityToNice('low')).toBe(10)
  })

  it('omits -ar (keeps the source sample rate) when sampleRate is null', () => {
    const args = buildDownloadArgs({
      url: 'u',
      destFolder: '/o',
      settings: DEFAULT_SETTINGS,
      ffmpegPath: '/f'
    })
    const i = args.indexOf('--postprocessor-args')
    expect(args[i + 1]).not.toContain('-ar')
  })

  it('appends -ar to the audio extractor args when a sample rate is set', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      audio: { ...DEFAULT_SETTINGS.audio, sampleRate: 44100 as const }
    }
    const args = buildDownloadArgs({ url: 'u', destFolder: '/o', settings: s, ffmpegPath: '/f' })
    const i = args.indexOf('--postprocessor-args')
    expect(args[i + 1]).toBe('ExtractAudio:-compression_level 7 -ar 44100')
  })

  it('downloads the whole playlist by default', () => {
    const args = buildDownloadArgs({
      url: 'u',
      destFolder: '/o',
      settings: DEFAULT_SETTINGS,
      ffmpegPath: '/f'
    })
    expect(args).toContain('--yes-playlist')
    expect(args).not.toContain('--no-playlist')
  })

  it('restricts to a single video when singleVideo is set', () => {
    const args = buildDownloadArgs({
      url: 'u',
      destFolder: '/o',
      settings: DEFAULT_SETTINGS,
      ffmpegPath: '/f',
      singleVideo: true
    })
    expect(args).toContain('--no-playlist')
    expect(args).not.toContain('--yes-playlist')
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

describe('parseCompleteLine', () => {
  it('extracts the final filepath from a PLUCKERDONE line', () => {
    expect(parseCompleteLine('PLUCKERDONE /tmp/My Folder/Artist - Title.mp3')).toBe(
      '/tmp/My Folder/Artist - Title.mp3'
    )
  })
  it('returns null for unrelated lines', () => {
    expect(parseCompleteLine('PLUCKER 1 50 abc Some Title')).toBeNull()
  })
})

describe('buildDownloadArgs completion sentinel', () => {
  it('adds an after_move print of the final filepath', () => {
    const args = buildDownloadArgs({
      url: 'u',
      destFolder: '/d',
      settings: DEFAULT_SETTINGS,
      ffmpegPath: '/ff'
    })
    const idx = args.indexOf('--print')
    expect(idx).toBeGreaterThan(-1)
    expect(args[idx + 1]).toBe('after_move:PLUCKERDONE %(filepath)s')
  })
})

describe('parseProgressLine', () => {
  it('parses index, percent, speed, video id and (space-containing) title', () => {
    expect(parseProgressLine('PLUCKER 3 42.5 1048576 dQw4w9WgXcQ Song Title')).toEqual({
      index: 3,
      percent: 42.5,
      speedBytesPerSec: 1048576,
      videoId: 'dQw4w9WgXcQ',
      title: 'Song Title'
    })
  })
  it('returns null for unrelated lines', () => {
    expect(parseProgressLine('[download] Destination: x')).toBeNull()
  })
  it('coerces a non-numeric (single-video NA) index to 1', () => {
    expect(parseProgressLine('PLUCKER NA 100 524288 dQw4w9WgXcQ Song Title')).toEqual({
      index: 1,
      percent: 100,
      speedBytesPerSec: 524288,
      videoId: 'dQw4w9WgXcQ',
      title: 'Song Title'
    })
  })
  it('leaves speed undefined when yt-dlp reports NA', () => {
    expect(parseProgressLine('PLUCKER 1 0 NA dQw4w9WgXcQ Song Title')).toEqual({
      index: 1,
      percent: 0,
      speedBytesPerSec: undefined,
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

describe('parseErrorLine', () => {
  it('extracts the video id and message from a per-video error', () => {
    expect(
      parseErrorLine('ERROR: [youtube] dQw4w9WgXcQ: Video unavailable. This video is private')
    ).toEqual({ videoId: 'dQw4w9WgXcQ', message: 'Video unavailable. This video is private' })
  })

  it('handles a generic error without a video id', () => {
    expect(parseErrorLine('ERROR: unable to download video data: HTTP Error 403')).toEqual({
      message: 'unable to download video data: HTTP Error 403'
    })
  })

  it('ignores below-floor skips (handled as skips, not failures)', () => {
    expect(
      parseErrorLine('ERROR: [youtube] abc123def: Requested format is not available')
    ).toBeNull()
  })

  it('returns null for non-error lines', () => {
    expect(parseErrorLine('[download] 100% of 3.00MiB')).toBeNull()
  })
})
