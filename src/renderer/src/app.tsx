import React, { useEffect, useRef, useState } from 'react'
import { DownloadView } from './download-view'
import { Gallery } from './library/gallery'
import { CollectionTracklist } from './library/collection-tracklist'
import { TrackEditor } from './library/track-editor'
import { ActivityLog } from './library/activity-log'
import { useLibrary } from './library/use-library'
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
import type { JobStatus, LogEntry, PlaylistEntry, ResolvedJob } from '../../shared/types'
import type { ActivityEvent, TrackDetail } from '../../shared/library'
import type { JobView } from './job-view'
import type { PendingJob } from './pending-job'

/** Track statuses that mean a job is still working (drives deck visibility). */
const ACTIVE = new Set(['queued', 'downloading', 'transforming'])

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('download')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cacheOpen, setCacheOpen] = useState(false)
  // All jobs (running + queued), keyed by jobId. Roster drives membership; the
  // jobId-tagged events fill each job's progress/paused detail.
  const [jobs, setJobs] = useState<Map<string, JobView>>(new Map())
  // Pending (staged-not-started) jobs live only here — resolving a URL adds one, the
  // rail lists them, and starting one (or all) hands it to the main-process pool.
  const [pending, setPending] = useState<PendingJob[]>([])
  const pendingNonce = useRef(0)
  // The selected rail entry: a real jobId, a pending job's id, or null ("New").
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

  // Library (editor model): collections subscribe live; opening a track loads its
  // version graph into the editor; the activity log mirrors library:activityChanged.
  const { collections, refresh: refreshLibrary } = useLibrary()
  const [trackDetail, setTrackDetail] = useState<TrackDetail | null>(null)
  const [openCollectionId, setOpenCollectionId] = useState<string | null>(null)
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const openCol = openCollectionId
    ? (collections.find((c) => c.id === openCollectionId) ?? null)
    : null

  const openTrack = (trackId: string): void => {
    void window.plucker.getLibraryTrack(trackId).then(setTrackDetail)
  }

  useEffect(() => {
    const load = (): void => {
      void window.plucker.getActivity().then(setActivity)
    }
    load()
    return window.plucker.onLibraryActivityChanged(load)
  }, [])

  // When the library changes while a track editor is open, re-pull that track's detail
  // so a finished edit / branch switch reflects immediately.
  useEffect(() => {
    if (!trackDetail) return
    const id = trackDetail.instance.id
    return window.plucker.onLibraryChanged(() => {
      void window.plucker.getLibraryTrack(id).then((d) => {
        if (d) setTrackDetail(d)
      })
    })
  }, [trackDetail?.instance.id])

  const exportTrackIds = async (trackIds: string[]): Promise<void> => {
    const folder = await window.plucker.chooseFolder()
    if (folder) await window.plucker.exportLibraryTracks(trackIds, folder)
  }

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
          const inRoster = new Set(roster.map((m) => m.jobId))
          for (const meta of roster) {
            const existing = prev.get(meta.jobId)
            next.set(
              meta.jobId,
              existing
                ? { ...existing, meta, finished: false }
                : { meta, progress: null, paused: false, trackPaused: {}, finished: false }
            )
          }
          // Keep jobs that left the roster but actually ran — mark them finished so
          // they linger in the rail (for review) until the user dismisses them. A
          // queued job cancelled before it ran (no progress) is dropped.
          for (const [id, v] of prev) {
            if (!inRoster.has(id) && v.progress) next.set(id, { ...v, finished: true })
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
  const selectedPending = selectedJobId
    ? (pending.find((p) => p.id === selectedJobId) ?? null)
    : null
  const railItems = [
    ...[...jobs.values()].map((v) => ({
      jobId: v.meta.jobId,
      title: v.meta.title,
      overall: v.progress?.overall ?? 0,
      finished: !!v.finished,
      state: v.finished ? ('done' as const) : v.meta.state
    })),
    // Pending jobs trail the real ones — no progress yet, a "Not started" label.
    ...pending.map((p) => ({
      jobId: p.id,
      title: p.title,
      overall: 0,
      finished: false,
      state: 'pending' as const
    }))
  ]
  // Show the rail when there's more than one job to switch between, a single
  // multi-track playlist, any finished job kept around for review (so it always has
  // its dismiss affordance), or any pending job staged for start. A lone in-flight
  // single-track download doesn't earn the space — the detail takes the full width.
  const showRail =
    jobs.size >= 2 ||
    pending.length > 0 ||
    [...jobs.values()].some((v) => v.finished || (v.progress?.total ?? 0) > 1)
  // Show the deck for the selected job only while it has work in flight.
  const deckJob =
    selectedJob && selectedJob.progress?.tracks.some((t) => ACTIVE.has(t.status))
      ? selectedJob
      : null

  /** Remove a finished job from the rail (it stays in History). */
  const dismissJob = (jobId: string): void => {
    setJobs((prev) => {
      const next = new Map(prev)
      next.delete(jobId)
      return next
    })
    setSelectedJobId((cur) => (cur === jobId ? null : cur))
  }

  /** Stage a freshly resolved URL as a pending job and select it for editing. */
  const addPending = (resolved: ResolvedJob, url: string, folderOverride?: string): void => {
    const id = `pending-${++pendingNonce.current}`
    setPending((prev) => [
      ...prev,
      {
        id,
        url,
        title: resolved.title,
        kind: resolved.kind,
        entries: resolved.entries,
        folderOverride
      }
    ])
    setStatusLog(null) // leave the resolve panel; the staging editor takes over
    setSelectedJobId(id)
  }

  /** Reorder/remove tracks within a pending job. */
  const updatePending = (id: string, entries: PlaylistEntry[]): void => {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, entries } : p)))
  }

  /** Drop a pending job without starting it (the rail's X). */
  const removePending = (id: string): void => {
    setPending((prev) => prev.filter((p) => p.id !== id))
    setSelectedJobId((cur) => (cur === id ? null : cur))
  }

  /** Hand one pending job to the pool and select the resulting running job. */
  const startPending = async (id: string): Promise<void> => {
    const p = pending.find((x) => x.id === id)
    if (!p || p.entries.length === 0) return
    setPending((prev) => prev.filter((x) => x.id !== id))
    try {
      const jobId = await window.plucker.startDownload({
        url: p.url,
        title: p.title,
        kind: p.kind,
        entries: p.entries,
        folderOverride: p.folderOverride
      })
      setSelectedJobId(jobId)
    } catch {
      // Start errors surface via job:status / History.
    }
  }

  /** Start every pending job at once; select the first one that launches. */
  const startAllPending = async (): Promise<void> => {
    const toStart = pending.filter((p) => p.entries.length > 0)
    if (toStart.length === 0) return
    setPending([])
    let firstId: string | null = null
    for (const p of toStart) {
      try {
        const jobId = await window.plucker.startDownload({
          url: p.url,
          title: p.title,
          kind: p.kind,
          entries: p.entries,
          folderOverride: p.folderOverride
        })
        firstId ??= jobId
      } catch {
        // Start errors surface via job:status / History.
      }
    }
    if (firstId) setSelectedJobId(firstId)
  }

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
            {showRail && (
              <JobRail
                jobs={railItems}
                selectedJobId={selectedJobId}
                pendingCount={pending.length}
                onSelect={setSelectedJobId}
                onClose={(jobId, finished) => {
                  if (pending.some((p) => p.id === jobId)) removePending(jobId)
                  else if (finished) dismissJob(jobId)
                  else void window.plucker.cancel(jobId)
                }}
                onStartAll={() => void startAllPending()}
              />
            )}
            <div className="min-h-0 flex-1">
              <DownloadView
                job={selectedJob}
                pendingJob={selectedPending}
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
                onResolved={addPending}
                onUpdatePending={updatePending}
                onStartPending={(id) => void startPending(id)}
                onClear={() => setStatusLog(null)}
              />
            </div>
          </div>
        </Page>
        <Page active={!overlayOpen && view === 'history'}>
          <div className="flex h-full min-h-0 flex-col">
            {trackDetail ? (
              <TrackEditor
                detail={trackDetail}
                onClose={() => setTrackDetail(null)}
                onEdit={(trackId) => {
                  void window.plucker
                    .getSettings()
                    .then((s) => window.plucker.editTrack(trackId, s.transforms))
                }}
                onExport={(trackId) => void exportTrackIds([trackId])}
                onSwitchBranch={(branchId) => {
                  void window.plucker
                    .switchBranch(trackDetail.instance.id, branchId)
                    .then((d) => d && setTrackDetail(d))
                }}
                onCreateBranch={(fromVersionId, name) => {
                  void window.plucker
                    .createBranch(trackDetail.instance.id, fromVersionId, name)
                    .then((r) => r.detail && setTrackDetail(r.detail))
                }}
              />
            ) : openCol ? (
              <CollectionTracklist
                collection={openCol}
                onBack={() => setOpenCollectionId(null)}
                onOpenTrack={openTrack}
                onExportAll={(id) => {
                  const c = collections.find((x) => x.id === id)
                  if (c) void exportTrackIds(c.tracks.map((tr) => tr.id))
                }}
                onDelete={(id) => {
                  void window.plucker.deleteLibraryCollection(id).then(() => {
                    setOpenCollectionId(null)
                    void refreshLibrary()
                  })
                }}
              />
            ) : (
              <Gallery
                collections={collections}
                onOpenCollection={setOpenCollectionId}
                onExportCollection={(id) => {
                  const c = collections.find((x) => x.id === id)
                  if (c) void exportTrackIds(c.tracks.map((tr) => tr.id))
                }}
                onDeleteCollection={(id) => {
                  void window.plucker.deleteLibraryCollection(id).then(() => void refreshLibrary())
                }}
              />
            )}
            <ActivityLog events={activity} />
          </div>
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
