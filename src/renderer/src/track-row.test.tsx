import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import './i18n'
import { TrackRow } from './track-row'

describe('TrackRow', () => {
  it('shows the percent status and title in the download variant', () => {
    const html = renderToStaticMarkup(
      <TrackRow
        variant="download"
        index={1}
        track={{ title: 'Avril 14th', artist: 'Aphex Twin', status: 'downloading', percent: 64 }}
      />
    )
    expect(html).toContain('64%')
    expect(html).toContain('Avril 14th')
  })

  it('keeps the detail panel collapsed until expanded, and exposes an expand control', () => {
    const html = renderToStaticMarkup(
      <TrackRow
        variant="download"
        index={1}
        track={{ title: 'Avril 14th', status: 'downloading', percent: 64 }}
        source={{ videoId: 'x' }}
      />
    )
    // collapsed by default → detail panel (and source url) not rendered yet
    expect(html).not.toContain('youtube.com/watch?v=x')
    expect(html).toContain('aria-label="expand"')
  })

  it('renders duration in the history variant', () => {
    const html = renderToStaticMarkup(
      <TrackRow variant="history" index={2} track={{ title: 'Stratus', duration: '9:49' }} />
    )
    expect(html).toContain('9:49')
    expect(html).toContain('Stratus')
  })

  it('shows a missing badge and warning subtitle when the file is gone', () => {
    const html = renderToStaticMarkup(
      <TrackRow
        variant="history"
        index={3}
        track={{ title: 'Lost Track', file: '/gone/lost.mp3' }}
        missing
      />
    )
    expect(html).toContain('MISSING')
    expect(html).toContain('File missing')
  })

  it('applies the accent highlight when selected', () => {
    const plain = renderToStaticMarkup(
      <TrackRow variant="history" index={1} track={{ title: 'Stratus', file: '/a.mp3' }} />
    )
    const selected = renderToStaticMarkup(
      <TrackRow
        variant="history"
        index={1}
        track={{ title: 'Stratus', file: '/a.mp3' }}
        selected
        onSelect={() => {}}
      />
    )
    expect(plain).not.toContain('bg-accent-dim')
    expect(selected).toContain('bg-accent-dim')
  })

  it('does not render a waveform while the row is collapsed', () => {
    const html = renderToStaticMarkup(
      <TrackRow
        variant="history"
        index={1}
        track={{ title: 'Stratus', file: '/a.mp3', duration: '9:49' }}
      />
    )
    // Collapsed by default → TrackDetail (and its waveform) is not mounted.
    expect(html).not.toContain('data-wave-bar')
  })
})
