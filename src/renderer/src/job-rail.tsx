import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import type { JobState } from '../../shared/types'

/** One job in the rail, flattened for display. */
export interface RailItem {
  jobId: string
  title: string
  /** 0..1 overall progress for the mini bar. */
  overall: number
  /** Display state — 'done' for finished jobs kept around for review. */
  state: JobState | 'done'
  /** True for a finished job (X dismisses it instead of cancelling). */
  finished: boolean
}

const MIN_WIDTH = 160
const MAX_WIDTH = 420
const DEFAULT_WIDTH = 224
const STORAGE_KEY = 'jobRailWidth'

function initialWidth(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_WIDTH
  const saved = Number(localStorage.getItem(STORAGE_KEY))
  return saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : DEFAULT_WIDTH
}

/**
 * Resizable left rail listing every job (running / paused / queued / finished) plus
 * a "New" entry. Selecting a row shows that job's detail on the right; selecting New
 * (null) shows the compose/stage flow. The X cancels a live job or dismisses a
 * finished one. Drag the right edge to resize; the width persists across launches.
 */
export function JobRail({
  jobs,
  selectedJobId,
  onSelect,
  onClose
}: {
  jobs: RailItem[]
  selectedJobId: string | null
  onSelect: (jobId: string | null) => void
  onClose: (jobId: string, finished: boolean) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [width, setWidth] = useState(initialWidth)

  const startDrag = (e: React.MouseEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    let last = startW
    const onMove = (ev: MouseEvent): void => {
      last = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + (ev.clientX - startX)))
      setWidth(last)
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, String(last))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="relative flex shrink-0" style={{ width }}>
      <nav className="flex flex-1 flex-col gap-1 overflow-auto border-r border-line p-2">
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
            key={j.jobId}
            type="button"
            onClick={() => onSelect(j.jobId)}
            className={
              'group rounded-[7px] px-3 py-2 text-left transition-colors ' +
              (selectedJobId === j.jobId ? 'bg-accent/15' : 'hover:bg-raise')
            }
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[12px] text-ink">{j.title}</span>
              <span
                role="button"
                aria-label={j.finished ? t('jobs.dismiss') : t('jobs.cancel')}
                title={j.finished ? t('jobs.dismiss') : t('jobs.cancel')}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(j.jobId, j.finished)
                }}
                className="shrink-0 rounded p-0.5 text-ink-faint opacity-0 transition-colors hover:text-bad group-hover:opacity-100"
              >
                <X size={13} />
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded bg-raise">
              <div
                className={
                  'h-1 rounded transition-[width] ' + (j.finished ? 'bg-ink-faint' : 'bg-accent')
                }
                style={{ width: `${Math.round(j.overall * 100)}%` }}
              />
            </div>
            <span className="mt-1 block font-mono text-[9px] uppercase tracking-[1px] text-ink-faint">
              {t(`jobs.state.${j.state}`)}
            </span>
          </button>
        ))}
      </nav>
      <div
        onMouseDown={startDrag}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-accent/40"
      />
    </div>
  )
}
