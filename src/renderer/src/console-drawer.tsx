import React from 'react'
import type { LogEntry } from '../../shared/types'
import { ConsolePanel } from './console-panel'

const MIN_HEIGHT = 120
const MAX_HEIGHT = 640

/**
 * The docked bottom console drawer: a resizable wrapper around the shared
 * ConsolePanel. Dragging the title bar resizes it; the Undock control pops the
 * console out into its own floating window.
 */
export function ConsoleDrawer({
  entries,
  height,
  onHeightChange,
  onClose,
  onClear,
  onUndock
}: {
  entries: LogEntry[]
  height: number
  onHeightChange: (h: number) => void
  onClose: () => void
  onClear: () => void
  onUndock: () => void
}): React.JSX.Element {
  // Drag the top edge to resize. Height grows as the pointer moves up.
  function onResizeStart(e: React.PointerEvent): void {
    e.preventDefault()
    const startY = e.clientY
    const startH = height
    const move = (ev: PointerEvent): void => {
      const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startH + (startY - ev.clientY)))
      onHeightChange(next)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <ConsolePanel
      variant="docked"
      entries={entries}
      onClear={onClear}
      height={height}
      onResizeStart={onResizeStart}
      onClose={onClose}
      onUndock={onUndock}
    />
  )
}
