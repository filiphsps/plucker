import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import './i18n'
import { ResolvePanel } from './resolve-panel'

describe('ResolvePanel', () => {
  it('shows a skeleton (no log lines) when no events have arrived', () => {
    const html = renderToStaticMarkup(<ResolvePanel events={[]} />)
    expect(html).toContain('animate-pulse')
    expect(html).toContain('Starting download')
  })

  it('renders a curated step and a raw yt-dlp line', () => {
    const html = renderToStaticMarkup(
      <ResolvePanel
        events={[
          { phase: 'resolving', key: 'launching' },
          { phase: 'resolving', line: '[youtube:tab] Downloading page 1' }
        ]}
      />
    )
    expect(html).toContain('Launched yt-dlp')
    expect(html).toContain('[youtube:tab] Downloading page 1')
    expect(html).not.toContain('animate-pulse')
  })

  it('renders the resolved count via pluralized i18n', () => {
    const html = renderToStaticMarkup(
      <ResolvePanel events={[{ phase: 'resolving', key: 'resolved', params: { count: 24 } }]} />
    )
    expect(html).toContain('Found 24 tracks')
  })

  it('surfaces an error event with the error title and message', () => {
    const html = renderToStaticMarkup(
      <ResolvePanel events={[{ phase: 'error', error: 'yt-dlp exited 1' }]} />
    )
    expect(html).toContain('Couldn’t start download')
    expect(html).toContain('yt-dlp exited 1')
  })
})
