import React from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCw, X } from 'lucide-react'

export interface InterruptedJob {
  jobId: string
  title: string
  done: number
  total: number
}

/**
 * Top-of-window banner offering to resume the most recently interrupted job. Renders
 * nothing when there are none. "Dismiss" only hides it for the session — the History
 * entry + checkpoint remain, so the job is never lost.
 */
export function ResumeBanner({
  jobs,
  onResume,
  onDismiss
}: {
  jobs: InterruptedJob[]
  onResume: (jobId: string) => void
  onDismiss: (jobId: string) => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const job = jobs[0]
  if (!job) return null
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 border-b border-accent/30 bg-accent/[0.08] px-[18px] py-2 text-[13px] text-ink"
    >
      <span>{t('resume.banner', { title: job.title, done: job.done, total: job.total })}</span>
      <span className="flex shrink-0 gap-1.5">
        <button
          className="flex h-7 items-center gap-1.5 rounded-[7px] bg-accent px-3 text-[12px] font-semibold text-white"
          onClick={() => onResume(job.jobId)}
        >
          <RotateCw size={13} />
          {t('resume.action')}
        </button>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-[7px] text-ink-dim hover:bg-raise hover:text-ink"
          aria-label={t('resume.dismiss')}
          onClick={() => onDismiss(job.jobId)}
        >
          <X size={14} />
        </button>
      </span>
    </div>
  )
}
