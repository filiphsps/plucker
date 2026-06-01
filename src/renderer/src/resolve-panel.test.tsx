import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import './i18n'
import { ResolvePanel } from './resolve-panel'
import type { LogEntry } from '../../shared/types'

const entry = (level: LogEntry['level'], scope: string, message: string): LogEntry => ({
  time: 0,
  level,
  scope,
  message
})

describe('ResolvePanel', () => {
  it('shows a skeleton (no log lines) when nothing has streamed in', () => {
    const html = renderToStaticMarkup(<ResolvePanel entries={[]} />)
    expect(html).toContain('animate-pulse')
    expect(html).toContain('Starting download')
  })

  it('renders the live log lines from the shared stream', () => {
    const html = renderToStaticMarkup(
      <ResolvePanel
        entries={[
          entry('info', 'app', 'job start: https://yt/x'),
          entry('debug', 'yt-dlp', '[youtube:tab] Downloading page 1')
        ]}
      />
    )
    expect(html).toContain('job start: https://yt/x')
    expect(html).toContain('[youtube:tab] Downloading page 1')
    expect(html).not.toContain('animate-pulse')
  })

  it('switches to the error title when an error-level line is present', () => {
    const html = renderToStaticMarkup(
      <ResolvePanel entries={[entry('error', 'app', 'yt-dlp exited 1')]} />
    )
    expect(html).toContain('Couldn’t start download')
    expect(html).toContain('yt-dlp exited 1')
  })
})
