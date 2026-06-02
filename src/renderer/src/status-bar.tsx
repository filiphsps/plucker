import React from 'react'
import { visibleItems, type StatusBarItem } from './status-bar-utils'

/**
 * Dynamic bottom info bar (à la the Windows OS status bar). Renders nothing — and so
 * takes no layout space — until at least one item has content. Items lay out
 * left-to-right separated by hairlines; adding a future indicator is just another
 * entry in `items`. For now the only occupant is the online/offline indicator.
 */
export function StatusBar({
  items
}: {
  items: (StatusBarItem | null | false | undefined)[]
}): React.JSX.Element | null {
  const shown = visibleItems(items)
  if (shown.length === 0) return null
  return (
    <footer
      role="status"
      className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-panel2 px-3 text-[11px] text-ink-dim"
    >
      {shown.map((it, i) => (
        <React.Fragment key={it.id}>
          {i > 0 && <span className="h-3 w-px shrink-0 bg-line" />}
          {it.node}
        </React.Fragment>
      ))}
    </footer>
  )
}
