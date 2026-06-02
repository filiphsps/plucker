import React, { useEffect, useRef, useState } from 'react'
import { DownloadView } from './download-view'
import { HistoryView } from './history-view'
import { SettingsPanel } from './settings-panel'
import { CacheView } from './cache-view'
import { TransportDeck } from './transport-deck'
import { Header, type View } from './header'
import { ConsoleDrawer } from './console-drawer'
import { Page } from './ui/page'
import { ResumeBanner, type InterruptedJob } from './resume-banner'
import { applyLanguage } from './i18n'
import { showContextMenu, type MenuItem } from './ui/context-menu'
import type { JobProgress, JobStatus, LogEntry } from '../../shared/types'

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('download')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cacheOpen, setCacheOpen] = useState(false)
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const [statusLog, setStatusLog] = useState<JobStatus[] | null>(null)
  const [urlHistory, setUrlHistory] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [trackPaused, setTrackPaused] = useState<Record<number, boolean>>({})
  const [redownloadRequest, setRedownloadRequest] = useState<{
    url: string
    folder: string
  } | null>(null)
  // File ▸ New Download / Open URL… push a URL (or '') into the Download view's bar.
  const [prefill, setPrefill] = useState<{ url: string; nonce: number } | null>(null)
  const prefillNonce = useRef(0)
  const [logEntries, setLogEntries] = useState<LogEntry[]>([])
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [consoleMode, setConsoleMode] = useState<'docked' | 'floating'>('docked')
  const [consoleHeight, setConsoleHeight] = useState(260)
  const [consoleAvailable, setConsoleAvailable] = useState(import.meta.env.DEV)
  // Index into the log buffer at the moment the current job started — the loader
  // shows everything from here on, so it mirrors the console scoped to this job.
  const logLen = useRef(0)
  const [jobLogStart, setJobLogStart] = useState(0)
  // Interrupted (crash/quit/cancel) jobs offered for resume; dismissed ones are
  // hidden for the session but stay in History.
  const [interrupted, setInterrupted] = useState<InterruptedJob[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    window.plucker.getSettings().then((s) => {
      applyLanguage(s.language)
      setConsoleAvailable(import.meta.env.DEV || s.developer.console)
      setUrlHistory(s.urlHistory)
    })
    window.plucker.getConsoleState().then((s) => setConsoleMode(s.mode))
  }, [])

  // React live to settings changing elsewhere (developer-console toggle, URL-history
  // add/remove from the command bar) — both broadcast the full settings object.
  useEffect(
    () =>
      window.plucker.onSettingsChanged((s) => {
        setConsoleAvailable(import.meta.env.DEV || s.developer.console)
        setUrlHistory(s.urlHistory)
      }),
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

  // Interrupted jobs: load on mount and refresh whenever main signals a change
  // (a job was cancelled, recovered on launch, resumed, or discarded).
  useEffect(() => {
    const load = (): void => {
      window.plucker.listInterruptedJobs().then(setInterrupted)
    }
    load()
    return window.plucker.onInterruptedChanged(load)
  }, [])

  // Toggle the console from the application menu (⌘J): docked → flip the drawer;
  // floating → show/hide the floating window.
  useEffect(
    () =>
      window.plucker.onToggleConsole(() => {
        if (consoleMode === 'floating') void window.plucker.toggleConsoleWindow()
        else setConsoleOpen((v) => !v)
      }),
    [consoleMode]
  )

  // Main process reports docked/floating transitions (undock, redock, OS-close of
  // the float). Returning to docked reopens the inline drawer so the console isn't lost.
  useEffect(
    () =>
      window.plucker.onConsoleMode((mode) => {
        setConsoleMode(mode)
        if (mode === 'docked') setConsoleOpen(true)
      }),
    []
  )

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

  useEffect(() => window.plucker.onPaused(setPaused), [])

  useEffect(
    () =>
      window.plucker.onTrackPaused((index, p) =>
        setTrackPaused((prev) => ({ ...prev, [index]: p }))
      ),
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
        if (target === 'settings') {
          setCacheOpen(false)
          setSettingsOpen(true)
        } else if (target === 'cache') {
          setSettingsOpen(false)
          setCacheOpen(true)
        } else {
          setSettingsOpen(false)
          setCacheOpen(false)
          setView(target)
        }
      }),
    []
  )

  // File ▸ New Download (empty) / Open URL… (clipboard URL): jump to the Download view
  // and push the URL into its command bar.
  useEffect(() => {
    const toDownload = (url: string): void => {
      setSettingsOpen(false)
      setCacheOpen(false)
      setView('download')
      setPrefill({ url, nonce: ++prefillNonce.current })
    }
    const offNew = window.plucker.onMenuNewDownload(() => toDownload(''))
    const offOpen = window.plucker.onMenuOpenUrl((url) => toDownload(url))
    return () => {
      offNew()
      offOpen()
    }
  }, [])

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

  const visibleInterrupted = interrupted.filter((j) => !dismissed.has(j.jobId))
  const handleResume = (jobId: string): void => {
    setDismissed((prev) => new Set(prev).add(jobId))
    window.plucker.resumeJob(jobId)
  }
  const handleDismissResume = (jobId: string): void => {
    setDismissed((prev) => new Set(prev).add(jobId))
  }

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
        onToggleConsole={() => {
          if (consoleMode === 'floating') void window.plucker.toggleConsoleWindow()
          else setConsoleOpen((v) => !v)
        }}
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

      <ResumeBanner
        jobs={visibleInterrupted}
        onResume={handleResume}
        onDismiss={handleDismissResume}
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
            urlHistory={urlHistory}
            trackPaused={trackPaused}
            redownloadRequest={redownloadRequest}
            prefill={prefill}
            onRedownloadConsumed={() => setRedownloadRequest(null)}
            onRunningChange={setRunning}
            onStart={() => {
              setProgress(null)
              setStatusLog([])
              setJobLogStart(logLen.current)
              setTrackPaused({})
            }}
            onClear={() => {
              setProgress(null)
              setStatusLog(null)
            }}
          />
        </Page>
        <Page active={!overlayOpen && view === 'history'}>
          <HistoryView
            onNavigateDownload={() => {
              setSettingsOpen(false)
              setView('download')
            }}
            onRequestRedownload={(url, folder) => {
              setSettingsOpen(false)
              setView('download')
              setRedownloadRequest({ url, folder })
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
        <TransportDeck
          progress={progress}
          paused={paused}
          onTogglePause={() => (paused ? window.plucker.resume() : window.plucker.pause())}
          onCancel={() => window.plucker.cancel()}
        />
      )}

      {consoleAvailable && consoleOpen && consoleMode === 'docked' && (
        <ConsoleDrawer
          entries={logEntries}
          height={consoleHeight}
          onHeightChange={setConsoleHeight}
          onClose={() => setConsoleOpen(false)}
          onClear={() => setLogEntries([])}
          onUndock={() => void window.plucker.undockConsole()}
        />
      )}
    </div>
  )
}
