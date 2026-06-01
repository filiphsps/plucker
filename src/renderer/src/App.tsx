import React, { useState } from 'react'
import { DownloadView } from './DownloadView'
import { SettingsPanel } from './SettingsPanel'

export default function App(): React.JSX.Element {
  const [showSettings, setShowSettings] = useState(false)
  return (
    <>
      <DownloadView onOpenSettings={() => setShowSettings(true)} />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </>
  )
}
