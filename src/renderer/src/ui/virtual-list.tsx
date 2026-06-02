import React, { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

/**
 * Windowed list: only the rows near the viewport are mounted, so a list of
 * thousands of items stays as cheap to render as a handful. Built on
 * `@tanstack/react-virtual` with **dynamic measurement** — each rendered row is
 * measured via a `ResizeObserver`, so variable-height rows (our `TrackRow`
 * expands to show metadata/waveform, history cards grow with their track count)
 * are handled without declaring a fixed size.
 *
 * This component *is* the scroll container — pass the same classes you would
 * have put on the `overflow-auto` div (e.g. `min-h-0 flex-1 overflow-auto`).
 */
export interface VirtualListProps<T> {
  items: T[]
  /**
   * A stable key per item. Doubles as the virtualizer's measurement-cache key,
   * so measured heights and React identity survive filtering/reordering.
   */
  getKey: (item: T, index: number) => React.Key
  /** Render one item. The wrapper div + positioning is handled here. */
  children: (item: T, index: number) => React.ReactNode
  /**
   * Estimated row height in px (used for the scrollbar before a row is measured;
   * the real height replaces it after measurement). A close estimate reduces
   * scroll-thumb jitter — pick the typical collapsed-row height.
   */
  estimateSize: number
  /** Vertical gap between items in px, folded into each measured row. Default 0. */
  gap?: number
  /** Extra rows rendered beyond the viewport on each side. Default 6. */
  overscan?: number
  className?: string
  /** Right-click handler for the scroll surface (e.g. the page context menu). */
  onContextMenu?: (e: React.MouseEvent) => void
}

export function VirtualList<T>({
  items,
  getKey,
  children,
  estimateSize,
  gap = 0,
  overscan = 6,
  className,
  onContextMenu
}: VirtualListProps<T>): React.JSX.Element {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize + gap,
    overscan,
    // Key the measurement cache by item identity (not array position) so a
    // filtered/reordered list keeps each row's measured height and DOM node.
    getItemKey: (index) => getKey(items[index], index)
  })

  return (
    <div ref={parentRef} className={className} onContextMenu={onContextMenu}>
      <div style={{ position: 'relative', width: '100%', height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vi) => (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vi.start}px)`,
              paddingBottom: gap || undefined
            }}
          >
            {children(items[vi.index], vi.index)}
          </div>
        ))}
      </div>
    </div>
  )
}
