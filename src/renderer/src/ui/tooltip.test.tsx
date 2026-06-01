import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Tooltip } from './tooltip'

describe('Tooltip', () => {
  it('renders its trigger child (label hidden until hover)', () => {
    const html = renderToStaticMarkup(
      <Tooltip label="Downloading">
        <span>64%</span>
      </Tooltip>
    )
    expect(html).toContain('64%')
    // label is not shown in the initial (un-hovered) render
    expect(html).not.toContain('Downloading')
  })
})
