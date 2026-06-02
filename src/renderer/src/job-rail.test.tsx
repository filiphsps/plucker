import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import './i18n'
import { JobRail, type RailItem } from './job-rail'

const item = (jobId: string, state: RailItem['state'], overall = 0): RailItem => ({
  jobId,
  title: `Job ${jobId}`,
  overall,
  state,
  finished: state === 'done'
})

describe('JobRail', () => {
  it('lists every job plus a New entry, with state labels and progress widths', () => {
    const html = renderToStaticMarkup(
      <JobRail
        jobs={[item('A', 'running', 0.6), item('B', 'paused', 0.3), item('C', 'queued')]}
        selectedJobId="A"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('Job A')
    expect(html).toContain('Job B')
    expect(html).toContain('Job C')
    expect(html).toContain('New')
    expect(html).toContain('Running')
    expect(html).toContain('Queued')
    // overall 0.6 → 60% mini bar.
    expect(html).toContain('width:60%')
  })

  it('labels finished jobs as Done', () => {
    const html = renderToStaticMarkup(
      <JobRail
        jobs={[item('A', 'done', 1)]}
        selectedJobId={null}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('Done')
  })

  it('marks the selected job row with the accent background', () => {
    const html = renderToStaticMarkup(
      <JobRail
        jobs={[item('A', 'running', 0.5)]}
        selectedJobId="A"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('bg-accent/15')
  })
})
