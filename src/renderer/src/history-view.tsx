import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HistoryEntry } from '../../shared/types'
import { TrackRow } from './track-row'

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export function HistoryView({
  onNavigateDownload
}: {
  onNavigateDownload: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [history, setHistory] = useState<HistoryEntry[]>([])

  useEffect(() => {
    window.plucker.getHistory().then(setHistory)
    return window.plucker.onHistoryChanged(() => window.plucker.getHistory().then(setHistory))
  }, [])

  function redownload(url: string, folder: string): void {
    onNavigateDownload()
    window.plucker.startDownload(url, folder)
  }

  async function deleteEntry(id: string): Promise<void> {
    if (!window.confirm(t('actions.confirmDelete'))) return
    setHistory(await window.plucker.removeHistoryEntry(id, true))
  }

  async function deleteTrack(id: string, file: string): Promise<void> {
    if (!window.confirm(t('actions.confirmDelete'))) return
    setHistory(await window.plucker.removeHistoryTrack(id, file, true))
  }

  const iconBtn =
    'text-neutral-400 hover:text-neutral-100 px-1.5 py-0.5 rounded text-xs border border-neutral-800'

  if (history.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-500">
        {t('history.empty')}
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6 flex flex-col gap-4">
      {history.map((entry) => (
        <div key={entry.id} className="rounded-lg border border-neutral-800">
          <div className="px-4 py-2 border-b border-neutral-800 flex items-center justify-between gap-3">
            <button
              onClick={() => window.plucker.openFolder(entry.folder)}
              title={t('actions.openFolder')}
              className="min-w-0 text-left"
            >
              <div className="truncate text-neutral-200">{entry.title}</div>
              <div className="truncate text-xs text-neutral-500">
                {new Date(entry.completedAt).toLocaleString()} ·{' '}
                {t('download.tracks', { count: entry.tracks.length })}
              </div>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => redownload(entry.url, entry.folder)} className={iconBtn}>
                {t('actions.redownload')}
              </button>
              <button
                onClick={() => deleteEntry(entry.id)}
                className={iconBtn + ' hover:text-red-300'}
              >
                {t('actions.delete')}
              </button>
            </div>
          </div>
          <ul className="divide-y divide-neutral-900">
            {entry.tracks.map((track) => (
              <li key={track.file}>
                <TrackRow
                  track={track}
                  actions={
                    <>
                      {track.videoId && (
                        <button
                          onClick={() => redownload(watchUrl(track.videoId!), entry.folder)}
                          title={t('actions.redownload')}
                          className={iconBtn}
                        >
                          ↻
                        </button>
                      )}
                      <button
                        onClick={() => deleteTrack(entry.id, track.file)}
                        title={t('actions.delete')}
                        className={iconBtn + ' hover:text-red-300'}
                      >
                        🗑
                      </button>
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
