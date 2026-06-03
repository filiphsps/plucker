import { describe, it, expect, vi } from 'vitest'
import { collectionMenuItems } from './collection-menu'

const t = ((k: string) => k) as never

describe('collectionMenuItems', () => {
  it('includes re-download, export all and delete; re-download fires its handler', () => {
    const onRedownload = vi.fn()
    const items = collectionMenuItems({
      t,
      sourceUrl: 'https://youtube.com/playlist?list=x',
      onOpen: vi.fn(),
      onBeginRename: vi.fn(),
      onRedownload,
      onExportAll: vi.fn(),
      onDelete: vi.fn()
    })
    const labels = items.filter((i) => i.type !== 'separator').map((i) => i.label)
    expect(labels).toContain('context.redownloadAll')
    expect(labels).toContain('library.exportAll')
    expect(labels).toContain('common.delete')
    items.find((i) => i.label === 'context.redownloadAll')!.onClick!()
    expect(onRedownload).toHaveBeenCalledOnce()
  })

  it('omits re-download / source actions when the collection has no source URL', () => {
    const items = collectionMenuItems({
      t,
      onOpen: vi.fn(),
      onBeginRename: vi.fn(),
      onRedownload: vi.fn(),
      onExportAll: vi.fn(),
      onDelete: vi.fn()
    })
    const labels = items.map((i) => i.label)
    expect(labels).not.toContain('context.redownloadAll')
    expect(labels).not.toContain('context.copyPlaylistUrl')
  })

  it('includes a Rename item that fires its begin-rename handler', () => {
    const onBeginRename = vi.fn()
    const items = collectionMenuItems({
      t,
      onOpen: vi.fn(),
      onBeginRename,
      onRedownload: vi.fn(),
      onExportAll: vi.fn(),
      onDelete: vi.fn()
    })
    const rename = items.find((i) => i.label === 'library.rename')!
    expect(rename).toBeTruthy()
    rename.onClick!()
    expect(onBeginRename).toHaveBeenCalledOnce()
  })
})
