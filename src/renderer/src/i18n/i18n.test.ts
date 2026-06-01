import { describe, it, expect } from 'vitest'
import i18n, { resolveLocale, resources } from './index'

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? flatKeys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`]
  )
}

describe('resolveLocale', () => {
  it('follows the OS locale when set to system', () => {
    expect(resolveLocale('system', 'de-DE')).toBe('de')
    expect(resolveLocale('system', 'en-US')).toBe('en')
    expect(resolveLocale('system', 'fr-FR')).toBe('en') // unsupported → fallback
  })
  it('honors an explicit override regardless of OS locale', () => {
    expect(resolveLocale('de', 'en-US')).toBe('de')
    expect(resolveLocale('en', 'de-DE')).toBe('en')
  })
})

describe('locale parity', () => {
  it('de defines exactly the same keys as en (no missing/extra translations)', () => {
    const en = flatKeys(resources.en.translation).sort()
    const de = flatKeys(resources.de.translation).sort()
    expect(de).toEqual(en)
  })
})

describe('translation + pluralization', () => {
  it('renders English singular/plural', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.t('download.tracks', { count: 1 })).toBe('1 track')
    expect(i18n.t('download.tracks', { count: 3 })).toBe('3 tracks')
    expect(i18n.t('settings.title')).toBe('Settings')
  })
  it('renders German', async () => {
    await i18n.changeLanguage('de')
    expect(i18n.t('download.tracks', { count: 3 })).toBe('3 Titel')
    expect(i18n.t('settings.title')).toBe('Einstellungen')
    expect(i18n.t('status.skipped')).toBe('übersprungen')
  })
})
