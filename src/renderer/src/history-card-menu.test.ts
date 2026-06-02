import { describe, it, expect, vi } from 'vitest'
import { historyCardMenuItems } from './history-card-menu'

const t = ((k: string) => k) as never

describe('historyCardMenuItems', () => {
  it('produces open/redownload/copy/delete items', () => {
    const items = historyCardMenuItems({
      t,
      url: 'https://list',
      onOpenFolder: vi.fn(),
      onRedownload: vi.fn(),
      onDelete: vi.fn()
    })
    const labels = items.filter((i) => i.type !== 'separator').map((i) => i.label)
    expect(labels).toEqual([
      'context.openFolder',
      'context.redownloadAll',
      'context.copyPlaylistUrl',
      'context.deleteEntry'
    ])
  })

  it('omits Copy playlist URL when there is no url', () => {
    const items = historyCardMenuItems({
      t,
      url: '',
      onOpenFolder: vi.fn(),
      onRedownload: vi.fn(),
      onDelete: vi.fn()
    })
    expect(items.some((i) => i.label === 'context.copyPlaylistUrl')).toBe(false)
  })
})
