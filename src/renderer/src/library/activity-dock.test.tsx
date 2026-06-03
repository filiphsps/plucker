import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { ActivityDock } from './activity-dock'
import type { ActivityEvent } from '../../../shared/library'

// The service returns events most-recent-first, so events[0] is the latest.
const events: ActivityEvent[] = [
  { id: 'a2', type: 'edited', ts: '2026-06-02T11:00:00.000Z', summary: 'Edited Song A' },
  {
    id: 'a1',
    type: 'ingested',
    ts: '2026-06-02T10:00:00.000Z',
    summary: 'Downloaded Mix (3 tracks)'
  }
]

describe('ActivityDock', () => {
  it('collapsed: shows the most recent summary (events[0])', () => {
    const html = renderToStaticMarkup(<ActivityDock events={events} />)
    expect(html).toContain('Edited Song A')
  })
  it('empty: shows a no-activity hint', () => {
    const html = renderToStaticMarkup(<ActivityDock events={[]} />)
    expect(html.toLowerCase()).toContain('no activity')
  })
})
