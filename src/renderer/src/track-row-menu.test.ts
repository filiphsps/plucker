import { describe, it, expect, vi } from 'vitest'
import { trackRowMenuItems } from './track-row-menu'

const t = ((k: string) => k) as never

describe('trackRowMenuItems', () => {
  it('disables Reveal and Delete when the file is missing', () => {
    const items = trackRowMenuItems({
      t,
      variant: 'history',
      track: { title: 'Song', file: '/a.mp3', videoId: 'abc' },
      missing: true,
      failed: false,
      onReveal: vi.fn(),
      onDelete: vi.fn()
    })
    const reveal = items.find((i) => i.label === 'context.reveal')
    const del = items.find((i) => i.label === 'context.deleteFile')
    expect(reveal?.enabled).toBe(false)
    expect(del?.enabled).toBe(false)
  })

  it('omits YouTube items when there is no videoId', () => {
    const items = trackRowMenuItems({
      t,
      variant: 'download',
      track: { title: 'Song' },
      missing: false,
      failed: false,
      onReveal: vi.fn()
    })
    expect(items.some((i) => i.label === 'context.copyUrl')).toBe(false)
    expect(items.some((i) => i.label === 'context.openYouTube')).toBe(false)
  })

  it('adds Copy error code only for failed rows with an error', () => {
    const items = trackRowMenuItems({
      t,
      variant: 'download',
      track: { title: 'Song', errorCode: 'E1' },
      missing: false,
      failed: true,
      onReveal: vi.fn()
    })
    expect(items.some((i) => i.label === 'context.copyError')).toBe(true)
  })

  it('includes Re-download for the history variant and Edit tags for cache', () => {
    const history = trackRowMenuItems({
      t,
      variant: 'history',
      track: { title: 'S' },
      missing: false,
      failed: false,
      onReveal: vi.fn(),
      onRedownload: vi.fn()
    })
    const cache = trackRowMenuItems({
      t,
      variant: 'cache',
      track: { title: 'S' },
      missing: false,
      failed: false,
      onReveal: vi.fn(),
      onEditTags: vi.fn()
    })
    expect(history.some((i) => i.label === 'context.redownload')).toBe(true)
    expect(cache.some((i) => i.label === 'context.editTags')).toBe(true)
  })

  it('adds an enabled Re-run transforms item for history rows with a file', () => {
    const items = trackRowMenuItems({
      t,
      variant: 'history',
      track: { title: 'S', file: '/a.mp3' },
      missing: false,
      failed: false,
      onReveal: vi.fn(),
      onRetransform: vi.fn()
    })
    const item = items.find((i) => i.label === 'context.retransform')
    expect(item?.enabled).toBe(true)
  })

  it('disables Re-run transforms when the file is missing', () => {
    const items = trackRowMenuItems({
      t,
      variant: 'history',
      track: { title: 'S', file: '/a.mp3' },
      missing: true,
      failed: false,
      onReveal: vi.fn(),
      onRetransform: vi.fn()
    })
    const item = items.find((i) => i.label === 'context.retransform')
    expect(item?.enabled).toBe(false)
  })
})
