import { describe, it, expect } from 'vitest'
import { formatBytes } from './format-bytes'

describe('formatBytes', () => {
  it('renders bytes with no decimals', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('scales through KB, MB, GB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(750579222)).toBe('715.8 MB')
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5.0 GB')
  })

  it('honours a custom fraction-digit count', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB')
    expect(formatBytes(750579222, 2)).toBe('715.81 MB')
  })

  it('clamps negative or non-finite input to 0 B', () => {
    expect(formatBytes(-100)).toBe('0 B')
    expect(formatBytes(NaN)).toBe('0 B')
    expect(formatBytes(Infinity)).toBe('0 B')
  })
})
