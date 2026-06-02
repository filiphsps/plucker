import React from 'react'
import { useTranslation } from 'react-i18next'
import { Wifi, WifiOff } from 'lucide-react'
import type { NetworkPhase } from './use-network-status'

/** Status-bar badge for a non-idle {@link NetworkPhase}. */
export function NetworkStatusBadge({
  phase
}: {
  phase: Exclude<NetworkPhase, null>
}): React.JSX.Element {
  const { t } = useTranslation()
  if (phase === 'offline') {
    return (
      <span className="flex items-center gap-1.5 text-warn">
        <WifiOff size={12} />
        {t('statusBar.offline')}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-ok">
      <Wifi size={12} />
      {t('statusBar.online')}
    </span>
  )
}
