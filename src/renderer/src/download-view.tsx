import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Download, X } from 'lucide-react'
import type { JobProgress, JobStatus, LogEntry, PlaylistEntry } from '../../shared/types'
import { isSupportedUrl } from '../../shared/url-providers'
import { TrackRow } from './track-row'
import { VirtualList } from './ui/virtual-list'
import { showContextMenu } from './ui/context-menu'
import { trackRowMenuItems } from './track-row-menu'
import { statusColumnWidth } from './status-column'
import { ResolvePanel } from './resolve-panel'
import { UrlSuggestions } from './ui/url-suggestions'
import { removeEntry, moveEntry } from './staging-list'

/** Track statuses that mean a job is still working and the command bar must stay locked. */
const ACTIVE_STATUSES: ReadonlySet<string> = new Set(['queued', 'downloading', 'transforming'])

/** A resolved-but-not-started job awaiting the user's Start click. */
interface StagedJob {
  url: string
  title: string
  kind: 'playlist' | 'video'
  entries: PlaylistEntry[]
  /** Reuse a specific output folder (history redownload). */
  folderOverride?: string
}

/** One row in the staging list: reorder + remove before the job starts. */
function StagedRow({
  entry,
  pos,
  count,
  onRemove,
  onMove
}: {
  entry: PlaylistEntry
  pos: number
  count: number
  onRemove: () => void
  onMove: (to: number) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3 border-b border-line py-2 pl-4 pr-3 text-[12px]">
      <span className="w-[22px] font-mono text-ink-faint">{pos + 1}</span>
      <span className="flex-1 truncate text-ink">{entry.title}</span>
      <button
        type="button"
        aria-label={t('download.moveUp')}
        title={t('download.moveUp')}
        disabled={pos === 0}
        onClick={() => onMove(pos - 1)}
        className="rounded p-1 text-ink-faint transition-colors hover:bg-raise hover:text-ink disabled:opacity-30"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        aria-label={t('download.moveDown')}
        title={t('download.moveDown')}
        disabled={pos === count - 1}
        onClick={() => onMove(pos + 1)}
        className="rounded p-1 text-ink-faint transition-colors hover:bg-raise hover:text-ink disabled:opacity-30"
      >
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        aria-label={t('download.removeTrack')}
        title={t('download.removeTrack')}
        onClick={onRemove}
        className="rounded p-1 text-ink-faint transition-colors hover:bg-raise hover:text-bad"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function DownloadView({
  progress,
  statusLog,
  resolveLog,
  urlHistory,
  trackPaused,
  redownloadRequest,
  prefill,
  onRunningChange,
  onStart,
  onClear,
  onRedownloadConsumed
}: {
  progress: JobProgress | null
  /** Resolving trigger: non-null while a job is starting, null once tracks arrive. */
  statusLog: JobStatus[] | null
  /** Live log lines for the current job (shared with the developer console). */
  resolveLog: LogEntry[]
  /** Past download URLs (most-recent-first) for the suggestions dropdown. */
  urlHistory: string[]
  /** Per-track paused state for the live job (index → paused). */
  trackPaused: Record<number, boolean>
  /** A history redownload request to auto-resolve into the staging list. */
  redownloadRequest?: { url: string; folder: string } | null
  /** Set the URL field and focus it (File ▸ New Download clears with '', Open URL… prefills). */
  prefill?: { url: string; nonce: number } | null
  onRunningChange: (running: boolean) => void
  onStart: () => void
  /** Reset the page back to its empty state (clears progress + resolve log). */
  onClear: () => void
  /** Signal that a redownload request has been consumed (clear it upstream). */
  onRedownloadConsumed?: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const statusWidth = statusColumnWidth(t)
  const inputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [resolving, setResolving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const [staged, setStaged] = useState<StagedJob | null>(null)

  const trimmed = url.trim()
  // The job is "active" (and the bar locked) while resolving or while any track is
  // still queued/downloading/transforming. Staging keeps the bar editable.
  const downloading = progress?.tracks.some((tr) => ACTIVE_STATUSES.has(tr.status)) ?? false
  const locked = resolving || downloading

  const valid = isSupportedUrl(trimmed)
  const invalid = trimmed.length > 0 && !valid && !locked
  const hasContent =
    progress !== null || statusLog !== null || staged !== null || trimmed.length > 0

  // Suggestions: filter history by case-insensitive substring. Hidden until the
  // input has at least one character so the dropdown doesn't show on empty focus.
  const matches = urlHistory.filter((u) => u.toLowerCase().includes(trimmed.toLowerCase()))
  const showSuggestions =
    focused && !dismissed && !locked && trimmed.length > 0 && matches.length > 0
  const clampedHighlight = highlighted < matches.length ? highlighted : -1

  // Autofocus the command bar on mount and whenever the window regains focus,
  // so the user can paste a URL immediately without clicking in.
  useEffect(() => {
    const focus = (): void => inputRef.current?.focus()
    focus()
    window.addEventListener('focus', focus)
    return () => window.removeEventListener('focus', focus)
  }, [])

  // React to File ▸ New Download / Open URL…: set the field from the menu command.
  // `nonce` makes the same URL (or a repeated empty "New Download") retrigger. This
  // derives state from a changing prop during render — React's recommended pattern,
  // not an effect — see https://react.dev/learn/you-might-not-need-an-effect.
  const [lastPrefillNonce, setLastPrefillNonce] = useState<number | null>(null)
  if (prefill && prefill.nonce !== lastPrefillNonce) {
    setLastPrefillNonce(prefill.nonce)
    setUrl(prefill.url)
    setDismissed(true)
  }
  // Focus the bar after the prefill commits (side effect only — no setState here).
  useEffect(() => {
    if (prefill) inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce])

  /** Resolve a URL into the staging list (no download yet). */
  async function resolve(targetUrl: string, folderOverride?: string): Promise<void> {
    const u = targetUrl.trim()
    if (!isSupportedUrl(u) || locked) return
    setUrl(u) // reflect the resolved URL in the bar (e.g. a history redownload)
    void window.plucker.addUrlHistory(u)
    setDismissed(true)
    setResolving(true)
    onStart() // clears prior progress + seeds the resolve-log window
    try {
      const job = await window.plucker.resolveJob(u)
      setStaged({ url: u, title: job.title, kind: job.kind, entries: job.entries, folderOverride })
    } catch {
      // Resolve errors surface in the ResolvePanel via job:status.
    } finally {
      setResolving(false)
    }
  }

  /** Start the curated, reordered staged job. */
  async function startStaged(): Promise<void> {
    if (!staged || staged.entries.length === 0) return
    const req = {
      url: staged.url,
      title: staged.title,
      kind: staged.kind,
      entries: staged.entries,
      folderOverride: staged.folderOverride
    }
    // Hand off to the live job; the resolve panel covers the brief gap until the
    // first progress frame arrives and the track list takes over.
    setStaged(null)
    setBusy(true)
    onRunningChange(true)
    try {
      await window.plucker.startDownload(req)
    } catch {
      // Start errors surface in the ResolvePanel via job:status.
    } finally {
      setBusy(false)
      onRunningChange(false)
    }
  }

  // Auto-resolve a history redownload request into the staging list. This is a
  // one-shot reaction to an external signal (a new request object), so kicking
  // off the resolve here — which updates state — is intentional.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!redownloadRequest) return
    void resolve(redownloadRequest.url, redownloadRequest.folder)
    onRedownloadConsumed?.()
  }, [redownloadRequest])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  function clear(): void {
    if (locked) return
    setUrl('')
    setHighlighted(-1)
    setStaged(null)
    onClear()
  }

  function selectSuggestion(value: string): void {
    setUrl(value)
    setDismissed(true)
    setHighlighted(-1)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      if (showSuggestions && clampedHighlight >= 0) {
        selectSuggestion(matches[clampedHighlight])
      } else {
        void resolve(trimmed)
      }
    } else if (e.key === 'ArrowDown' && showSuggestions) {
      e.preventDefault()
      setHighlighted((h) => Math.min(matches.length - 1, h + 1))
    } else if (e.key === 'ArrowUp' && showSuggestions) {
      e.preventDefault()
      setHighlighted((h) => Math.max(-1, h - 1))
    } else if (e.key === 'Escape') {
      setDismissed(true)
    }
  }

  // The single "now plucking" row to highlight — same selection the transport deck uses.
  const activeIndex = (
    progress?.tracks.find((x) => x.status === 'downloading' || x.status === 'transforming') ??
    progress?.tracks.find((x) => x.status === 'queued')
  )?.index

  function onPageContextMenu(e: React.MouseEvent): void {
    e.preventDefault()
    void showContextMenu([
      {
        label: t('download.clear'),
        symbol: 'trash',
        enabled: hasContent && !locked,
        onClick: clear
      }
    ])
  }

  return (
    <div className="flex h-full flex-col" onContextMenu={onPageContextMenu}>
      {/* command bar */}
      <div className="flex gap-2.5 border-b border-line px-4 py-3">
        <div className="relative flex-1">
          <div
            className={
              'flex items-center gap-2.5 rounded-[7px] border bg-[#0a0b0e] px-3 ' +
              (invalid ? 'border-bad' : 'border-line')
            }
          >
            <span
              className={
                'h-[7px] w-[7px] shrink-0 rounded-full ' + (invalid ? 'bg-bad' : 'bg-accent')
              }
            />
            <input
              ref={inputRef}
              value={url}
              disabled={locked}
              onChange={(e) => {
                setUrl(e.target.value)
                setDismissed(false)
                setHighlighted(-1)
                if (e.target.value.trim() === '') clear()
              }}
              onFocus={() => {
                setFocused(true)
                setDismissed(false)
              }}
              onBlur={() => {
                setFocused(false)
                if (valid) void window.plucker.addUrlHistory(trimmed)
              }}
              onKeyDown={onKeyDown}
              placeholder={t('download.urlPlaceholder')}
              title={invalid ? t('download.invalidUrl') : undefined}
              className="h-9 w-full bg-transparent font-mono text-[12px] text-ink outline-none placeholder:text-ink-faint disabled:opacity-60"
            />
            {hasContent && !locked && (
              <button
                type="button"
                aria-label={t('download.clearTitle')}
                title={t('download.clearTitle')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={clear}
                className="shrink-0 rounded p-0.5 text-ink-faint transition-colors hover:bg-raise hover:text-ink"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {showSuggestions && (
            <UrlSuggestions
              items={matches}
              highlightedIndex={clampedHighlight}
              onSelect={selectSuggestion}
              onDelete={(u) => void window.plucker.removeUrlHistory(u)}
              onHighlight={setHighlighted}
            />
          )}
        </div>
        <button
          onClick={() => void resolve(trimmed)}
          disabled={busy || locked || !valid}
          className="flex h-9 items-center gap-[7px] rounded-[7px] bg-accent px-[22px] text-[13px] font-semibold text-white disabled:opacity-50"
        >
          <Download size={15} strokeWidth={2.2} />
          {resolving ? t('download.plucking') : t('download.pluck')}
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

          <VirtualList
            className="min-h-0 flex-1 overflow-auto"
            items={progress.tracks}
            getKey={(tr) => tr.index}
            estimateSize={48}
          >
            {(tr) => (
              <TrackRow
                variant="download"
                index={tr.index}
                track={tr}
                active={tr.index === activeIndex}
                source={{ videoId: tr.videoId }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  void showContextMenu(
                    trackRowMenuItems({
                      t,
                      variant: 'download',
                      track: {
                        ...tr,
                        status: tr.status,
                        paused: trackPaused[tr.index] ?? false
                      },
                      missing: false,
                      failed: tr.status === 'failed',
                      onReveal: () => tr.file && window.plucker.revealFile(tr.file),
                      onSkip: () => void window.plucker.skipTrack(tr.index),
                      onPause: () => void window.plucker.pauseTrack(tr.index),
                      onResume: () => void window.plucker.resumeTrack(tr.index)
                    })
                  )
                }}
              />
            )}
          </VirtualList>
        </>
      ) : staged ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
            <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[1px] text-ink-faint">
              {staged.title} · {t('download.tracks', { count: staged.entries.length })}
            </span>
            <button
              onClick={startStaged}
              disabled={busy || staged.entries.length === 0}
              className="flex h-8 shrink-0 items-center gap-2 rounded-[7px] bg-accent px-4 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              <Download size={14} strokeWidth={2.2} />
              {t('download.startDownload')}
            </button>
          </div>
          <VirtualList
            className="min-h-0 flex-1 overflow-auto"
            items={staged.entries}
            getKey={(e, pos) => e.videoId + ':' + pos}
            estimateSize={33}
          >
            {(e, pos) => (
              <StagedRow
                entry={e}
                pos={pos}
                count={staged.entries.length}
                onRemove={() =>
                  setStaged((s) => (s ? { ...s, entries: removeEntry(s.entries, pos) } : s))
                }
                onMove={(to) =>
                  setStaged((s) => (s ? { ...s, entries: moveEntry(s.entries, pos, to) } : s))
                }
              />
            )}
          </VirtualList>
        </div>
      ) : statusLog !== null || resolving ? (
        <ResolvePanel entries={resolveLog} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-ink-faint">
          {t('download.emptyHint')}
        </div>
      )}
    </div>
  )
}
