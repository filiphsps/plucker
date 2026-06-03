import { describe, it, expect } from 'vitest'
import { compareSemver, extractVersion } from './compare-semver'

describe('compareSemver', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareSemver('1.0.0', '0.9.9')).toBe(1)
    expect(compareSemver('0.21.0', '0.22.0')).toBe(-1)
    expect(compareSemver('0.22.1', '0.22.0')).toBe(1)
    expect(compareSemver('0.22.0', '0.22.0')).toBe(0)
  })

  it('treats missing trailing parts as zero', () => {
    expect(compareSemver('1.2', '1.2.0')).toBe(0)
    expect(compareSemver('1.2.1', '1.2')).toBe(1)
  })

  it('ignores non-numeric noise after the numbers', () => {
    expect(compareSemver('0.22.0-beta', '0.22.0')).toBe(0)
  })
})

describe('extractVersion', () => {
  it('pulls the dotted version out of a release tag', () => {
    expect(extractVersion('plucker-v0.22.0')).toBe('0.22.0')
    expect(extractVersion('v1.2.3')).toBe('1.2.3')
    expect(extractVersion('0.9.1')).toBe('0.9.1')
  })

  it('returns null when there is no version', () => {
    expect(extractVersion('nightly')).toBeNull()
  })
})
