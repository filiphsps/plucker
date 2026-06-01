import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SlidersHorizontal } from 'lucide-react'
import { HeaderIconButton } from './header-icon-button'

describe('HeaderIconButton', () => {
  it('uses the label as the accessible name', () => {
    const html = renderToStaticMarkup(
      <HeaderIconButton icon={SlidersHorizontal} label="Settings" />
    )
    expect(html).toContain('aria-label="Settings"')
  })

  it('shows the accent styling only when active', () => {
    const off = renderToStaticMarkup(<HeaderIconButton icon={SlidersHorizontal} label="Settings" />)
    expect(off).toContain('text-ink-faint')
    expect(off).not.toContain('text-accent')

    const on = renderToStaticMarkup(
      <HeaderIconButton icon={SlidersHorizontal} label="Settings" active />
    )
    expect(on).toContain('bg-accent-dim')
    expect(on).toContain('text-accent')
  })
})
