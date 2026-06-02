import { describe, it, expect } from 'vitest'
import { keyToCamelot } from './camelot'

describe('keyToCamelot', () => {
  it('maps major keys to the B side of the wheel', () => {
    expect(keyToCamelot('C')).toBe('8B')
    expect(keyToCamelot('G')).toBe('9B')
    expect(keyToCamelot('A')).toBe('11B')
    expect(keyToCamelot('B')).toBe('1B')
  })

  it('maps minor keys to the A side of the wheel', () => {
    expect(keyToCamelot('Am')).toBe('8A')
    expect(keyToCamelot('Em')).toBe('9A')
    expect(keyToCamelot('G#m')).toBe('1A')
    expect(keyToCamelot('Bm')).toBe('10A')
  })

  it('returns undefined for unknown input', () => {
    expect(keyToCamelot('H')).toBeUndefined()
    expect(keyToCamelot('')).toBeUndefined()
  })
})
