import React from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Presentational dropdown of past URLs shown under the command bar. Open state,
 * filtering, highlight, and keyboard handling live in the parent (download-view);
 * this component only renders the given `items` and reports clicks.
 */
export function UrlSuggestions({
  items,
  highlightedIndex,
  onSelect,
  onDelete,
  onHighlight
}: {
  /** Already-filtered URLs, most-recent-first. */
  items: string[]
  /** Index of the keyboard-highlighted row, or -1 for none. */
  highlightedIndex: number
  onSelect: (url: string) => void
  onDelete: (url: string) => void
  onHighlight: (index: number) => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  if (items.length === 0) return null

  return (
    <ul
      role="listbox"
      className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-64 overflow-auto rounded-[7px] border border-line bg-panel py-1 shadow-lg shadow-black/40"
    >
      {items.map((url, i) => (
        <li key={url} role="option" aria-selected={i === highlightedIndex}>
          <div
            onMouseDown={(e) => {
              // Prevent the input's blur from firing before the click is handled.
              e.preventDefault()
              onSelect(url)
            }}
            onMouseEnter={() => onHighlight(i)}
            className={
              'group flex cursor-pointer items-center gap-2 px-3 py-1.5 ' +
              (i === highlightedIndex ? 'bg-raise' : '')
            }
          >
            <span className="flex-1 truncate font-mono text-[12px] text-ink">{url}</span>
            <button
              type="button"
              aria-label={t('download.history.delete')}
              title={t('download.history.delete')}
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDelete(url)
              }}
              className="shrink-0 rounded p-0.5 text-ink-faint opacity-0 transition-colors hover:bg-line hover:text-ink group-hover:opacity-100"
            >
              <X size={13} />
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
