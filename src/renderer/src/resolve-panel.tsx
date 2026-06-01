import React from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import type { JobStatus } from '../../shared/types'

/** Loading panel shown on the download page during the yt-dlp resolve phase:
 *  curated i18n steps + live (verbose) console lines, skeleton before anything
 *  streams in, and an inline error block on a failed start. */
export function ResolvePanel({ events }: { events: JobStatus[] }): React.JSX.Element {
  const { t } = useTranslation()
  const errored = events.some((e) => e.phase === 'error')

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
      <div className="flex items-center gap-2.5">
        {!errored && <Loader2 size={15} className="animate-spin text-accent" />}
        <span className={`text-[13px] font-semibold ${errored ? 'text-bad' : 'text-ink'}`}>
          {errored ? t('resolve.errorTitle') : t('resolve.title')}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col gap-2">
          <div className="h-3 w-2/3 animate-pulse rounded bg-line" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-line" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-line" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-[7px] border border-line bg-[#0a0b0e] p-3 font-mono text-[11px] leading-relaxed">
          {events.map((e, i) => (
            <div
              key={i}
              className={e.phase === 'error' ? 'text-bad' : e.key ? 'text-ink' : 'text-ink-faint'}
            >
              {e.phase === 'error' ? e.error : e.key ? t(`resolve.${e.key}`, e.params) : e.line}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
