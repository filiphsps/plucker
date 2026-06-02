import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, X } from 'lucide-react'
import type { JobProgress, JobStatus, LogEntry } from '../../shared/types'
import { isSupportedUrl } from '../../shared/url-providers'
import { TrackRow } from './track-row'
import { showContextMenu } from './ui/context-menu'
import { trackRowMenuItems } from './track-row-menu'
import { statusColumnWidth } from './status-column'
import { ResolvePanel } from './resolve-panel'
import { UrlSuggestions } from './ui/url-suggestions'

/** Track statuses that mean a job is still working and the command bar must stay locked. */
const ACTIVE_STATUSES: ReadonlySet<string> = new Set(['queued', 'downloading', 'transforming'])

export function DownloadView({
  progress,
  statusLog,
  resolveLog,
  urlHistory,
  onRunningChange,
  onStart,
  onClear
}: {
  progress: JobProgress | null
  /** Resolving trigger: non-null while a job is starting, null once tracks arrive. */
  statusLog: JobStatus[] | null
  /** Live log lines for the current job (shared with the developer console). */
  resolveLog: LogEntry[]
  /** Past download URLs (most-recent-first) for the suggestions dropdown. */
  urlHistory: string[]
  onRunningChange: (running: boolean) => void
  onStart: () => void
  /** Reset the page back to its empty state (clears progress + resolve log). */
  onClear: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const statusWidth = statusColumnWidth(t)
  const inputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)

  const trimmed = url.trim()
  // The job is "active" (and the bar locked) while resolving or while any track is
  // still queued/downloading/transforming. Finished/failed/skipped jobs unlock.
  const resolving = statusLog !== null && progress === null
  const downloading = progress?.tracks.some((tr) => ACTIVE_STATUSES.has(tr.status)) ?? false
  const locked = resolving || downloading

  const valid = isSupportedUrl(trimmed)
  const invalid = trimmed.length > 0 && !valid && !locked
  const hasContent = progress !== null || statusLog !== null || trimmed.length > 0

  // Suggestions: filter history by case-insensitive substring (all when empty).
  const matches = urlHistory.filter((u) => u.toLowerCase().includes(trimmed.toLowerCase()))
  const showSuggestions = focused && !dismissed && !locked && matches.length > 0
  const clampedHighlight = highlighted < matches.length ? highlighted : -1

  // Autofocus the command bar on mount and whenever the window regains focus,
  // so the user can paste a URL immediately without clicking in.
  useEffect(() => {
    const focus = (): void => inputRef.current?.focus()
    focus()
    window.addEventListener('focus', focus)
    return () => window.removeEventListener('focus', focus)
  }, [])

  /** Persist a valid URL to history; called on blur and on submit. */
  function commit(): void {
    if (valid) void window.plucker.addUrlHistory(trimmed)
  }

  async function start(): Promise<void> {
    if (!valid || locked) return
    commit()
    setDismissed(true)
    setBusy(true)
    onRunningChange(true)
    onStart()
    try {
      await window.plucker.startDownload(trimmed)
    } catch {
      // Resolve/start errors are surfaced in the ResolvePanel via job:status.
    } finally {
      setBusy(false)
      onRunningChange(false)
    }
  }

  function clear(): void {
    if (locked) return
    setUrl('')
    setHighlighted(-1)
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
        void start()
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
      { label: t('download.clear'), enabled: hasContent && !locked, onClick: clear }
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
                commit()
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
          onClick={start}
          disabled={busy || locked || !valid}
          className="flex h-9 items-center gap-[7px] rounded-[7px] bg-accent px-[22px] text-[13px] font-semibold text-white disabled:opacity-50"
        >
          <Download size={15} strokeWidth={2.2} />
          {busy || locked ? t('download.plucking') : t('download.pluck')}
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
                  e.stopPropagation()
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
