import React from 'react'

export interface StripCell {
  label: string
  value: string
}

/**
 * A full-width row of uniform label→value cells (the audio spec strip).
 * Cells are divided by thin rules; the first/last cells sit flush so the strip
 * aligns to the same horizontal margins as the rest of the panel.
 */
export function MetaStrip({ cells }: { cells: StripCell[] }): React.JSX.Element {
  return (
    <div className="flex">
      {cells.map((c) => (
        <div
          key={c.label}
          className="min-w-0 flex-1 border-l border-line px-[14px] first:border-l-0 first:pl-0 last:pr-0"
        >
          <div className="mb-1 h-3 truncate font-mono text-[9px] uppercase leading-3 tracking-[1px] text-ink-faint select-none">
            {c.label}
          </div>
          <div className="h-4 truncate font-mono text-[12.5px] leading-4 text-ink select-text">
            {c.value}
          </div>
        </div>
      ))}
    </div>
  )
}
