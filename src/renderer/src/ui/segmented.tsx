import React from 'react'

export interface SegmentedOption<T extends string | number> {
  value: T
  label: string
}

/** A segmented control. The selected segment fills with the accent color. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (next: T) => void
}): React.JSX.Element {
  return (
    <div className="flex rounded-md border border-line bg-[#0a0b0e] p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={
            'rounded px-3 py-[5px] font-mono text-xs tnum transition-colors ' +
            (o.value === value ? 'bg-accent text-white' : 'text-ink-dim hover:text-ink')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
