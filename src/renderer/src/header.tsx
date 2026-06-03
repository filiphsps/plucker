import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Download,
  Library,
  SlidersHorizontal,
  Terminal,
  type LucideIcon
} from 'lucide-react'
import { Logo } from './logo'
import { HeaderIconButton } from './ui/header-icon-button'
import { useFullscreen } from './use-fullscreen'

export type View = 'download' | 'history'

export function Header({
  view,
  onNavigate,
  onOpenSettings,
  settingsActive = false,
  cacheActive = false,
  consoleAvailable = false,
  consoleOpen = false,
  onToggleConsole
}: {
  view: View
  onNavigate: (v: View) => void
  onOpenSettings: () => void
  settingsActive?: boolean
  /** Cache overlay is showing; no nav tab should appear active. */
  cacheActive?: boolean
  /** Show the console toggle (dev mode or enabled in settings). */
  consoleAvailable?: boolean
  consoleOpen?: boolean
  onToggleConsole?: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  // In macOS fullscreen the traffic lights are hidden, so reclaim the gap reserved for
  // them and fall back to the normal left padding.
  const fullscreen = useFullscreen()

  const tab = (v: View, label: string, Icon: LucideIcon): React.JSX.Element => {
    const on = view === v && !settingsActive && !cacheActive
    return (
      <button
        onClick={() => onNavigate(v)}
        className={
          'flex h-8 items-center gap-[7px] rounded-md px-3.5 text-[13px] font-medium transition-colors ' +
          (on ? 'bg-accent-dim text-accent' : 'text-ink-dim hover:bg-raise hover:text-ink')
        }
      >
        <Icon size={16} />
        {label}
      </button>
    )
  }

  return (
    <header
      className={
        'drag flex h-12 items-center gap-4 border-b border-line bg-panel pr-3.5 ' +
        (fullscreen ? 'pl-4' : 'pl-[96px]')
      }
    >
      <Logo className="flex items-center" />
      <span className="h-[22px] w-px bg-line" />
      <nav className="no-drag flex gap-0.5">
        {tab('download', t('nav.download'), Download)}
        {tab('history', t('nav.history'), Library)}
      </nav>
      <div className="flex-1" />
      {consoleAvailable && (
        <HeaderIconButton
          icon={Terminal}
          label={t('console.toggle')}
          active={consoleOpen}
          onClick={onToggleConsole}
        />
      )}
      <HeaderIconButton
        icon={SlidersHorizontal}
        label={t('app.settings')}
        active={settingsActive}
        onClick={onOpenSettings}
      />
    </header>
  )
}
