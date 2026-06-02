import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Music, Folder, RotateCw, Trash2, X, Search, Check } from 'lucide-react'
import type { HistoryEntry, HistoryTrack, JobOutcome } from '../../shared/types'
import { TrackRow } from './track-row'
import { watchUrl } from '../../shared/youtube-url'
import { showContextMenu } from './ui/context-menu'
import { trackRowMenuItems } from './track-row-menu'
import { historyCardMenuItems } from './history-card-menu'
import { Tooltip } from './ui/tooltip'
import {
  groupForDelete,
  isDeletable,
  parseTrackKey,
  selectOnClick,
  targetsFor,
  trackKey
} from './history-selection'

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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)

  // Apply a fresh history list and prune any selected keys whose track no
  // longer exists, so the selection never dangles onto a shifted index after a
  // delete or an external change. (Indices are stale-sensitive — a stale key
  // could otherwise delete the wrong track.)
  function applyHistory(next: HistoryEntry[]): void {
    setHistory(next)
    const valid = new Set(next.flatMap((e) => e.tracks.map((_, i) => trackKey(e.id, i))))
    setSelected((cur) => {
      const pruned = new Set([...cur].filter((k) => valid.has(k)))
      return pruned.size === cur.size ? cur : pruned
    })
  }

  useEffect(() => {
    window.plucker.getHistory().then(applyHistory)
    return window.plucker.onHistoryChanged(() => window.plucker.getHistory().then(applyHistory))
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
  // Only confirm when there's an actual downloaded file to lose. An entry whose
  // files are all absent/failed has nothing destructive to delete → no prompt.
  async function deleteEntry(id: string, hasFiles: boolean): Promise<void> {
    if (hasFiles && !window.confirm(t('actions.confirmDelete'))) return
    applyHistory(await window.plucker.removeHistoryEntry(id, true))
  }

  // --- track-level selection + bulk actions --------------------------------

  /** Resolve a selection key back to its entry, track, and index. */
  function lookup(key: string): { entry: HistoryEntry; track: HistoryTrack; index: number } | null {
    const { entryId, index } = parseTrackKey(key)
    const entry = history.find((e) => e.id === entryId)
    const track = entry?.tracks[index]
    return entry && track ? { entry, track, index } : null
  }

  /** Does this track have a real file on disk that deletion would remove? */
  function deletable(track: HistoryTrack): boolean {
    return isDeletable(track.file, !!track.file && missing.has(track.file))
  }

  function onRowSelect(key: string, e: React.MouseEvent): void {
    const r = selectOnClick(selected, anchor, orderedKeys, key, {
      shift: e.shiftKey,
      meta: e.metaKey || e.ctrlKey
    })
    setSelected(r.selected)
    setAnchor(r.anchor)
  }

  function revealTargets(keys: string[]): void {
    for (const key of keys) {
      const hit = lookup(key)
      if (hit?.track.file) window.plucker.revealFile(hit.track.file)
    }
  }

  // The main process runs one job at a time (job:start resolves when the job
  // finishes), so redownload each target sequentially rather than racing them.
  async function redownloadTargets(keys: string[]): Promise<void> {
    onNavigateDownload()
    for (const key of keys) {
      const hit = lookup(key)
      if (hit?.track.videoId) {
        await window.plucker.startDownload(watchUrl(hit.track.videoId), hit.entry.folder)
      }
    }
  }

  // Confirm once iff any target has a real file. Remove per entry in descending
  // index order so earlier indices stay valid as later ones are removed.
  async function deleteTargets(keys: string[]): Promise<void> {
    if (keys.length === 0) return
    const anyFile = keys.some((k) => {
      const hit = lookup(k)
      return hit ? deletable(hit.track) : false
    })
    if (anyFile && !window.confirm(t('actions.confirmDelete'))) return
    let result = history
    for (const [entryId, indices] of groupForDelete(keys)) {
      for (const index of indices) {
        result = await window.plucker.removeHistoryTrack(entryId, index, true)
      }
    }
    setHistory(result)
    setSelected(new Set())
    setAnchor(null)
  }

  const filtered = history.filter((e) =>
    query.trim() ? e.title.toLowerCase().includes(query.trim().toLowerCase()) : true
  )

  // Flat list of every visible track key in render order — the basis for
  // shift-range selection.
  const orderedKeys = filtered.flatMap((e) => e.tracks.map((_, i) => trackKey(e.id, i)))

  // Delete/Backspace clears the current selection (an in-page shortcut, per
  // Electron's keyboard-shortcuts guidance — a window keydown listener). Ignore
  // it while typing in a field so the search box's Backspace still edits text.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (selected.size === 0) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
        return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        void deleteTargets([...selected])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // deleteTargets closes over history/missing/selected; re-bind when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, history, missing])

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
        // No real files anywhere in the entry → deleting removes nothing on
        // disk, so the action reads as "clear" rather than "delete".
        const entryHasFiles = entry.tracks.some(deletable)
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
                    onDelete: () => deleteEntry(entry.id, entryHasFiles)
                  })
                )
              }}
            >
              <Tooltip label={t('actions.openFolder')}>
                <button
                  onClick={() => window.plucker.openFolder(entry.folder)}
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-md border border-line bg-[#23272e] text-ink-faint"
                >
                  <Music size={20} />
                </button>
              </Tooltip>
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
                <Tooltip label={t(entryHasFiles ? 'actions.delete' : 'actions.clear')}>
                  <button
                    className={
                      jbtn +
                      ' w-[30px] justify-center px-0' +
                      (entryHasFiles ? ' hover:border-bad/40 hover:text-bad' : '')
                    }
                    onClick={() => deleteEntry(entry.id, entryHasFiles)}
                  >
                    {entryHasFiles ? <Trash2 size={14} /> : <X size={14} />}
                  </button>
                </Tooltip>
              </div>
            </div>

            {entry.tracks.map((tk, i) => {
              const key = trackKey(entry.id, i)
              const isMissing = !!tk.file && missing.has(tk.file)
              const canDelete = deletable(tk)
              return (
                <TrackRow
                  key={tk.file || i}
                  variant="history"
                  index={i + 1}
                  track={tk}
                  missing={isMissing}
                  selected={selected.has(key)}
                  onSelect={(e) => onRowSelect(key, e)}
                  onActivate={() => tk.file && !isMissing && window.plucker.revealFile(tk.file)}
                  source={{ videoId: tk.videoId, downloadedAt: entry.completedAt }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    void showContextMenu(
                      trackRowMenuItems({
                        t,
                        variant: 'history',
                        track: tk,
                        missing: isMissing,
                        failed: tk.status === 'failed',
                        onReveal: () => revealTargets(targetsFor(selected, key)),
                        onRedownload: () => void redownloadTargets(targetsFor(selected, key)),
                        onDelete: () => void deleteTargets(targetsFor(selected, key))
                      })
                    )
                  }}
                  actions={
                    <>
                      {tk.file && (
                        <Tooltip label={t('actions.reveal')}>
                          <button
                            className={ra}
                            onClick={() => revealTargets(targetsFor(selected, key))}
                          >
                            <Folder size={15} />
                          </button>
                        </Tooltip>
                      )}
                      {tk.videoId && (
                        <Tooltip label={t('actions.redownload')}>
                          <button
                            className={ra}
                            onClick={() => void redownloadTargets(targetsFor(selected, key))}
                          >
                            <RotateCw size={15} />
                          </button>
                        </Tooltip>
                      )}
                      <Tooltip label={t(canDelete ? 'actions.delete' : 'actions.clear')}>
                        <button
                          className={ra + (canDelete ? ' hover:text-bad' : '')}
                          onClick={() => void deleteTargets(targetsFor(selected, key))}
                        >
                          {canDelete ? <Trash2 size={15} /> : <X size={15} />}
                        </button>
                      </Tooltip>
                    </>
                  }
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
