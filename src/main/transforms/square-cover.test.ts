// src/main/transforms/square-cover.test.ts
import { describe, it, expect, vi } from 'vitest'
import { squareCover, squareCoverTransform } from './square-cover'

describe('squareCover', () => {
  it('reads the embedded cover, crops it square, and re-embeds the result', async () => {
    const original = Buffer.from('original')
    const cropped = Buffer.from('cropped')
    const readCover = vi.fn(() => ({ image: original, mime: 'image/jpeg' }))
    const crop = vi.fn(async () => ({ image: cropped, mime: 'image/jpeg' }))
    const embed = vi.fn()

    await squareCover('/tmp/track.mp3', { readCover, crop, embed })

    expect(crop).toHaveBeenCalledWith(original, 'image/jpeg')
    expect(embed).toHaveBeenCalledWith('/tmp/track.mp3', cropped, 'image/jpeg')
  })

  it('does nothing when the file has no embedded cover', async () => {
    const crop = vi.fn()
    const embed = vi.fn()

    await squareCover('/tmp/track.mp3', { readCover: () => null, crop, embed })

    expect(crop).not.toHaveBeenCalled()
    expect(embed).not.toHaveBeenCalled()
  })
})

describe('squareCoverTransform', () => {
  it('is a non-multiple, skip-on-failure transform with the expected type', () => {
    expect(squareCoverTransform.type).toBe('square-cover')
    expect(squareCoverTransform.allowMultiple).toBe(false)
    expect(squareCoverTransform.failureMode).toBe('skip')
  })
})
