import React from 'react'
import { ExternalLink } from 'lucide-react'

const LABEL =
  'mb-1 h-3 truncate font-mono text-[9px] uppercase leading-3 tracking-[1px] text-ink-faint select-none'
const VALUE = 'h-4 truncate font-mono text-[12px] leading-4 text-ink select-text'

/** A single label→value metadata field. Label is unselectable; value is copyable. */
export function MetaField({
  label,
  value,
  className
}: {
  label: string
  value?: string
  className?: string
}): React.JSX.Element {
  return (
    <div className={'min-w-0 ' + (className ?? '')}>
      <div className={LABEL}>{label}</div>
      <div className={VALUE}>{value || '—'}</div>
    </div>
  )
}

/** A metadata field whose value is a link that opens in the system browser. */
export function MetaLink({
  label,
  href,
  display,
  onOpen,
  className
}: {
  label: string
  href: string
  display?: string
  onOpen: (url: string) => void
  className?: string
}): React.JSX.Element {
  return (
    <div className={'min-w-0 ' + (className ?? '')}>
      <div className={LABEL}>{label}</div>
      <a
        href={href}
        title={href}
        onClick={(e) => {
          e.preventDefault()
          onOpen(href)
        }}
        className="flex h-4 max-w-full cursor-pointer items-center gap-1 font-mono text-[12px] leading-4 text-accent no-underline"
      >
        <span className="min-w-0 truncate select-text hover:underline">{display ?? href}</span>
        <ExternalLink size={11} className="shrink-0 opacity-70" />
      </a>
    </div>
  )
}
