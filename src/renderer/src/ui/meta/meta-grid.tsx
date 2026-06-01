import React from 'react'

/** A dynamic N-column grid for label→value fields; children flow left→right, wrapping to new rows. */
export function MetaGrid({
  columns = 3,
  children
}: {
  columns?: number
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className="grid items-start gap-x-[18px] gap-y-[11px]"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  )
}
