import React, { useEffect, useRef, useState } from 'react'
import { DownloadView } from './download-view'
import { HistoryView } from './history-view'
import { SettingsPanel } from './settings-panel'
import { CacheView } from './cache-view'
import { TransportDeck } from './transport-deck'
import { JobRail } from './job-rail'
import { Header, type View } from './header'
import { ConsoleDrawer } from './console-drawer'
import { Page } from './ui/page'
import { ResumeBanner, type InterruptedJob } from './resume-banner'
import { StatusBar } from './status-bar'
import { useNetworkStatus } from './use-network-status'
import { NetworkStatusBadge } from './network-status'
import { applyLanguage } from './i18n'
import { showContextMenu, type MenuItem } from './ui/context-menu'
import type { JobStatus, LogEntry } from '../../shared/types'
import type { JobView } from './job-view'

/** Track statuses that mean a job is still working (drives deck visibility). */
const ACTIVE = new Set(['queued', 'downloading', 'transforming'])

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('download')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cacheOpen, setCacheOpen] = useState(false)
  // All jobs (running + queued), keyed by jobId. Roster drives membership; the
  // jobId-tagged events fill each job's progress/paused detail.
  const [jobs, setJobs] = useState<Map<string, JobView>>(new Map())
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [statusLog, setStatusLog] = useState<JobStatus[] | null>(null)
  const [urlHistory, setUrlHistory] = useState<string[]>([])
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
  // Interrupted (crash/quit/cancel) jobs offered for resume. Dismissals persist on
  // the checkpoint (see jobs:dismiss); the local set hides one optimistically before
  // the next listInterruptedJobs round-trip.
  const [interrupted, setInterrupted] = useState<InterruptedJob[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  // Bottom info bar: currently just connectivity, but the bar grows by pushing more
  // items below (see StatusBar). It stays collapsed whenever every item is idle.
  const networkPhase = useNetworkStatus()

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

  // Roster drives which jobs exist; preserve each existing job's detail across updates.
  useEffect(
    () =>
      window.plucker.onJobsChanged((roster) =>
        setJobs((prev) => {
          const next = new Map<string, JobView>()
          for (const meta of roster) {
            const existing = prev.get(meta.jobId)
            next.set(
              meta.jobId,
              existing
                ? { ...existing, meta }
                : { meta, progress: null, paused: false, trackPaused: {} }
            )
          }
          return next
        })
      ),
    []
  )

  // Seed the initial roster on mount (covers jobs already running at launch).
  useEffect(() => {
    window.plucker.jobsList().then((roster) =>
      setJobs((prev) => {
        const next = new Map(prev)
        for (const meta of roster) {
          if (!next.has(meta.jobId)) {
            next.set(meta.jobId, {
              meta,
              progress: null,
              paused: false,
              trackPaused: {}
            })
          }
        }
        return next
      })
    )
  }, [])

  // Per-job progress / paused / track-paused updates, keyed by jobId.
  useEffect(
    () =>
      window.plucker.onProgress((jobId, p) =>
        setJobs((prev) => {
          const v = prev.get(jobId)
          if (!v) return prev
          const next = new Map(prev)
          next.set(jobId, { ...v, progress: p })
          return next
        })
      ),
    []
  )
  useEffect(
    () =>
      window.plucker.onPaused((jobId, paused) =>
        setJobs((prev) => {
          const v = prev.get(jobId)
          if (!v) return prev
          const next = new Map(prev)
          next.set(jobId, { ...v, paused })
          return next
        })
      ),
    []
  )
  useEffect(
    () =>
      window.plucker.onTrackPaused((jobId, index, paused) =>
        setJobs((prev) => {
          const v = prev.get(jobId)
          if (!v) return prev
          const next = new Map(prev)
          next.set(jobId, {
            ...v,
            trackPaused: { ...v.trackPaused, [index]: paused }
          })
          return next
        })
      ),
    []
  )

  // Status with an empty jobId is the pre-job resolution stream (drives the compose
  // ResolvePanel). Per-job error statuses surface in History + the console.
  useEffect(
    () =>
      window.plucker.onStatus((jobId, s) => {
        if (jobId !== '') return
        setStatusLog((prev) => (prev ? [...prev, s].slice(-60) : [s]))
      }),
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

  // File ▸ New Download (empty) / Open URL… (clipboard URL): jump to the Download view,
  // select the compose pane, and push the URL into its command bar.
  useEffect(() => {
    const toDownload = (url: string): void => {
      setSettingsOpen(false)
      setCacheOpen(false)
      setView('download')
      setSelectedJobId(null)
      setPrefill({ url, nonce: ++prefillNonce.current })
    }
    const offNew = window.plucker.onMenuNewDownload(() => toDownload(''))
    const offOpen = window.plucker.onMenuOpenUrl((url) => toDownload(url))
    return () => {
      offNew()
      offOpen()
    }
  }, [])

  const overlayOpen = settingsOpen || cacheOpen
  const selectedJob = selectedJobId ? (jobs.get(selectedJobId) ?? null) : null
  const railItems = [...jobs.values()].map((v) => ({
    meta: v.meta,
    overall: v.progress?.overall ?? 0
  }))
  // Show the deck for the selected job only while it has work in flight.
  const deckJob =
    selectedJob && selectedJob.progress?.tracks.some((t) => ACTIVE.has(t.status))
      ? selectedJob
      : null

  const visibleInterrupted = interrupted.filter((j) => !dismissed.has(j.jobId))
  const handleResume = (jobId: string): void => {
    setDismissed((prev) => new Set(prev).add(jobId))
    window.plucker.resumeJob(jobId)
  }
  const handleDismissResume = (jobId: string): void => {
    setDismissed((prev) => new Set(prev).add(jobId))
    // Persist the dismissal so this job's banner never returns (it stays resumable
    // from History). The optimistic session state above hides it immediately.
    void window.plucker.dismissResumeJob(jobId)
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
          <div className="flex h-full min-h-0">
            <JobRail
              jobs={railItems}
              selectedJobId={selectedJobId}
              onSelect={setSelectedJobId}
              onCancel={(jobId) => void window.plucker.cancel(jobId)}
            />
            <div className="min-h-0 flex-1">
              <DownloadView
                job={selectedJob}
                statusLog={statusLog}
                resolveLog={logEntries.slice(jobLogStart)}
                urlHistory={urlHistory}
                redownloadRequest={redownloadRequest}
                prefill={prefill}
                onRedownloadConsumed={() => setRedownloadRequest(null)}
                onResolveStart={() => {
                  setStatusLog([])
                  setJobLogStart(logLen.current)
                }}
                onJobStarted={(jobId) => {
                  setSelectedJobId(jobId)
                  setStatusLog(null)
                }}
                onClear={() => setStatusLog(null)}
              />
            </div>
          </div>
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
              setSelectedJobId(null)
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

      {deckJob && deckJob.progress && (
        <TransportDeck
          progress={deckJob.progress}
          paused={deckJob.paused}
          onTogglePause={() =>
            deckJob.paused
              ? window.plucker.resume(deckJob.meta.jobId)
              : window.plucker.pause(deckJob.meta.jobId)
          }
          onCancel={() => window.plucker.cancel(deckJob.meta.jobId)}
        />
      )}

      <StatusBar
        items={[
          networkPhase
            ? {
                id: 'network',
                node: <NetworkStatusBadge phase={networkPhase} />
              }
            : null
        ]}
      />

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
