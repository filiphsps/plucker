import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import './i18n'
import { JobRail } from './job-rail'
import type { JobMeta } from '../../shared/types'

const meta = (jobId: string, state: JobMeta['state']): JobMeta => ({
  jobId,
  title: `Job ${jobId}`,
  kind: 'download',
  state
})

describe('JobRail', () => {
  it('lists every job plus a New entry, with state labels and progress widths', () => {
    const html = renderToStaticMarkup(
      <JobRail
        jobs={[
          { meta: meta('A', 'running'), overall: 0.6 },
          { meta: meta('B', 'paused'), overall: 0.3 },
          { meta: meta('C', 'queued'), overall: 0 }
        ]}
        selectedJobId="A"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
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

  it('marks the selected job row with the accent background', () => {
    const html = renderToStaticMarkup(
      <JobRail
        jobs={[{ meta: meta('A', 'running'), overall: 0.5 }]}
        selectedJobId="A"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(html).toContain('bg-accent/15')
  })
})
