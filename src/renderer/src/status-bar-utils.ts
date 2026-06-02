import type { ReactNode } from 'react'

export interface StatusBarItem {
  /** Stable identity for React keys; one per indicator. */
  id: string
  /** What to render in the bar. An item with no node is treated as hidden. */
  node: ReactNode
}

/**
 * Keep only items that actually want to be shown. An entry is dropped when it is
 * falsy or carries no `node`, so callers can pass `cond ? item : null` inline and
 * the bar stays empty until something has content.
 */
export function visibleItems(items: (StatusBarItem | null | false | undefined)[]): StatusBarItem[] {
  return items.filter((it): it is StatusBarItem => Boolean(it && it.node))
}
