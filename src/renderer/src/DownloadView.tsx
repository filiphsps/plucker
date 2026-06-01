import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { JobProgress, TrackStatus } from '../../shared/types'

const ICON: Record<TrackStatus, string> = {
  queued: '○',
  downloading: '⬇',
  tagging: '🏷',
  done: '✓',
  failed: '✗',
  skipped: '–'
}

export function DownloadView({
  onOpenSettings
}: {
  onOpenSettings: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<JobProgress | null>(null)

  useEffect(() => window.plucker.onProgress(setProgress), [])

  const done = progress?.tracks.filter((x) => x.status === 'done').length ?? 0

  const statusLabel: Record<TrackStatus, string> = {
    queued: t('status.queued'),
    downloading: t('status.downloading'),
    tagging: t('status.tagging'),
    done: t('status.done'),
    failed: t('status.failed'),
    skipped: t('status.skipped')
  }

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
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">🎵 Plucker</h1>
        <button
          onClick={onOpenSettings}
          className="text-neutral-400 hover:text-neutral-100 text-xl"
          aria-label={t('app.settings')}
        >
          ⚙︎
        </button>
      </header>

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
        <div className="flex-1 overflow-auto rounded-lg border border-neutral-800">
          <div className="px-4 py-2 text-sm text-neutral-400 border-b border-neutral-800">
            {progress.jobTitle} · {t('download.tracks', { count: progress.total })}
          </div>
          <ul className="divide-y divide-neutral-900">
            {progress.tracks.map((track) => (
              <li key={track.index} className="px-4 py-2 flex items-center gap-3 text-sm">
                <span className="w-5 text-center">{ICON[track.status]}</span>
                <span className="flex-1 truncate">{track.title}</span>
                <span className="text-neutral-500 w-24 text-right">
                  {track.status === 'downloading'
                    ? `${Math.round(track.percent ?? 0)}%`
                    : statusLabel[track.status]}
                </span>
              </li>
            ))}
          </ul>
          <div className="px-4 py-2 border-t border-neutral-800 text-sm flex items-center justify-between">
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
