import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Logo } from './logo'

describe('Logo', () => {
  it('renders the full wordmark', () => {
    const html = renderToStaticMarkup(<Logo />)
    // The accent "L" is split into its own span, so assert around it.
    expect(html).toContain('>P<')
    expect(html).toContain('>L<')
    expect(html).toContain('UCKER')
  })

  it('colors the accent "L" with the given accent', () => {
    const html = renderToStaticMarkup(<Logo accent="#0a84ff" />)
    expect(html).toMatch(/color:#0a84ff[^"]*">L</)
  })

  it('applies overrides used by the icon build', () => {
    const html = renderToStaticMarkup(<Logo color="#ffffff" fontSize={760} fontWeight={700} />)
    expect(html).toContain('color:#ffffff')
    expect(html).toContain('font-size:760px')
    expect(html).toContain('font-weight:700')
  })
})
