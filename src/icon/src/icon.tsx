import React from 'react'
import { Logo } from '../../renderer/src/logo'

export interface IconTheme {
  id: string
  output: string
  bg: string
  fg: string
  accent: string
}

/**
 * The app icon: the Plucker wordmark blown up so `PLU…` dominates the square and
 * the rest of the wordmark bleeds off the right edge (clipped by `overflow:hidden`).
 * Rendered at the OS-icon size; the build script screenshots `#root`.
 */
export function Icon({ theme }: { theme: IconTheme }): React.JSX.Element {
  return (
    <div
      style={
        {
          content: '',
          width: 1024,
          height: 1024,
          background: theme.bg,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',

          '--color-accent': theme.accent,
          '--color-fg': theme.fg,
          '--color-bg': theme.bg,
          color: 'var(--color-fg)'
        } as React.CSSProperties
      }
    >
      <Logo
        color={theme.fg}
        accent={theme.accent}
        fontSize={864}
        letterSpacing="-4.5rem"
        fontWeight={800}
        style={{
          position: 'absolute',
          left: 'calc(50% - 255px)',
          textAlign: 'left',
          whiteSpace: 'nowrap'
        }}
      />
    </div>
  )
}
