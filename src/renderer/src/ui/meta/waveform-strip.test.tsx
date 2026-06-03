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

  it('renders a playhead at the given progress, and none without it', () => {
    expect(renderToStaticMarkup(<WaveformStrip peaks={peaks} progress={0.5} />)).toContain(
      'data-playhead'
    )
    expect(renderToStaticMarkup(<WaveformStrip peaks={peaks} />)).not.toContain('data-playhead')
  })

  it('marks the strip as seekable (cursor affordance) only when onSeek is given', () => {
    expect(renderToStaticMarkup(<WaveformStrip peaks={peaks} onSeek={() => {}} />)).toContain(
      'cursor-pointer'
    )
    expect(renderToStaticMarkup(<WaveformStrip peaks={peaks} />)).not.toContain('cursor-pointer')
  })
})
