import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoaderCircle, CircleCheck, CircleAlert, RefreshCw, Download, RotateCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { UpdateState } from '../../../shared/types'

/**
 * Chrome-style updater widget for the About panel: auto-checks when shown, downloads
 * a found update (on macOS, where we can self-install), streams progress, and offers a
 * Relaunch button to swap in the new build. Mirrors the "About Chrome" status line.
 */
export function UpdateCard({
  version,
  releasesUrl
}: {
  version: string
  releasesUrl: string
}): React.JSX.Element {
  const { t } = useTranslation()
  const [state, setState] = useState<UpdateState>({
    phase: 'idle',
    currentVersion: version,
    canSelfInstall: false
  })

  // Run the check → (auto) download flow. On non-self-install platforms we stop at
  // `available` and surface a manual download link instead of relaunching.
  const check = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, phase: 'checking', error: undefined }))
    const res = await window.plucker.checkForUpdates()
    if (res.phase === 'available' && res.canSelfInstall) {
      setState({ ...res, phase: 'downloading', percent: 0 })
      setState(await window.plucker.downloadUpdate())
    } else {
      setState(res)
    }
  }, [])

  // Auto-check once when the card mounts (i.e. when the About section is opened).
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    void check()
  }, [check])

  // Live download progress from the main process.
  useEffect(
    () =>
      window.plucker.onUpdateProgress((percent) =>
        setState((s) => (s.phase === 'downloading' ? { ...s, percent } : s))
      ),
    []
  )

  const relaunch = (): void => void window.plucker.installUpdate()
  const openReleases = (): void => void window.plucker.openExternal(releasesUrl)

  const busy = state.phase === 'checking' || state.phase === 'downloading'
  const tone: 'busy' | 'ok' | 'action' | 'bad' | 'muted' =
    state.phase === 'error'
      ? 'bad'
      : state.phase === 'ready' || state.phase === 'available'
        ? 'action'
        : state.phase === 'upToDate'
          ? 'ok'
          : busy
            ? 'busy'
            : 'muted'

  const Icon: LucideIcon =
    tone === 'bad'
      ? CircleAlert
      : tone === 'ok'
        ? CircleCheck
        : tone === 'action'
          ? Download
          : LoaderCircle

  const iconColor =
    tone === 'bad'
      ? 'text-red-400'
      : tone === 'ok'
        ? 'text-emerald-400'
        : tone === 'action'
          ? 'text-accent'
          : 'text-ink-faint'

  const title = ((): string => {
    switch (state.phase) {
      case 'checking':
        return t('settings.about.update.checking')
      case 'downloading':
        return t('settings.about.update.downloading', { percent: state.percent ?? 0 })
      case 'ready':
        return t('settings.about.update.ready')
      case 'available':
        return t('settings.about.update.available', { version: state.newVersion ?? '' })
      case 'upToDate':
        return t('settings.about.update.upToDate')
      case 'unsupported':
        return t('settings.about.update.devOnly')
      case 'error':
        return t('settings.about.update.error')
      default:
        return t('settings.about.update.checking')
    }
  })()

  const subtitle =
    state.phase === 'error' && state.error
      ? state.error
      : t('settings.about.update.current', { version: state.currentVersion })

  // Right-aligned action button, varies by phase.
  const action = ((): React.JSX.Element | null => {
    switch (state.phase) {
      case 'ready':
        return (
          <ActionButton icon={RotateCw} primary onClick={relaunch}>
            {t('settings.about.update.relaunch')}
          </ActionButton>
        )
      case 'available': // can't self-install → manual download
        return (
          <ActionButton icon={Download} onClick={openReleases}>
            {t('settings.about.update.download')}
          </ActionButton>
        )
      case 'error':
        return (
          <ActionButton icon={RefreshCw} onClick={() => void check()}>
            {t('settings.about.update.retry')}
          </ActionButton>
        )
      case 'upToDate':
        return (
          <ActionButton icon={RefreshCw} onClick={() => void check()}>
            {t('settings.about.update.checkAgain')}
          </ActionButton>
        )
      default:
        return null
    }
  })()

  return (
    <div className="flex items-center gap-3 px-3.5 py-3.5">
      <Icon size={22} className={`shrink-0 ${iconColor} ${busy ? 'animate-spin' : ''}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-ink">{title}</div>
        <div className="mt-0.5 truncate text-[11.5px] text-ink-faint">{subtitle}</div>
      </div>
      {action}
    </div>
  )
}

function ActionButton({
  icon: Icon,
  primary,
  onClick,
  children
}: {
  icon: LucideIcon
  primary?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={
        primary
          ? 'flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3.5 text-[12px] font-semibold text-white'
          : 'flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line bg-raise px-3 text-[12px] text-ink-dim hover:text-ink'
      }
    >
      <Icon size={14} />
      {children}
    </button>
  )
}
