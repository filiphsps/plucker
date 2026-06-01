import React from 'react'
import { Tooltip } from '../tooltip'

export interface StripCell {
  label: string
  value: string
  /** Optional hover tooltip on the value (e.g. the full file path on the size cell). */
  tooltip?: React.ReactNode
}

/**
 * A full-width row of uniform label→value cells (the audio spec strip).
 * Cells are divided by thin rules; the first/last cells sit flush so the strip
 * aligns to the same horizontal margins as the rest of the panel.
 */
export function MetaStrip({ cells }: { cells: StripCell[] }): React.JSX.Element {
  return (
    <div className="flex">
      {cells.map((c) => {
        const value = (
          <div className="h-4 truncate font-mono text-[12.5px] leading-4 text-ink select-text">
            {c.value}
          </div>
        )
        return (
          <div
            key={c.label}
            className="min-w-0 flex-1 border-l border-line px-[14px] first:border-l-0 first:pl-0 last:pr-0"
          >
            <div className="mb-1 h-3 truncate font-mono text-[9px] uppercase leading-3 tracking-[1px] text-ink-faint select-none">
              {c.label}
            </div>
            {c.tooltip != null ? (
              <Tooltip label={c.tooltip} className="min-w-0 max-w-full">
                {value}
              </Tooltip>
            ) : (
              value
            )}
          </div>
        )
      })}
    </div>
  )
}
