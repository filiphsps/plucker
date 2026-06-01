import React, { useEffect, useState } from 'react'
import type { JobProgress } from '../../shared/types'

const ICON: Record<string, string> = {
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
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<JobProgress | null>(null)

  useEffect(() => window.plucker.onProgress(setProgress), [])

  const done = progress?.tracks.filter((t) => t.status === 'done').length ?? 0

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
          aria-label="Settings"
        >
          ⚙︎
        </button>
      </header>

      <div>
        <label className="text-sm text-neutral-400">Paste a YouTube playlist or video URL</label>
        <div className="mt-2 flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/playlist…"
            className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:border-neutral-600"
          />
          <button
            onClick={start}
            disabled={busy}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-5 py-2 font-medium"
          >
            {busy ? 'Plucking…' : 'Pluck'}
          </button>
        </div>
      </div>

      {progress && (
        <div className="flex-1 overflow-auto rounded-lg border border-neutral-800">
          <div className="px-4 py-2 text-sm text-neutral-400 border-b border-neutral-800">
            {progress.jobTitle} · {progress.total} tracks
          </div>
          <ul className="divide-y divide-neutral-900">
            {progress.tracks.map((t) => (
              <li key={t.index} className="px-4 py-2 flex items-center gap-3 text-sm">
                <span className="w-5 text-center">{ICON[t.status]}</span>
                <span className="flex-1 truncate">{t.title}</span>
                <span className="text-neutral-500 w-24 text-right">
                  {t.status === 'downloading' ? `${Math.round(t.percent ?? 0)}%` : t.status}
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
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
