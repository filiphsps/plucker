import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronUp } from 'lucide-react'
import type { ActivityEvent } from '../../../shared/library'

/** A collapsible bottom dock: one most-recent line, expands upward to the full timeline. */
export function ActivityDock({ events }: { events: ActivityEvent[] }): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const latest = events[0] // service returns most-recent-first

  return (
    <div className="flex-none border-t border-line bg-panel2">
      {open && (
        <ul className="max-h-[240px] overflow-auto border-b border-line2">
          {events.map((e) => (
            <li
              key={e.id}
              className={`flex items-center gap-2 border-b border-line2 px-[18px] py-1.5 text-[11px] text-ink-dim activity-${e.type}`}
            >
              <span className="h-1 w-1 flex-none rounded-full bg-ok" />
              <span className="truncate">{e.summary}</span>
              <time dateTime={e.ts} className="ml-auto flex-none font-mono text-[10px] text-ink-faint">
                {new Date(e.ts).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-[34px] w-full items-center gap-2.5 px-[18px] text-left"
      >
        <span className="font-mono text-[9px] uppercase tracking-[1.3px] text-ink-faint">
          {t('activity.title')}
        </span>
        <span className="flex items-center gap-1.5 truncate text-[11px] text-ink-dim">
          {latest ? latest.summary : t('activity.empty')}
        </span>
        <ChevronUp
          size={13}
          className={'ml-auto flex-none text-ink-faint transition-transform ' + (open ? 'rotate-180' : '')}
        />
      </button>
    </div>
  )
}
