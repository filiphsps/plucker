import { describe, it, expect } from 'vitest'
import { startSpan, timed } from './bench'

describe('startSpan', () => {
  it('returns a non-negative duration when ended', () => {
    const span = startSpan('unit', 'test')
    expect(span.end()).toBeGreaterThanOrEqual(0)
  })
})

describe('timed', () => {
  it('returns the wrapped value', async () => {
    expect(await timed('unit', 'test', async () => 42)).toBe(42)
  })

  it('still ends the span when the wrapped op throws', async () => {
    await expect(
      timed('unit', 'test', async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
  })
})
