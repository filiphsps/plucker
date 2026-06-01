import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'

type Side = 'top' | 'bottom'

// --- Single-tooltip coordination -------------------------------------------
// A global context tracks the one tooltip allowed to be visible. Opening any
// tooltip sets it as active, which makes every other tooltip read `open` as
// false — so no matter how hover/focus events race, at most one shows at once.

type TooltipController = {
  activeId: string | null
  open: (id: string) => void
  close: (id: string) => void
}

const TooltipContext = createContext<TooltipController | null>(null)

export function TooltipProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [activeId, setActiveId] = useState<string | null>(null)
  const open = useCallback((id: string) => setActiveId(id), [])
  const close = useCallback((id: string) => setActiveId((cur) => (cur === id ? null : cur)), [])
  const value = useMemo<TooltipController>(
    () => ({ activeId, open, close }),
    [activeId, open, close]
  )
  return <TooltipContext.Provider value={value}>{children}</TooltipContext.Provider>
}

/**
 * Open/close state for a single tooltip. Coordinates through the global
 * provider when present (guaranteeing one-at-a-time), and falls back to local
 * state when rendered standalone (e.g. in isolation / tests).
 */
function useTooltipState(id: string): { open: boolean; show: () => void; hide: () => void } {
  const ctx = useContext(TooltipContext)
  const [localOpen, setLocalOpen] = useState(false)
  const show = useCallback(() => (ctx ? ctx.open(id) : setLocalOpen(true)), [ctx, id])
  const hide = useCallback(() => (ctx ? ctx.close(id) : setLocalOpen(false)), [ctx, id])
  const open = ctx ? ctx.activeId === id : localOpen
  return { open, show, hide }
}

const MARGIN = 8 // min gap from the window edge
const GAP = 6 // gap between trigger and label

/** Place the label box so it stays fully inside the window, flipping side if needed. */
function clampIntoView(
  trigger: DOMRect,
  tip: { width: number; height: number },
  side: Side
): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const left = Math.max(
    MARGIN,
    Math.min(trigger.left + trigger.width / 2 - tip.width / 2, vw - tip.width - MARGIN)
  )
  const above = trigger.top - tip.height - GAP
  const below = trigger.bottom + GAP
  // Prefer the requested side; flip to the other if it would overflow the window.
  let top = side === 'top' ? above : below
  if (side === 'top' && top < MARGIN) top = below
  if (side === 'bottom' && top + tip.height > vh - MARGIN) top = above
  top = Math.max(MARGIN, Math.min(top, vh - tip.height - MARGIN))
  return { left, top }
}

/**
 * A small hover/focus popup label. Wrap any trigger element; the label appears
 * on hover or keyboard focus. Reusable across the app for terse contextual text.
 *
 * The label is rendered in a portal with fixed positioning derived from the
 * trigger's bounding rect, so it floats above other content and is never
 * clipped by scroll containers or stacking contexts. Its position is clamped
 * into the window so it can never be cut off by the window edge.
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
  const tipRef = useRef<HTMLSpanElement>(null)
  const id = useId()
  const { open, show, hide } = useTooltipState(id)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const measure = useCallback((): void => {
    const el = ref.current
    if (el) setRect(el.getBoundingClientRect())
  }, [])

  // Measure the rendered label and clamp it into the window, positioning the
  // DOM node imperatively. Runs before paint so the label never flashes at an
  // unclamped position (the node renders hidden, then is revealed here).
  useLayoutEffect(() => {
    const tip = tipRef.current
    if (!open || !rect || !tip) return
    const { left, top } = clampIntoView(
      rect,
      { width: tip.offsetWidth, height: tip.offsetHeight },
      side
    )
    tip.style.left = `${left}px`
    tip.style.top = `${top}px`
    tip.style.visibility = 'visible'
  }, [open, rect, side, label])

  // While open, follow scroll/resize so the label tracks its trigger.
  useEffect(() => {
    if (!open) return
    const onMove = (): void => measure()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, measure])

  // If this tooltip unmounts while open (e.g. its page freezes), release it.
  useEffect(() => {
    if (!open) return
    return () => hide()
  }, [open, hide])

  const showNow = useCallback((): void => {
    measure()
    show()
  }, [measure, show])

  return (
    <span
      ref={ref}
      className={'relative inline-flex ' + (className ?? '')}
      onPointerEnter={showNow}
      onPointerLeave={hide}
      onFocus={showNow}
      onBlur={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open &&
        label != null &&
        createPortal(
          <span
            ref={tipRef}
            role="tooltip"
            id={id}
            // Rendered hidden at the origin; the layout effect measures, clamps
            // into the window, and reveals it before paint.
            style={{ position: 'fixed', left: 0, top: 0, visibility: 'hidden' }}
            className="pointer-events-none z-[9999] whitespace-nowrap rounded-md border border-line bg-raise px-2 py-1 font-mono text-[10.5px] leading-none text-ink shadow-[0_6px_20px_rgba(0,0,0,0.45)]"
          >
            {label}
          </span>,
          document.body
        )}
    </span>
  )
}
