import React from 'react'
import { useTranslation } from 'react-i18next'

export type View = 'download' | 'history'

export function Header({
  view,
  onNavigate,
  onOpenSettings
}: {
  view: View
  onNavigate: (v: View) => void
  onOpenSettings: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const tab = (v: View, label: string): React.JSX.Element => (
    <button
      onClick={() => onNavigate(v)}
      className={
        'px-3 py-1 rounded-md text-sm ' +
        (view === v ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:text-neutral-100')
      }
    >
      {label}
    </button>
  )

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-900">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold">🎵 Plucker</h1>
        <nav className="flex items-center gap-1">
          {tab('download', t('nav.download'))}
          {tab('history', t('nav.history'))}
        </nav>
      </div>
      <button
        onClick={onOpenSettings}
        className="text-neutral-400 hover:text-neutral-100 text-xl"
        aria-label={t('app.settings')}
      >
        ⚙︎
      </button>
    </header>
  )
}
