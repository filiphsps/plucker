import React, { useEffect, useState } from 'react'
import type { LogEntry } from '../../shared/types'
import { ConsolePanel } from './console-panel'

/**
 * Root of the floating console window (loaded via the `#console` route). Holds its
 * own bounded log buffer fed by the same broadcast log stream as the main window,
 * and renders the floating ConsolePanel. Dock returns to the in-app drawer; Pin
 * toggles always-on-top.
 */
export function ConsoleWindow(): React.JSX.Element {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)

  useEffect(() => {
    const off = window.plucker.onLog((e) => setEntries((prev) => [...prev, e].slice(-1000)))
    window.plucker.getLogTail().then((tail) => setEntries((prev) => (prev.length ? prev : tail)))
    window.plucker.getConsoleState().then((s) => setAlwaysOnTop(s.alwaysOnTop))
    return off
  }, [])

  function togglePin(): void {
    const next = !alwaysOnTop
    setAlwaysOnTop(next)
    void window.plucker.setConsoleAlwaysOnTop(next)
  }

  return (
    <ConsolePanel
      variant="floating"
      entries={entries}
      onClear={() => setEntries([])}
      onDock={() => void window.plucker.redockConsole()}
      alwaysOnTop={alwaysOnTop}
      onToggleAlwaysOnTop={togglePin}
    />
  )
}
