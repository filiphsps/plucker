import React, { useEffect, useState } from 'react'
import { DownloadView } from './download-view'
import { HistoryView } from './history-view'
import { SettingsPanel } from './settings-panel'
import { CacheView } from './cache-view'
import { TransportDeck } from './transport-deck'
import { Header, type View } from './header'
import { Page } from './ui/page'
import { applyLanguage } from './i18n'
import type { JobProgress, JobStatus } from '../../shared/types'

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('download')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cacheOpen, setCacheOpen] = useState(false)
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const [statusLog, setStatusLog] = useState<JobStatus[] | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    window.plucker.getSettings().then((s) => applyLanguage(s.language))
  }, [])

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
    <div className="flex h-screen flex-col bg-surface text-ink">
      <Header
        view={view}
        settingsActive={settingsOpen}
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
            onRunningChange={setRunning}
            onStart={() => {
              setProgress(null)
              setStatusLog([])
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
    </div>
  )
}
