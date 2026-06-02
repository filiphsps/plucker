import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import type { JobProgress, JobStatus, LogEntry } from '../../shared/types'
import { TrackRow } from './track-row'
import { showContextMenu } from './ui/context-menu'
import { trackRowMenuItems } from './track-row-menu'
import { statusColumnWidth } from './status-column'
import { ResolvePanel } from './resolve-panel'

export function DownloadView({
  progress,
  statusLog,
  resolveLog,
  onRunningChange,
  onStart
}: {
  progress: JobProgress | null
  /** Resolving trigger: non-null while a job is starting, null once tracks arrive. */
  statusLog: JobStatus[] | null
  /** Live log lines for the current job (shared with the developer console). */
  resolveLog: LogEntry[]
  onRunningChange: (running: boolean) => void
  onStart: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const statusWidth = statusColumnWidth(t)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  async function start(): Promise<void> {
    if (!url.trim()) return
    setBusy(true)
    onRunningChange(true)
    onStart()
    try {
      await window.plucker.startDownload(url.trim())
    } catch {
      // Resolve/start errors are surfaced in the ResolvePanel via job:status.
    } finally {
      setBusy(false)
      onRunningChange(false)
    }
  }

  // The single "now plucking" row to highlight — same selection the transport deck uses.
  const activeIndex = (
    progress?.tracks.find((x) => x.status === 'downloading' || x.status === 'transforming') ??
    progress?.tracks.find((x) => x.status === 'queued')
  )?.index

  return (
    <div className="flex h-full flex-col">
      {/* command bar */}
      <div className="flex gap-2.5 border-b border-line px-4 py-3">
        <div className="flex flex-1 items-center gap-2.5 rounded-[7px] border border-line bg-[#0a0b0e] px-3">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && start()}
            placeholder={t('download.urlPlaceholder')}
            className="h-9 w-full bg-transparent font-mono text-[12px] text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
        <button
          onClick={start}
          disabled={busy}
          className="flex h-9 items-center gap-[7px] rounded-[7px] bg-accent px-[22px] text-[13px] font-semibold text-white disabled:opacity-50"
        >
          <Download size={15} strokeWidth={2.2} />
          {busy ? t('download.plucking') : t('download.pluck')}
        </button>
      </div>

      {progress ? (
        <>
          {/* column header */}
          <div className="flex items-center gap-3 border-b border-line py-[7px] pl-[42px] pr-4 font-mono text-[9.5px] uppercase tracking-[1px] text-ink-faint">
            <span className="w-[22px]">#</span>
            <span className="flex-1">{t('download.colTrack')}</span>
            <span className="w-[64px]" />
            <span className="w-[188px]">{t('download.colProgress')}</span>
            <span style={{ width: statusWidth }} className="whitespace-nowrap text-right">
              {t('download.colStatus')}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {progress.tracks.map((tr) => (
              <TrackRow
                key={tr.index}
                variant="download"
                index={tr.index}
                track={tr}
                active={tr.index === activeIndex}
                source={{ videoId: tr.videoId }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  void showContextMenu(
                    trackRowMenuItems({
                      t,
                      variant: 'download',
                      track: tr,
                      missing: false,
                      failed: tr.status === 'failed',
                      onReveal: () => tr.file && window.plucker.revealFile(tr.file)
                    })
                  )
                }}
              />
            ))}
          </div>
        </>
      ) : statusLog !== null ? (
        <ResolvePanel entries={resolveLog} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-ink-faint">
          {t('download.emptyHint')}
        </div>
      )}
    </div>
  )
}
