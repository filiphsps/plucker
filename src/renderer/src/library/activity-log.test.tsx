import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { ActivityLog } from './activity-log'
import type { ActivityEvent } from '../../../shared/library'

const events: ActivityEvent[] = [
  { id: 'a1', type: 'ingested', ts: '2026-06-02T10:00:00.000Z', summary: 'Downloaded “Mix” (3 tracks)' },
  { id: 'a2', type: 'deleted', ts: '2026-06-02T11:00:00.000Z', summary: 'Deleted track “Song A”' }
]

describe('ActivityLog', () => {
  it('renders each event summary, most recent first', () => {
    const html = renderToStaticMarkup(<ActivityLog events={events} />)
    expect(html).toContain('Downloaded “Mix” (3 tracks)')
    expect(html).toContain('Deleted track “Song A”')
  })

  it('shows an empty state with no events', () => {
    const html = renderToStaticMarkup(<ActivityLog events={[]} />)
    expect(html.toLowerCase()).toContain('no activity')
  })
})
