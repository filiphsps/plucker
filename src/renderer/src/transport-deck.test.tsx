import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import './i18n'
import { TransportDeck } from './transport-deck'
import type { JobProgress } from '../../shared/types'

const base: JobProgress = {
  jobTitle: 'Mix',
  total: 24,
  folder: '/tmp',
  url: 'u',
  overall: 0.5,
  tracks: [
    { index: 1, title: 'Avril 14th', status: 'downloading', percent: 64, artist: 'Aphex Twin' },
    { index: 2, title: 'Stratus', status: 'done' }
  ]
}

describe('TransportDeck', () => {
  it('shows the active (downloading) track title and the done/total counter', () => {
    const html = renderToStaticMarkup(<TransportDeck progress={base} onCancel={() => {}} />)
    expect(html).toContain('Avril 14th') // active downloading track
    expect(html).toContain('1/24') // 1 done of 24
  })

  it('renders a labelled cancel control', () => {
    const html = renderToStaticMarkup(<TransportDeck progress={base} onCancel={() => {}} />)
    expect(html).toContain('aria-label="Cancel"')
  })
})
