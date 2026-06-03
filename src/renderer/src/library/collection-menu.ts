// Context-menu items for a gallery collection tile. Mirrors historyCardMenuItems:
// source-dependent actions (re-download, open/copy the source URL) appear only when the
// collection knows its source. Pure (closures supplied by the caller) so it unit-tests.
import type { TFunction } from 'i18next'
import type { MenuItem } from '../ui/context-menu'

export function collectionMenuItems(opts: {
  t: TFunction
  sourceUrl?: string
  onOpen: () => void
  onRedownload: () => void
  onExportAll: () => void
  onDelete: () => void
}): MenuItem[] {
  const { t, sourceUrl } = opts
  const items: MenuItem[] = [
    { label: t('common.open'), symbol: 'rectangle.stack', onClick: opts.onOpen }
  ]
  if (sourceUrl) {
    items.push(
      { type: 'separator' },
      {
        label: t('context.redownloadAll'),
        symbol: 'arrow.down.circle',
        onClick: opts.onRedownload
      },
      {
        label: t('context.openYouTube'),
        symbol: 'arrow.up.forward.app',
        onClick: () => void window.plucker.openExternal(sourceUrl)
      },
      {
        label: t('context.copyPlaylistUrl'),
        symbol: 'link',
        onClick: () => void window.plucker.copyText(sourceUrl)
      }
    )
  }
  items.push(
    { type: 'separator' },
    { label: t('library.exportAll'), symbol: 'square.and.arrow.up', onClick: opts.onExportAll },
    { label: t('common.delete'), symbol: 'trash', onClick: opts.onDelete }
  )
  return items
}
