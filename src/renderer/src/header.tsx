import React from 'react'
import { useTranslation } from 'react-i18next'
import { Download, History as HistoryIcon, SlidersHorizontal, type LucideIcon } from 'lucide-react'

export type View = 'download' | 'history'

export function Header({
  view,
  onNavigate,
  onOpenSettings,
  settingsActive = false
}: {
  view: View
  onNavigate: (v: View) => void
  onOpenSettings: () => void
  settingsActive?: boolean
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
    <header className="flex h-12 items-center gap-4 border-b border-line bg-panel px-3.5">
      <span className="font-mono text-xs font-semibold tracking-[3px] text-[#e7ebef]">
        PL<span className="text-accent">U</span>CKER
      </span>
      <span className="h-[22px] w-px bg-line" />
      <nav className="flex gap-0.5">
        {tab('download', t('nav.download'), Download)}
        {tab('history', t('nav.history'), HistoryIcon)}
      </nav>
      <div className="flex-1" />
      <button
        onClick={onOpenSettings}
        aria-label={t('app.settings')}
        className={
          'flex h-8 w-8 items-center justify-center rounded-md transition-colors ' +
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
