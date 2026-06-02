import React from 'react'
import type { LucideIcon } from 'lucide-react'

/** A settings rack panel: bordered card with a mono uppercase header + icon. */
export function Panel({
  icon: Icon,
  title,
  aside,
  children
}: {
  icon: LucideIcon
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="mb-3.5 overflow-hidden rounded-[10px] border border-line bg-panel2">
      <header className="flex items-center gap-2 border-b border-line bg-panel px-3.5 py-2.5 font-mono text-[10px] uppercase tracking-[1.5px] text-ink-faint">
        <Icon size={13} />
        {title}
        {aside && <span className="ml-auto normal-case tracking-normal">{aside}</span>}
      </header>
      {children}
    </section>
  )
}

/** A `label + description ⟶ control` row inside a Panel. */
export function PanelRow({
  name,
  desc,
  children
}: {
  name: string
  desc?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-4 border-b border-line2 px-3.5 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-ink">{name}</div>
        {desc && <div className="mt-0.5 text-[11.5px] text-ink-faint">{desc}</div>}
      </div>
      {children}
    </div>
  )
}
