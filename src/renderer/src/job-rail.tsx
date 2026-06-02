import React from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import type { JobMeta } from '../../shared/types'

/** One job in the rail, with its overall progress for the mini bar. */
export interface RailItem {
  meta: JobMeta
  /** 0..1 overall progress for the mini bar (0 for queued). */
  overall: number
}

/**
 * Left rail listing every job (running / paused / queued) plus a "New" entry.
 * Selecting a row shows that job's detail on the right; selecting New (null)
 * shows the compose/stage flow.
 */
export function JobRail({
  jobs,
  selectedJobId,
  onSelect,
  onCancel
}: {
  jobs: RailItem[]
  selectedJobId: string | null
  onSelect: (jobId: string | null) => void
  onCancel: (jobId: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 overflow-auto border-r border-line p-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={
          'flex items-center gap-2 rounded-[7px] px-3 py-2 text-left text-[12px] font-semibold transition-colors ' +
          (selectedJobId === null ? 'bg-accent/15 text-ink' : 'text-ink-faint hover:bg-raise')
        }
      >
        <Plus size={14} strokeWidth={2.4} />
        {t('jobs.new')}
      </button>
      {jobs.map((j) => (
        <button
          key={j.meta.jobId}
          type="button"
          onClick={() => onSelect(j.meta.jobId)}
          className={
            'group rounded-[7px] px-3 py-2 text-left transition-colors ' +
            (selectedJobId === j.meta.jobId ? 'bg-accent/15' : 'hover:bg-raise')
          }
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[12px] text-ink">{j.meta.title}</span>
            <span
              role="button"
              aria-label={t('jobs.cancel')}
              title={t('jobs.cancel')}
              onClick={(e) => {
                e.stopPropagation()
                onCancel(j.meta.jobId)
              }}
              className="shrink-0 rounded p-0.5 text-ink-faint opacity-0 transition-colors hover:text-bad group-hover:opacity-100"
            >
              <X size={13} />
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded bg-raise">
            <div
              className="h-1 rounded bg-accent transition-[width]"
              style={{ width: `${Math.round(j.overall * 100)}%` }}
            />
          </div>
          <span className="mt-1 block font-mono text-[9px] uppercase tracking-[1px] text-ink-faint">
            {t(`jobs.state.${j.meta.state}`)}
          </span>
        </button>
      ))}
    </nav>
  )
}
