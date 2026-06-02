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

  it('offers Skip + Pause for a downloading track', () => {
    const items = trackRowMenuItems({
      t,
      variant: 'download',
      track: { title: 'X', status: 'downloading', paused: false },
      missing: false,
      failed: false,
      onReveal: vi.fn(),
      onSkip: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn()
    })
    const labels = items.map((i) => i.label)
    expect(labels).toContain('context.skip')
    expect(labels).toContain('context.pauseTrack')
    expect(labels).not.toContain('context.resumeTrack')
  })

  it('shows Resume (not Pause) when the track is paused', () => {
    const items = trackRowMenuItems({
      t,
      variant: 'download',
      track: { title: 'X', status: 'transforming', paused: true },
      missing: false,
      failed: false,
      onReveal: vi.fn(),
      onSkip: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn()
    })
    const labels = items.map((i) => i.label)
    expect(labels).toContain('context.resumeTrack')
    expect(labels).not.toContain('context.pauseTrack')
  })

  it('offers Skip but no pause/resume for a queued track', () => {
    const items = trackRowMenuItems({
      t,
      variant: 'download',
      track: { title: 'X', status: 'queued', paused: false },
      missing: false,
      failed: false,
      onReveal: vi.fn(),
      onSkip: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn()
    })
    const labels = items.map((i) => i.label)
    expect(labels).toContain('context.skip')
    expect(labels).not.toContain('context.pauseTrack')
    expect(labels).not.toContain('context.resumeTrack')
  })

  it('offers no skip/pause for a done track', () => {
    const items = trackRowMenuItems({
      t,
      variant: 'download',
      track: { title: 'X', status: 'done', file: '/a.mp3', paused: false },
      missing: false,
      failed: false,
      onReveal: vi.fn(),
      onSkip: vi.fn()
    })
    expect(items.some((i) => i.label === 'context.skip')).toBe(false)
  })
})
