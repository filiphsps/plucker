import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from './button'

describe('Button', () => {
  it('renders a default (raise + line) button with its label', () => {
    const html = renderToStaticMarkup(<Button>Rename</Button>)
    expect(html).toContain('Rename')
    expect(html).toContain('bg-raise')
    expect(html).toContain('border-line')
    expect(html).not.toContain('bg-accent')
  })

  it('renders a flat-accent primary variant', () => {
    const html = renderToStaticMarkup(<Button variant="primary">Apply transforms</Button>)
    expect(html).toContain('Apply transforms')
    expect(html).toContain('bg-accent')
  })

  it('forwards native button props (disabled) and extra classes', () => {
    const html = renderToStaticMarkup(
      <Button disabled className="ml-2">
        Export
      </Button>
    )
    expect(html).toContain('disabled')
    expect(html).toContain('ml-2')
  })
})
