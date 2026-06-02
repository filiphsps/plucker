// Context-menu items for a history playlist card (the entry header).
import type { TFunction } from 'i18next'
import type { MenuItem } from './ui/context-menu'

export function historyCardMenuItems(opts: {
  t: TFunction
  url: string
  onOpenFolder: () => void
  onRedownload: () => void
  onDelete: () => void
}): MenuItem[] {
  const { t, url } = opts
  const items: MenuItem[] = [
    { label: t('context.openFolder'), onClick: opts.onOpenFolder },
    { label: t('context.redownloadAll'), onClick: opts.onRedownload }
  ]
  if (url) {
    items.push({
      label: t('context.copyPlaylistUrl'),
      onClick: () => void window.plucker.copyText(url)
    })
  }
  items.push({ type: 'separator' }, { label: t('context.deleteEntry'), onClick: opts.onDelete })
  return items
}
