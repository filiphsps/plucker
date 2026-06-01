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

  it('keeps the detail grid collapsed until expanded, and exposes an expand control', () => {
    const html = renderToStaticMarkup(
      <TrackRow
        variant="download"
        index={1}
        track={{ title: 'Avril 14th', status: 'downloading', percent: 64 }}
        detail={{ Source: 'youtube.com/watch?v=x' }}
      />
    )
    // collapsed by default → detail value not rendered yet
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
})
