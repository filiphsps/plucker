import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { JobProgress, TrackStatus } from '../../shared/types'
import { TrackRow } from './TrackRow'

const ICON: Record<TrackStatus, string> = {
  queued: '○',
  downloading: '⬇',
  tagging: '🏷',
  done: '✓',
  failed: '✗',
  skipped: '–'
}

export function DownloadView(): React.JSX.Element {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<JobProgress | null>(null)

  useEffect(() => window.plucker.onProgress(setProgress), [])

  const done = progress?.tracks.filter((x) => x.status === 'done').length ?? 0

  const statusText = (status: TrackStatus, percent?: number): string =>
    status === 'downloading' ? `${Math.round(percent ?? 0)}%` : t(`status.${status}`)

  async function start(): Promise<void> {
    if (!url.trim()) return
    setBusy(true)
    try {
      await window.plucker.startDownload(url.trim())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex-1 min-h-0 p-6 flex flex-col gap-5">
      <div>
        <label className="text-sm text-neutral-400">{t('download.urlLabel')}</label>
        <div className="mt-2 flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('download.urlPlaceholder')}
            className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:border-neutral-600"
          />
          <button
            onClick={start}
            disabled={busy}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-5 py-2 font-medium"
          >
            {busy ? t('download.plucking') : t('download.pluck')}
          </button>
        </div>
      </div>

      {progress && (
        <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-neutral-800">
          <div className="px-4 py-2 text-sm border-b border-neutral-800 flex items-center justify-between sticky top-0 bg-neutral-950">
            <button
              onClick={() => progress.folder && window.plucker.openFolder(progress.folder)}
              title={t('actions.openFolder')}
              className="text-neutral-300 hover:text-white truncate text-left"
            >
              {progress.jobTitle} · {t('download.tracks', { count: progress.total })}
            </button>
            {!busy && (
              <button
                onClick={() => setProgress(null)}
                className="text-neutral-400 hover:text-neutral-100 shrink-0 ml-3"
              >
                {t('download.clear')}
              </button>
            )}
          </div>
          <ul className="divide-y divide-neutral-900">
            {progress.tracks.map((track) => (
              <li key={track.index}>
                <TrackRow
                  track={track}
                  statusLabel={`${ICON[track.status]} ${statusText(track.status, track.percent)}`}
                />
              </li>
            ))}
          </ul>
          <div className="px-4 py-2 border-t border-neutral-800 text-sm flex items-center justify-between sticky bottom-0 bg-neutral-950">
            <span>
              {done} / {progress.total}
            </span>
            {busy && (
              <button
                onClick={() => window.plucker.cancel()}
                className="text-red-400 hover:text-red-300"
              >
                {t('download.cancel')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
