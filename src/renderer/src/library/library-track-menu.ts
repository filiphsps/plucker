// Context-menu items for a library track row. Mirrors the old trackRowMenuItems
// (history variant): re-download + a YouTube submenu when the source is known.
import type { TFunction } from 'i18next'
import { watchUrl } from '../../../shared/youtube-url'
import type { MenuItem } from '../ui/context-menu'

export function libraryTrackMenuItems(opts: {
  t: TFunction
  videoId?: string
  sourceUrl?: string
  onOpen: () => void
  onRedownload: () => void
  onExport: () => void
  onDelete: () => void
}): MenuItem[] {
  const { t, videoId, sourceUrl } = opts
  const items: MenuItem[] = [
    { label: t('common.open'), symbol: 'arrow.up.right.square', onClick: opts.onOpen }
  ]
  if (videoId || sourceUrl) {
    items.push(
      { type: 'separator' },
      { label: t('context.redownload'), symbol: 'arrow.down.circle', onClick: opts.onRedownload }
    )
  }
  if (videoId) {
    const url = watchUrl(videoId)
    items.push({
      label: t('context.youtube'),
      symbol: 'play.rectangle.fill',
      submenu: [
        {
          label: t('context.copyUrl'),
          symbol: 'link',
          onClick: () => void window.plucker.copyText(url)
        },
        {
          label: t('context.openYouTube'),
          symbol: 'arrow.up.forward.app',
          onClick: () => void window.plucker.openExternal(url)
        }
      ]
    })
  }
  items.push(
    { type: 'separator' },
    { label: t('library.export'), symbol: 'square.and.arrow.up', onClick: opts.onExport },
    { label: t('common.delete'), symbol: 'trash', onClick: opts.onDelete }
  )
  return items
}
