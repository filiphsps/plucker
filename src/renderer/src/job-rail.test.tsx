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

const render = (props: Partial<Parameters<typeof JobRail>[0]> = {}): string =>
  renderToStaticMarkup(
    <JobRail
      jobs={[]}
      selectedJobId={null}
      pendingCount={0}
      onSelect={vi.fn()}
      onClose={vi.fn()}
      onStartAll={vi.fn()}
      {...props}
    />
  )

describe('JobRail', () => {
  it('lists every job plus a New entry, with state labels and progress widths', () => {
    const html = render({
      jobs: [item('A', 'running', 0.6), item('B', 'paused', 0.3), item('C', 'queued')],
      selectedJobId: 'A'
    })
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
    expect(render({ jobs: [item('A', 'done', 1)] })).toContain('Done')
  })

  it('labels pending jobs as Not started', () => {
    expect(render({ jobs: [item('A', 'pending')], pendingCount: 1 })).toContain('Not started')
  })

  it('marks the selected job row with the accent background', () => {
    expect(render({ jobs: [item('A', 'running', 0.5)], selectedJobId: 'A' })).toContain(
      'bg-accent/15'
    )
  })

  it('hides the Start all button when nothing is pending', () => {
    const html = render({ jobs: [item('A', 'running')], pendingCount: 0 })
    expect(html).not.toContain('Start')
  })

  it('shows a Start all button counting the pending jobs', () => {
    const html = render({ jobs: [item('A', 'pending'), item('B', 'pending')], pendingCount: 2 })
    expect(html).toContain('Start 2 jobs')
  })
})
