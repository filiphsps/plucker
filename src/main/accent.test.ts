import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  systemPreferences: {
    getAccentColor: vi.fn(() => '')
  }
}))

import { systemPreferences } from 'electron'
import { getAccentColor, DEFAULT_ACCENT } from './accent'

describe('getAccentColor', () => {
  it('normalizes an 8-digit RGBA hex to #rrggbb', () => {
    ;(systemPreferences.getAccentColor as ReturnType<typeof vi.fn>).mockReturnValue('0a84ffff')
    expect(getAccentColor()).toBe('#0a84ff')
  })

  it('accepts a 6-digit hex and lowercases with leading #', () => {
    ;(systemPreferences.getAccentColor as ReturnType<typeof vi.fn>).mockReturnValue('FF5B52')
    expect(getAccentColor()).toBe('#ff5b52')
  })

  it('falls back to the default when the API returns empty', () => {
    ;(systemPreferences.getAccentColor as ReturnType<typeof vi.fn>).mockReturnValue('')
    expect(getAccentColor()).toBe(DEFAULT_ACCENT)
  })

  it('falls back to the default when the API throws (e.g. Linux)', () => {
    ;(systemPreferences.getAccentColor as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('not available')
    })
    expect(getAccentColor()).toBe(DEFAULT_ACCENT)
  })
})
