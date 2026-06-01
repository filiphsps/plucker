import React, { useEffect, useState } from 'react'
import { DownloadView } from './DownloadView'
import { SettingsPanel } from './SettingsPanel'
import { applyLanguage } from './i18n'

export default function App(): React.JSX.Element {
  const [showSettings, setShowSettings] = useState(false)
  useEffect(() => {
    window.plucker.getSettings().then((s) => applyLanguage(s.language))
  }, [])
  return (
    <>
      <DownloadView onOpenSettings={() => setShowSettings(true)} />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </>
  )
}
