// Context-menu items for a single console log line in the developer drawer.
import type { TFunction } from 'i18next'
import type { MenuItem } from './ui/context-menu'

export function consoleLineMenuItems(opts: {
  t: TFunction
  line: string
  allText: string
}): MenuItem[] {
  const { t, line, allText } = opts
  return [
    { label: t('context.copyLine'), onClick: () => void window.plucker.copyText(line) },
    { label: t('context.copyAll'), onClick: () => void window.plucker.copyText(allText) },
    { type: 'separator' },
    { label: t('context.revealLog'), onClick: () => void window.plucker.revealLog() }
  ]
}
