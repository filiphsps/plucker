import React from 'react'

/**
 * A keycap chip for inline keyboard-shortcut hints (e.g. ⌘J). Sized to sit inside body
 * copy without disturbing the line. Children are the already-formatted shortcut text —
 * use `formatShortcut` to produce platform-correct glyphs.
 */
export function Kbd({ children }: { children?: React.ReactNode }): React.JSX.Element {
  return (
    <kbd className="mx-0.5 inline-flex items-center rounded border border-line bg-raise px-1 py-px font-mono text-[10.5px] leading-none text-ink-dim">
      {children}
    </kbd>
  )
}
