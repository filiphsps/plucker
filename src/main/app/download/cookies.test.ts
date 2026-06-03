import { describe, it, expect } from 'vitest'
import { needsCookieEscalation, isCookiePermissionError, buildExportCommand } from './cookies'
import { DEFAULT_SETTINGS } from '@shared/defaults'

describe('needsCookieEscalation', () => {
  for (const source of ['chrome', 'edge', 'safari', 'firefox', 'brave'] as const) {
    it(`is true for ${source}`, () => {
      expect(needsCookieEscalation({ ...DEFAULT_SETTINGS, cookies: { source } })).toBe(true)
    })
  }
  for (const source of ['none', 'auto'] as const) {
    it(`is false for ${source}`, () => {
      expect(needsCookieEscalation({ ...DEFAULT_SETTINGS, cookies: { source } })).toBe(false)
    })
  }
})

describe('isCookiePermissionError', () => {
  it('matches "could not copy ... cookie database"', () => {
    expect(isCookiePermissionError('ERROR: Could not copy Safari cookie database')).toBe(true)
  })
  it('matches a permission-denied cookie line', () => {
    expect(
      isCookiePermissionError('ERROR: unable to open cookie database: Permission denied')
    ).toBe(true)
  })
  it('matches an operation-not-permitted cookie line', () => {
    expect(
      isCookiePermissionError(
        "Could not read Safari cookies: [Errno 1] Operation not permitted: 'Cookies.binarycookies'"
      )
    ).toBe(true)
  })
  it('does not match unrelated errors', () => {
    expect(isCookiePermissionError('ERROR: Video unavailable')).toBe(false)
    expect(isCookiePermissionError('ERROR: Requested format is not available')).toBe(false)
  })
  it('does not match a permission error unrelated to cookies', () => {
    expect(isCookiePermissionError('ERROR: Permission denied writing output file')).toBe(false)
  })
})

describe('buildExportCommand', () => {
  it('builds a quoted, chowned export command', () => {
    const cmd = buildExportCommand({
      ytdlpPath: '/bin/yt dlp',
      source: 'safari',
      tmpFile: '/tmp/c.txt',
      probeUrl: 'https://yt/x?a=1&b=2',
      uid: 501,
      gid: 20
    })
    expect(cmd).toContain("'/bin/yt dlp'")
    expect(cmd).toContain("--cookies-from-browser 'safari'")
    expect(cmd).toContain("--cookies '/tmp/c.txt'")
    expect(cmd).toContain("'https://yt/x?a=1&b=2'")
    expect(cmd).toContain('--skip-download')
    expect(cmd).toContain('--ignore-errors')
    expect(cmd).toContain("chown 501:20 '/tmp/c.txt'")
    expect(cmd).toContain("chmod 600 '/tmp/c.txt'")
  })
})
