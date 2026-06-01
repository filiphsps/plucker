import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Download,
  History as HistoryIcon,
  SlidersHorizontal,
  Terminal,
  type LucideIcon
} from 'lucide-react'
import { Logo } from './logo'

export type View = 'download' | 'history'

export function Header({
  view,
  onNavigate,
  onOpenSettings,
  settingsActive = false,
  consoleAvailable = false,
  consoleOpen = false,
  onToggleConsole
}: {
  view: View
  onNavigate: (v: View) => void
  onOpenSettings: () => void
  settingsActive?: boolean
  /** Show the console toggle (dev mode or enabled in settings). */
  consoleAvailable?: boolean
  consoleOpen?: boolean
  onToggleConsole?: () => void
}): React.JSX.Element {
  const { t } = useTranslation()

  const tab = (v: View, label: string, Icon: LucideIcon): React.JSX.Element => {
    const on = view === v && !settingsActive
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
    <header className="drag flex h-12 items-center gap-4 border-b border-line bg-panel pl-[96px] pr-3.5">
      <Logo className="flex items-center" />
      <span className="h-[22px] w-px bg-line" />
      <nav className="no-drag flex gap-0.5">
        {tab('download', t('nav.download'), Download)}
        {tab('history', t('nav.history'), HistoryIcon)}
      </nav>
      <div className="flex-1" />
      {consoleAvailable && (
        <button
          onClick={onToggleConsole}
          aria-label={t('console.toggle')}
          title={t('console.toggle')}
          className={
            'no-drag flex h-8 w-8 items-center justify-center rounded-md transition-colors ' +
            (consoleOpen
              ? 'bg-accent-dim text-accent'
              : 'text-ink-faint hover:bg-raise hover:text-ink')
          }
        >
          <Terminal size={18} />
        </button>
      )}
      <button
        onClick={onOpenSettings}
        aria-label={t('app.settings')}
        className={
          'no-drag flex h-8 w-8 items-center justify-center rounded-md transition-colors ' +
          (settingsActive
            ? 'bg-accent-dim text-accent'
            : 'text-ink-faint hover:bg-raise hover:text-ink')
        }
      >
        <SlidersHorizontal size={18} />
      </button>
    </header>
  )
}
