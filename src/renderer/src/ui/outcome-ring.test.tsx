import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { HistoryTrack } from '../../../shared/types'
import { OutcomeRing } from './outcome-ring'
import { countByStatus } from './outcome-ring-utils'

const track = (status: HistoryTrack['status']): HistoryTrack => ({ title: 't', status })

describe('countByStatus', () => {
  it('tallies every terminal status', () => {
    const counts = countByStatus([track('done'), track('done'), track('failed'), track('skipped')])
    expect(counts).toEqual({ done: 2, failed: 1, skipped: 1, cancelled: 0 })
  })
})

describe('OutcomeRing', () => {
  it('centers the total track count', () => {
    const html = renderToStaticMarkup(<OutcomeRing tracks={[track('done'), track('failed')]} />)
    expect(html).toContain('>2<')
  })

  it('draws one round-capped arc when every track shares an outcome', () => {
    const html = renderToStaticMarkup(<OutcomeRing tracks={[track('done'), track('done')]} />)
    // Track ring + a single full-circle done arc.
    expect(html.match(/<circle/g)).toHaveLength(2)
    expect(html).toContain('stroke-linecap="round"')
    expect(html).toContain('var(--color-ok)')
  })

  it('splits proportional butt-capped arcs across mixed outcomes', () => {
    const html = renderToStaticMarkup(
      <OutcomeRing tracks={[track('done'), track('done'), track('done'), track('failed')]} />
    )
    // Track ring + done arc + failed arc.
    expect(html.match(/<circle/g)).toHaveLength(3)
    expect(html).toContain('stroke-linecap="butt"')
    expect(html).toContain('var(--color-ok)')
    expect(html).toContain('var(--color-bad)')
    // done = 75% starting at offset 0, failed = 25% starting after it.
    expect(html).toContain('stroke-dasharray="75 25"')
    expect(html).toContain('stroke-dashoffset="-75"')
  })
})
