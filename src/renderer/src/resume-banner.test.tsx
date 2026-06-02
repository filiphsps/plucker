import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import './i18n'
import { ResumeBanner, type InterruptedJob } from './resume-banner'

const jobs: InterruptedJob[] = [{ jobId: 'j1', title: 'My Mix', done: 12, total: 40 }]

describe('ResumeBanner', () => {
  it('renders the first interrupted job with its progress', () => {
    const html = renderToStaticMarkup(
      <ResumeBanner jobs={jobs} onResume={() => {}} onDismiss={() => {}} />
    )
    expect(html).toContain('My Mix')
    expect(html).toContain('12')
    expect(html).toContain('40')
    // Resume + dismiss controls are present.
    expect(html).toContain('Resume')
    expect(html).toContain('Dismiss')
  })

  it('renders nothing when there are no interrupted jobs', () => {
    const html = renderToStaticMarkup(
      <ResumeBanner jobs={[]} onResume={() => {}} onDismiss={() => {}} />
    )
    expect(html).toBe('')
  })
})
