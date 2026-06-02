import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WaveformStrip } from './waveform-strip'

const peaks = Array.from({ length: 120 }, (_, i) => (i % 10) / 10)

describe('WaveformStrip', () => {
  it('renders one bar per peak', () => {
    const html = renderToStaticMarkup(<WaveformStrip peaks={peaks} />)
    expect(html.split('data-wave-bar').length - 1).toBe(120)
  })

  it('renders nothing when there are no peaks', () => {
    const html = renderToStaticMarkup(<WaveformStrip peaks={[]} />)
    expect(html).toBe('')
  })
})
