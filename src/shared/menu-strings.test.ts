import { describe, it, expect } from 'vitest'
import { menu } from './menu-strings'

describe('menu strings', () => {
  it('has identical key sets for en and de', () => {
    const en = Object.keys(menu.en).sort()
    const de = Object.keys(menu.de).sort()
    expect(de).toEqual(en)
  })

  it('has no empty strings', () => {
    for (const lang of [menu.en, menu.de]) {
      for (const [key, value] of Object.entries(lang)) {
        expect(value, key).toBeTruthy()
      }
    }
  })

  it('dropped the obsolete Go menu key', () => {
    expect('go' in menu.en).toBe(false)
    expect('go' in menu.de).toBe(false)
  })

  it('exposes the new menu titles and commands', () => {
    for (const k of ['file', 'view', 'window', 'help', 'newDownload', 'openUrl', 'manageCache']) {
      expect(menu.en).toHaveProperty(k)
      expect(menu.de).toHaveProperty(k)
    }
  })
})
