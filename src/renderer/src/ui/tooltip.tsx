import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Side = 'top' | 'bottom'

/**
 * A small hover/focus popup label. Wrap any trigger element; the label appears
 * on hover or keyboard focus. Reusable across the app for terse contextual text.
 *
 * The label is rendered in a portal with fixed positioning derived from the
 * trigger's bounding rect, so it always floats above other content and is never
 * clipped by scroll containers or stacking contexts.
 */
export function Tooltip({
  label,
  side = 'top',
  children,
  className
}: {
  label: React.ReactNode
  side?: Side
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const id = useId()
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const place = useCallback((): void => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ top: side === 'top' ? r.top : r.bottom, left: r.left + r.width / 2 })
  }, [side])

  const open = pos !== null

  // While open, follow scroll/resize so the label tracks its trigger.
  useEffect(() => {
    if (!open) return
    const onMove = (): void => place()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, place])

  return (
    <span
      ref={ref}
      className={'relative inline-flex ' + (className ?? '')}
      onPointerEnter={place}
      onPointerLeave={() => setPos(null)}
      onFocus={place}
      onBlur={() => setPos(null)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open &&
        label != null &&
        createPortal(
          <span
            role="tooltip"
            id={id}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transform:
                side === 'top' ? 'translate(-50%, calc(-100% - 6px))' : 'translate(-50%, 6px)'
            }}
            className="pointer-events-none z-[9999] whitespace-nowrap rounded-md border border-line bg-raise px-2 py-1 font-mono text-[10.5px] leading-none text-ink shadow-[0_6px_20px_rgba(0,0,0,0.45)]"
          >
            {label}
          </span>,
          document.body
        )}
    </span>
  )
}
