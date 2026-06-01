import React, { useEffect, useState } from 'react'
import { DownloadView } from './download-view'
import { HistoryView } from './history-view'
import { SettingsPanel } from './settings-panel'
import { CacheView } from './cache-view'
import { TransportDeck } from './transport-deck'
import { Header, type View } from './header'
import { applyLanguage } from './i18n'
import type { JobProgress } from '../../shared/types'

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('download')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cacheOpen, setCacheOpen] = useState(false)
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    window.plucker.getSettings().then((s) => applyLanguage(s.language))
  }, [])

  useEffect(() => window.plucker.onProgress(setProgress), [])

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

  const deckVisible = running && progress !== null

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
        {cacheOpen ? (
          <CacheView
            onBack={() => {
              setCacheOpen(false)
              setSettingsOpen(true)
            }}
          />
        ) : settingsOpen ? (
          <SettingsPanel
            onClose={() => setSettingsOpen(false)}
            onOpenCache={() => {
              setSettingsOpen(false)
              setCacheOpen(true)
            }}
          />
        ) : view === 'download' ? (
          <DownloadView progress={progress} onRunningChange={setRunning} />
        ) : (
          <HistoryView
            onNavigateDownload={() => {
              setSettingsOpen(false)
              setView('download')
            }}
          />
        )}
      </div>

      {deckVisible && progress && (
        <TransportDeck progress={progress} onCancel={() => window.plucker.cancel()} />
      )}
    </div>
  )
}
