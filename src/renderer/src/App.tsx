import React, { useEffect, useState } from 'react'
import { DownloadView } from './DownloadView'
import { HistoryView } from './HistoryView'
import { SettingsPanel } from './SettingsPanel'
import { Header, type View } from './Header'
import { applyLanguage } from './i18n'

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('download')
  const [showSettings, setShowSettings] = useState(false)
  useEffect(() => {
    window.plucker.getSettings().then((s) => applyLanguage(s.language))
  }, [])
  return (
    <div className="h-screen flex flex-col bg-neutral-950 text-neutral-100">
      <Header view={view} onNavigate={setView} onOpenSettings={() => setShowSettings(true)} />
      {view === 'download' ? (
        <DownloadView />
      ) : (
        <HistoryView onNavigateDownload={() => setView('download')} />
      )}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}
