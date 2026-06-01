import React from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import type { LogEntry, LogLevel } from '../../shared/types'

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: 'text-ink-faint',
  info: 'text-ink',
  warn: 'text-warn',
  error: 'text-bad'
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * Download-page loading panel shown during the yt-dlp resolve phase. It renders the
 * same unified log stream as the developer console (scoped to the current job), so the
 * loader and the console are one mechanism: a skeleton before anything streams in, live
 * console lines as they arrive, and a red error state if the start fails.
 */
export function ResolvePanel({ entries }: { entries: LogEntry[] }): React.JSX.Element {
  const { t } = useTranslation()
  const errored = entries.some((e) => e.level === 'error')

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
      <div className="flex items-center gap-2.5">
        {!errored && <Loader2 size={15} className="animate-spin text-accent" />}
        <span className={`text-[13px] font-semibold ${errored ? 'text-bad' : 'text-ink'}`}>
          {errored ? t('resolve.errorTitle') : t('resolve.title')}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col gap-2">
          <div className="h-3 w-2/3 animate-pulse rounded bg-line" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-line" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-line" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-[7px] border border-line bg-[#0a0b0e] p-3 font-mono text-[11px] leading-relaxed">
          {entries.map((e, i) => (
            <div key={i} className="flex gap-2 whitespace-pre-wrap break-all">
              <span className="shrink-0 text-ink-faint">{formatTime(e.time)}</span>
              <span className="shrink-0 text-ink-faint">[{e.scope}]</span>
              <span className={LEVEL_COLOR[e.level]}>{e.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
