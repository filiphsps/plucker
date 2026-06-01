import React from 'react'

export interface StripCell {
  label: string
  value: string
}

/** A segmented, full-width strip of uniform label→value cells (the audio spec strip). */
export function MetaStrip({ cells }: { cells: StripCell[] }): React.JSX.Element {
  return (
    <div className="flex gap-px overflow-hidden rounded-[7px] border border-line bg-line">
      {cells.map((c) => (
        <div key={c.label} className="flex-1 bg-panel px-3 py-2">
          <div className="mb-0.5 h-3 truncate font-mono text-[9px] uppercase leading-3 tracking-[1px] text-ink-faint select-none">
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
