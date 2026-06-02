import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  X,
  Trash2,
  Copy,
  FolderOpen,
  ArrowDownToLine,
  PictureInPicture2,
  PictureInPicture,
  Pin
} from 'lucide-react'
import type { LogEntry, LogLevel } from '../../shared/types'
import { filterEntries, logScopes } from './console-filter'
import { LogMessage } from './log-value-view'
import { showContextMenu } from './ui/context-menu'
import { consoleLineMenuItems } from './console-line-menu'

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']

/** Tailwind text color per log level (shared by lines and level chips). */
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
 * The console UI shared by the docked drawer and the floating window. `variant`
 * controls the chrome: the docked variant has a drag-to-resize title bar plus an
 * Undock + Close control; the floating variant fills its window and has Dock + Pin
 * controls instead (the OS frame handles close/resize).
 */
export function ConsolePanel({
  entries,
  onClear,
  variant,
  height,
  onResizeStart,
  onUndock,
  onClose,
  onDock,
  alwaysOnTop,
  onToggleAlwaysOnTop
}: {
  entries: LogEntry[]
  onClear: () => void
  variant: 'docked' | 'floating'
  height?: number
  onResizeStart?: (e: React.PointerEvent) => void
  onUndock?: () => void
  onClose?: () => void
  onDock?: () => void
  alwaysOnTop?: boolean
  onToggleAlwaysOnTop?: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  // Filters track which values are *off* (default: everything on).
  const [levelsOff, setLevelsOff] = useState<Set<LogLevel>>(() => new Set())
  const [scopesOff, setScopesOff] = useState<Set<string>>(() => new Set())
  const [copied, setCopied] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  // Auto-scroll is stateful so the toggle button reflects it. It turns itself off
  // when the user scrolls up and back on when they return to the bottom.
  const [autoScroll, setAutoScroll] = useState(true)

  // Scopes available to filter on, derived from the entries actually seen.
  const scopes = useMemo(() => logScopes(entries), [entries])

  const filtered = useMemo(
    () => filterEntries(entries, levelsOff, scopesOff),
    [entries, levelsOff, scopesOff]
  )

  // Autoscroll to the bottom on new lines while enabled. Re-runs when autoScroll
  // flips on (e.g. via the toggle) so it snaps to the bottom immediately.
  useEffect(() => {
    const el = scrollRef.current
    if (el && autoScroll) el.scrollTop = el.scrollHeight
  }, [filtered, autoScroll])

  // Derive auto-scroll from the scroll position: on once pinned to the bottom,
  // off the moment the user scrolls up. Only update on change to avoid churn.
  function onScroll(e: React.UIEvent<HTMLDivElement>): void {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    setAutoScroll((prev) => (prev === atBottom ? prev : atBottom))
  }

  function toggle<T>(set: Set<T>, value: T, apply: (s: Set<T>) => void): void {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    apply(next)
  }

  async function copyVisible(): Promise<void> {
    const text = filtered
      .map((e) => `${formatTime(e.time)} [${e.level}] [${e.scope}] ${e.message}`)
      .join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const chip = (
    label: string,
    on: boolean,
    color: string,
    onClick: () => void
  ): React.JSX.Element => (
    <button
      key={label}
      onClick={onClick}
      className={
        'rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ' +
        (on ? `bg-raise ${color}` : 'bg-transparent text-ink-faint line-through opacity-60')
      }
    >
      {label}
    </button>
  )

  const docked = variant === 'docked'
  const containerClass = docked
    ? 'flex shrink-0 flex-col border-t border-line bg-[#0a0b0e]'
    : 'flex h-screen flex-col bg-[#0a0b0e]'

  return (
    <div className={containerClass} style={docked ? { height } : undefined}>
      {/* title bar (drag handle / resize handle when docked) */}
      <div
        onPointerDown={docked ? onResizeStart : undefined}
        className={
          'flex h-7 items-center gap-2 border-b border-line2 px-3 select-none ' +
          (docked ? 'cursor-ns-resize' : '')
        }
      >
        <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-ink-faint">
          {t('console.title')}
        </span>
        <span className="font-mono text-[10px] text-ink-faint">
          {t('console.counts', { shown: filtered.length, total: entries.length })}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setAutoScroll((v) => !v)}
          aria-pressed={autoScroll}
          title={t('console.autoScroll')}
          className={
            'flex h-5 items-center gap-1 px-1 ' +
            (autoScroll ? 'text-accent' : 'text-ink-faint hover:text-ink')
          }
        >
          <ArrowDownToLine size={12} />
          <span className="font-mono text-[10px]">{t('console.autoScroll')}</span>
        </button>
        <button
          onClick={() => void copyVisible()}
          title={t('console.copy')}
          className="flex h-5 items-center gap-1 px-1 text-ink-faint hover:text-ink"
        >
          <Copy size={12} />
          <span className="font-mono text-[10px]">
            {copied ? t('console.copied') : t('console.copy')}
          </span>
        </button>
        <button
          onClick={() => void window.plucker.revealLog()}
          title={t('console.reveal')}
          className="flex h-5 items-center px-1 text-ink-faint hover:text-ink"
        >
          <FolderOpen size={12} />
        </button>
        <button
          onClick={onClear}
          title={t('console.clear')}
          className="flex h-5 items-center px-1 text-ink-faint hover:text-ink"
        >
          <Trash2 size={12} />
        </button>
        {docked ? (
          <button
            onClick={onUndock}
            title={t('console.undock')}
            aria-label={t('console.undock')}
            className="flex h-5 items-center px-1 text-ink-faint hover:text-ink"
          >
            <PictureInPicture2 size={13} />
          </button>
        ) : (
          <>
            <button
              onClick={onToggleAlwaysOnTop}
              aria-pressed={alwaysOnTop}
              title={t('console.pin')}
              aria-label={t('console.pin')}
              className={
                'flex h-5 items-center px-1 ' +
                (alwaysOnTop ? 'text-accent' : 'text-ink-faint hover:text-ink')
              }
            >
              <Pin size={13} />
            </button>
            <button
              onClick={onDock}
              title={t('console.dock')}
              aria-label={t('console.dock')}
              className="flex h-5 items-center px-1 text-ink-faint hover:text-ink"
            >
              <PictureInPicture size={13} />
            </button>
          </>
        )}
        {docked && onClose && (
          <button
            onClick={onClose}
            aria-label={t('console.toggle')}
            className="flex h-5 items-center px-1 text-ink-faint hover:text-ink"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line2 px-3 py-1.5">
        <div className="flex items-center gap-1">
          {LEVELS.map((lvl) =>
            chip(lvl, !levelsOff.has(lvl), LEVEL_COLOR[lvl], () =>
              toggle(levelsOff, lvl, setLevelsOff)
            )
          )}
        </div>
        {scopes.length > 0 && <span className="h-3 w-px bg-line2" />}
        <div className="flex flex-wrap items-center gap-1">
          {scopes.map((sc) =>
            chip(sc, !scopesOff.has(sc), 'text-accent', () => toggle(scopesOff, sc, setScopesOff))
          )}
        </div>
      </div>

      {/* log lines */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed"
      >
        {filtered.length === 0 ? (
          <div className="text-ink-faint">{t('console.empty')}</div>
        ) : (
          filtered.map((e, i) => (
            <div
              key={i}
              className="flex gap-2 break-all"
              onContextMenu={(ev) => {
                ev.preventDefault()
                const fmt = (x: LogEntry): string =>
                  `${formatTime(x.time)} [${x.level}] [${x.scope}] ${x.message}`
                void showContextMenu(
                  consoleLineMenuItems({ t, line: fmt(e), allText: filtered.map(fmt).join('\n') })
                )
              }}
            >
              <span className="shrink-0 text-ink-faint">{formatTime(e.time)}</span>
              <span className="shrink-0 text-ink-faint">[{e.scope}]</span>
              <span className="min-w-0 whitespace-pre-wrap">
                <LogMessage message={e.message} level={e.level} args={e.args} />
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
