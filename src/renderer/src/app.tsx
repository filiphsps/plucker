import React, { useEffect, useRef, useState } from 'react'
import { DownloadView } from './download-view'
import { HistoryView } from './history-view'
import { SettingsPanel } from './settings-panel'
import { CacheView } from './cache-view'
import { TransportDeck } from './transport-deck'
import { Header, type View } from './header'
import { ConsoleDrawer } from './console-drawer'
import { Page } from './ui/page'
import { applyLanguage } from './i18n'
import { showContextMenu, type MenuItem } from './ui/context-menu'
import type { JobProgress, JobStatus, LogEntry } from '../../shared/types'

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('download')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cacheOpen, setCacheOpen] = useState(false)
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const [statusLog, setStatusLog] = useState<JobStatus[] | null>(null)
  const [running, setRunning] = useState(false)
  const [logEntries, setLogEntries] = useState<LogEntry[]>([])
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [consoleHeight, setConsoleHeight] = useState(260)
  const [consoleAvailable, setConsoleAvailable] = useState(import.meta.env.DEV)
  // Index into the log buffer at the moment the current job started — the loader
  // shows everything from here on, so it mirrors the console scoped to this job.
  const logLen = useRef(0)
  const [jobLogStart, setJobLogStart] = useState(0)

  useEffect(() => {
    window.plucker.getSettings().then((s) => {
      applyLanguage(s.language)
      setConsoleAvailable(import.meta.env.DEV || s.developer.console)
    })
  }, [])

  // React live to the developer-console setting being toggled in Settings.
  useEffect(
    () =>
      window.plucker.onSettingsChanged((s) =>
        setConsoleAvailable(import.meta.env.DEV || s.developer.console)
      ),
    []
  )

  // Live log stream → bounded buffer, seeded with the main-process tail on mount.
  useEffect(() => {
    const off = window.plucker.onLog((e) =>
      setLogEntries((prev) => {
        const next = [...prev, e].slice(-1000)
        logLen.current = next.length
        return next
      })
    )
    window.plucker.getLogTail().then((tail) => setLogEntries((prev) => (prev.length ? prev : tail)))
    return off
  }, [])

  // Toggle the console from the application menu (⌘J).
  useEffect(() => window.plucker.onToggleConsole(() => setConsoleOpen((v) => !v)), [])

  // Esc closes the console while it's open.
  useEffect(() => {
    if (!consoleOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setConsoleOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [consoleOpen])

  useEffect(
    () =>
      window.plucker.onProgress((p) => {
        setProgress(p)
        setStatusLog(null) // real track list takes over
      }),
    []
  )

  useEffect(
    () =>
      window.plucker.onStatus((s) =>
        setStatusLog((prev) => (prev ? [...prev, s].slice(-60) : [s]))
      ),
    []
  )

  useEffect(
    () =>
      window.plucker.onMenuNavigate((target) => {
        setCacheOpen(false)
        if (target === 'settings') setSettingsOpen(true)
        else {
          setSettingsOpen(false)
          setView(target)
        }
      }),
    []
  )

  // The transport deck (bottom bar) must follow the *job*, not just the download
  // view's local `running` flag — re-downloads launched from the History page
  // start a job without ever flipping that flag. Treat any in-flight progress
  // (queued/downloading/transforming) as a live job so the deck shows regardless
  // of where the download was triggered, and hides once every track is terminal.
  const jobActive =
    progress?.tracks.some(
      (tk) => tk.status === 'queued' || tk.status === 'downloading' || tk.status === 'transforming'
    ) ?? false
  const deckVisible = progress !== null && (running || jobActive)
  const overlayOpen = settingsOpen || cacheOpen

  return (
    <div
      className="flex h-screen flex-col bg-surface text-ink"
      onContextMenu={(e) => {
        // Fallback Edit menu for text inputs / selected text — only when no surface
        // (track row, history card, console line, …) already handled the event.
        if (e.defaultPrevented) return
        const target = e.target as HTMLElement
        const editable =
          target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
        const hasSelection = !!window.getSelection()?.toString()
        if (!editable && !hasSelection) return
        e.preventDefault()
        const items: MenuItem[] = editable
          ? [
              { role: 'cut' },
              { role: 'copy' },
              { role: 'paste' },
              { type: 'separator' },
              { role: 'selectAll' }
            ]
          : [{ role: 'copy' }]
        void showContextMenu(items)
      }}
    >
      <Header
        view={view}
        settingsActive={settingsOpen}
        cacheActive={cacheOpen}
        consoleAvailable={consoleAvailable}
        consoleOpen={consoleOpen}
        onToggleConsole={() => setConsoleOpen((v) => !v)}
        onNavigate={(v) => {
          setSettingsOpen(false)
          setCacheOpen(false)
          setView(v)
        }}
        onOpenSettings={() => {
          setCacheOpen(false)
          setSettingsOpen(true)
        }}
      />

      <div className="min-h-0 flex-1">
        {/* Every page is always rendered and wrapped in <Page>, which freezes the
            inactive ones (state + DOM preserved, Effects unmounted) and restores
            them on return. Exactly one page is active at a time. */}
        <Page active={!overlayOpen && view === 'download'}>
          <DownloadView
            progress={progress}
            statusLog={statusLog}
            resolveLog={logEntries.slice(jobLogStart)}
            onRunningChange={setRunning}
            onStart={() => {
              setProgress(null)
              setStatusLog([])
              setJobLogStart(logLen.current)
            }}
          />
        </Page>
        <Page active={!overlayOpen && view === 'history'}>
          <HistoryView
            onNavigateDownload={() => {
              setSettingsOpen(false)
              setView('download')
            }}
          />
        </Page>
        <Page active={settingsOpen}>
          <SettingsPanel
            onClose={() => setSettingsOpen(false)}
            onOpenCache={() => {
              setSettingsOpen(false)
              setCacheOpen(true)
            }}
          />
        </Page>
        <Page active={cacheOpen}>
          <CacheView
            onBack={() => {
              setCacheOpen(false)
              setSettingsOpen(true)
            }}
          />
        </Page>
      </div>

      {deckVisible && progress && (
        <TransportDeck progress={progress} onCancel={() => window.plucker.cancel()} />
      )}

      {consoleAvailable && consoleOpen && (
        <ConsoleDrawer
          entries={logEntries}
          height={consoleHeight}
          onHeightChange={setConsoleHeight}
          onClose={() => setConsoleOpen(false)}
          onClear={() => setLogEntries([])}
        />
      )}
    </div>
  )
}
