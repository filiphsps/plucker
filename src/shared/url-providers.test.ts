import { describe, it, expect } from 'vitest'
import { isSupportedUrl, matchProvider, URL_PROVIDERS } from './url-providers'

describe('isSupportedUrl', () => {
  it('accepts standard youtube watch URLs', () => {
    expect(isSupportedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
    expect(isSupportedUrl('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
  })

  it('accepts youtu.be short links', () => {
    expect(isSupportedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true)
  })

  it('accepts youtube music URLs', () => {
    expect(isSupportedUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
  })

  it('accepts playlist URLs', () => {
    expect(isSupportedUrl('https://www.youtube.com/playlist?list=PL1234567890')).toBe(true)
  })

  it('accepts m.youtube.com and trims surrounding whitespace', () => {
    expect(isSupportedUrl('  https://m.youtube.com/watch?v=abc  ')).toBe(true)
  })

  it('rejects non-youtube hosts', () => {
    expect(isSupportedUrl('https://example.com/watch?v=dQw4w9WgXcQ')).toBe(false)
    expect(isSupportedUrl('https://notyoutube.com/watch?v=x')).toBe(false)
  })

  it('rejects look-alike domains that merely contain youtube', () => {
    expect(isSupportedUrl('https://youtube.com.evil.example/watch?v=x')).toBe(false)
  })

  it('rejects non-http(s) schemes', () => {
    expect(isSupportedUrl('ftp://youtube.com/watch?v=x')).toBe(false)
    expect(isSupportedUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects empty and malformed input', () => {
    expect(isSupportedUrl('')).toBe(false)
    expect(isSupportedUrl('   ')).toBe(false)
    expect(isSupportedUrl('not a url')).toBe(false)
    expect(isSupportedUrl('youtube.com/watch?v=x')).toBe(false) // no scheme
  })
})

describe('matchProvider', () => {
  it('returns the youtube provider for a youtube URL', () => {
    expect(matchProvider('https://youtu.be/x')?.id).toBe('youtube')
  })

  it('returns null for unsupported URLs', () => {
    expect(matchProvider('https://example.com')).toBeNull()
  })
})

describe('URL_PROVIDERS registry', () => {
  it('currently ships exactly one provider (youtube)', () => {
    expect(URL_PROVIDERS.map((p) => p.id)).toEqual(['youtube'])
  })
})
