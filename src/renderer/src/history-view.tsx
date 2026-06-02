import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Music, Folder, RotateCw, Trash2, Search, Check } from 'lucide-react'
import type { HistoryEntry, JobOutcome } from '../../shared/types'
import { TrackRow } from './track-row'
import { watchUrl } from '../../shared/youtube-url'
import { showContextMenu } from './ui/context-menu'
import { trackRowMenuItems } from './track-row-menu'
import { historyCardMenuItems } from './history-card-menu'

/** Per-outcome badge styling + i18n label key for a history entry. */
const OUTCOME_BADGE: Record<JobOutcome, { cls: string; labelKey: string; check?: boolean }> = {
  completed: {
    cls: 'border-ok/30 bg-ok/[0.08] text-ok',
    labelKey: 'history.outcomeCompleted',
    check: true
  },
  partial: { cls: 'border-warn/30 bg-warn/[0.08] text-warn', labelKey: 'history.outcomePartial' },
  failed: { cls: 'border-bad/30 bg-bad/[0.08] text-bad', labelKey: 'history.outcomeFailed' },
  cancelled: { cls: 'border-line bg-raise text-ink-dim', labelKey: 'history.outcomeCancelled' }
}

export function HistoryView({
  onNavigateDownload
}: {
  onNavigateDownload: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [query, setQuery] = useState('')
  const [missing, setMissing] = useState<Set<string>>(new Set())

  useEffect(() => {
    window.plucker.getHistory().then(setHistory)
    return window.plucker.onHistoryChanged(() => window.plucker.getHistory().then(setHistory))
  }, [])

  // Flag tracks whose file is no longer on disk.
  useEffect(() => {
    const files = history
      .flatMap((e) => e.tracks.map((tk) => tk.file))
      .filter((f): f is string => !!f)
    let live = true
    window.plucker.filesExist(files).then((exists) => {
      if (live) setMissing(new Set(files.filter((_, i) => !exists[i])))
    })
    return () => {
      live = false
    }
  }, [history])

  function redownload(url: string, folder: string): void {
    onNavigateDownload()
    window.plucker.startDownload(url, folder)
  }
  async function deleteEntry(id: string): Promise<void> {
    if (!window.confirm(t('actions.confirmDelete'))) return
    setHistory(await window.plucker.removeHistoryEntry(id, true))
  }
  // Only confirm when there's an actual downloaded file to lose. Tracks that
  // failed, were stopped/cancelled/skipped, or whose file is missing have
  // nothing destructive to delete, so remove them without prompting.
  async function deleteTrack(id: string, index: number, hasFile: boolean): Promise<void> {
    if (hasFile && !window.confirm(t('actions.confirmDelete'))) return
    setHistory(await window.plucker.removeHistoryTrack(id, index, true))
  }

  const filtered = history.filter((e) =>
    query.trim() ? e.title.toLowerCase().includes(query.trim().toLowerCase()) : true
  )

  if (history.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-ink-faint">
        {t('history.empty')}
      </div>
    )
  }

  const ra =
    'flex h-7 w-7 items-center justify-center rounded-md text-ink-faint hover:bg-raise hover:text-ink'
  const jbtn =
    'flex h-[30px] items-center gap-1.5 rounded-md border border-line bg-raise px-2.5 text-[12px] text-ink-dim hover:text-ink'

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-4 flex h-[34px] items-center gap-2.5 rounded-[7px] border border-line bg-[#0a0b0e] px-3 text-ink-faint">
        <Search size={14} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('history.search')}
          className="h-full w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-faint"
        />
      </div>

      {filtered.map((entry) => {
        const failed = entry.tracks.filter((tk) => tk.status === 'failed').length
        const badge = OUTCOME_BADGE[entry.outcome]
        return (
          <div
            key={entry.id}
            className="mb-3.5 overflow-hidden rounded-[10px] border border-line bg-panel2"
          >
            <div
              className="flex items-center gap-3 border-b border-line bg-panel px-3.5 py-[11px]"
              onContextMenu={(e) => {
                e.preventDefault()
                void showContextMenu(
                  historyCardMenuItems({
                    t,
                    url: entry.url,
                    onOpenFolder: () => window.plucker.openFolder(entry.folder),
                    onRedownload: () => redownload(entry.url, entry.folder),
                    onDelete: () => deleteEntry(entry.id)
                  })
                )
              }}
            >
              <button
                onClick={() => window.plucker.openFolder(entry.folder)}
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-md border border-line bg-[#23272e] text-ink-faint"
                title={t('actions.openFolder')}
              >
                <Music size={20} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-[#e7ebef]">
                  {entry.title}
                </div>
                <div className="mt-[3px] font-mono text-[10.5px] tracking-[0.3px] text-ink-faint">
                  {new Date(entry.completedAt).toLocaleString()} ·{' '}
                  {t('download.tracks', { count: entry.tracks.length })}
                </div>
                {entry.reason && (
                  <div
                    className="mt-[3px] truncate font-mono text-[10.5px] text-bad"
                    title={entry.reason}
                  >
                    {entry.reason}
                  </div>
                )}
              </div>
              <span
                className={
                  'flex items-center gap-1.5 rounded-md border px-[7px] py-[3px] font-mono text-[10px] ' +
                  badge.cls
                }
              >
                {badge.check && <Check size={11} strokeWidth={3} />}
                {t(badge.labelKey as never, { count: failed })}
              </span>
              <div className="flex gap-1.5">
                <button className={jbtn} onClick={() => window.plucker.openFolder(entry.folder)}>
                  <Folder size={14} />
                  {t('actions.openFolder')}
                </button>
                <button className={jbtn} onClick={() => redownload(entry.url, entry.folder)}>
                  <RotateCw size={14} />
                  {t('actions.redownload')}
                </button>
                <button
                  className={
                    jbtn + ' w-[30px] justify-center px-0 hover:border-bad/40 hover:text-bad'
                  }
                  title={t('actions.delete')}
                  onClick={() => deleteEntry(entry.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {entry.tracks.map((tk, i) => (
              <TrackRow
                key={tk.file || i}
                variant="history"
                index={i + 1}
                track={tk}
                missing={!!tk.file && missing.has(tk.file)}
                source={{ videoId: tk.videoId, downloadedAt: entry.completedAt }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  void showContextMenu(
                    trackRowMenuItems({
                      t,
                      variant: 'history',
                      track: tk,
                      missing: !!tk.file && missing.has(tk.file),
                      failed: tk.status === 'failed',
                      onReveal: () => tk.file && window.plucker.revealFile(tk.file),
                      onRedownload: () =>
                        tk.videoId && redownload(watchUrl(tk.videoId), entry.folder),
                      onDelete: () => deleteTrack(entry.id, i, !!tk.file && !missing.has(tk.file))
                    })
                  )
                }}
                actions={
                  <>
                    {tk.file && (
                      <button
                        className={ra}
                        title={t('actions.reveal')}
                        onClick={() => window.plucker.revealFile(tk.file!)}
                      >
                        <Folder size={15} />
                      </button>
                    )}
                    {tk.videoId && (
                      <button
                        className={ra}
                        title={t('actions.redownload')}
                        onClick={() => redownload(watchUrl(tk.videoId!), entry.folder)}
                      >
                        <RotateCw size={15} />
                      </button>
                    )}
                    <button
                      className={ra + ' hover:text-bad'}
                      title={t('actions.delete')}
                      onClick={() => deleteTrack(entry.id, i, !!tk.file && !missing.has(tk.file))}
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                }
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
