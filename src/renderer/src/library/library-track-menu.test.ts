import { describe, it, expect, vi } from 'vitest'
import { libraryTrackMenuItems } from './library-track-menu'

const t = ((k: string) => k) as never

describe('libraryTrackMenuItems', () => {
  it('lists open, re-download, export and delete; re-download fires its handler', () => {
    const onRedownload = vi.fn()
    const items = libraryTrackMenuItems({
      t,
      videoId: 'abc',
      onOpen: vi.fn(),
      onRedownload,
      onExport: vi.fn(),
      onDelete: vi.fn()
    })
    const labels = items.filter((i) => i.type !== 'separator').map((i) => i.label)
    expect(labels).toContain('common.open')
    expect(labels).toContain('context.redownload')
    expect(labels).toContain('library.export')
    expect(labels).toContain('common.delete')
    items.find((i) => i.label === 'context.redownload')!.onClick!()
    expect(onRedownload).toHaveBeenCalledOnce()
  })

  it('adds the YouTube submenu and re-download only when a source is known', () => {
    const withVid = libraryTrackMenuItems({
      t,
      videoId: 'abc',
      onOpen: vi.fn(),
      onRedownload: vi.fn(),
      onExport: vi.fn(),
      onDelete: vi.fn()
    })
    expect(withVid.some((i) => i.label === 'context.youtube')).toBe(true)

    const noSource = libraryTrackMenuItems({
      t,
      onOpen: vi.fn(),
      onRedownload: vi.fn(),
      onExport: vi.fn(),
      onDelete: vi.fn()
    })
    expect(noSource.some((i) => i.label === 'context.youtube')).toBe(false)
    expect(noSource.some((i) => i.label === 'context.redownload')).toBe(false)
  })
})
