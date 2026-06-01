import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Tooltip } from './tooltip'

/**
 * A square icon button for the header's right-hand controls (settings, console, …).
 * Renders the shared active/inactive styling and wraps the trigger in a {@link Tooltip}
 * whose label doubles as the accessible name. Lives in the draggable header, so the
 * button opts out of the drag region.
 */
export function HeaderIconButton({
  icon: Icon,
  label,
  active = false,
  onClick,
  iconSize = 18,
  tooltipSide = 'bottom'
}: {
  icon: LucideIcon
  /** Accessible name and tooltip text. */
  label: string
  active?: boolean
  onClick?: () => void
  iconSize?: number
  tooltipSide?: 'top' | 'bottom'
}): React.JSX.Element {
  return (
    <Tooltip label={label} side={tooltipSide} className="no-drag">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={
          'no-drag flex h-8 w-8 items-center justify-center rounded-md transition-colors ' +
          (active ? 'bg-accent-dim text-accent' : 'text-ink-faint hover:bg-raise hover:text-ink')
        }
      >
        <Icon size={iconSize} />
      </button>
    </Tooltip>
  )
}
