import { describe, it, expect } from 'vitest'
import { watchUrl } from './youtube-url'

describe('watchUrl', () => {
  it('builds a canonical watch URL from a video id', () => {
    expect(watchUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })
})
