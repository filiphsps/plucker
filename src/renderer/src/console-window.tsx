import React, { useEffect, useState } from 'react'
import type { LogEntry } from '../../shared/types'
import { ConsolePanel } from './console-panel'
import { CONSOLE_ZOOM_DEFAULT, stepConsoleZoom } from '../../shared/console-zoom'

/**
 * Root of the floating console window (loaded via the `#console` route). Holds its
 * own bounded log buffer fed by the same broadcast log stream as the main window,
 * and renders the floating ConsolePanel. Dock returns to the in-app drawer; Pin
 * toggles always-on-top; the zoom controls scale this window independently.
 */
export function ConsoleWindow(): React.JSX.Element {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [zoom, setZoom] = useState(CONSOLE_ZOOM_DEFAULT)

  useEffect(() => {
    const off = window.plucker.onLog((e) => setEntries((prev) => [...prev, e].slice(-1000)))
    window.plucker.getLogTail().then((tail) => setEntries((prev) => (prev.length ? prev : tail)))
    window.plucker.getConsoleState().then((s) => {
      setAlwaysOnTop(s.alwaysOnTop)
      setZoom(s.zoom)
    })
    return off
  }, [])

  function togglePin(): void {
    const next = !alwaysOnTop
    setAlwaysOnTop(next)
    void window.plucker.setConsoleAlwaysOnTop(next)
  }

  function changeZoom(direction: 1 | -1): void {
    const next = stepConsoleZoom(zoom, direction)
    setZoom(next)
    void window.plucker.setConsoleZoom(next)
  }

  return (
    <ConsolePanel
      variant="floating"
      entries={entries}
      onClear={() => setEntries([])}
      onDock={() => void window.plucker.redockConsole()}
      alwaysOnTop={alwaysOnTop}
      onToggleAlwaysOnTop={togglePin}
      zoom={zoom}
      onZoomIn={() => changeZoom(1)}
      onZoomOut={() => changeZoom(-1)}
    />
  )
}
