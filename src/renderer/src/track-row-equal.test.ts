import { describe, it, expect } from 'vitest'
import { trackRowPropsEqual } from './track-row-equal'
import type { TrackRowProps } from './track-row'

function props(overrides: Partial<TrackRowProps> = {}): TrackRowProps {
  return {
    variant: 'history',
    index: 1,
    track: { title: 'Stratus', status: 'done', file: '/a.mp3' },
    ...overrides
  }
}

describe('trackRowPropsEqual', () => {
  it('treats two distinct track objects with identical fields as equal', () => {
    const a = props({ track: { title: 'Stratus', status: 'done', file: '/a.mp3' } })
    const b = props({ track: { title: 'Stratus', status: 'done', file: '/a.mp3' } })
    expect(a.track).not.toBe(b.track)
    expect(trackRowPropsEqual(a, b)).toBe(true)
  })

  it('re-renders when a rendered track field changes', () => {
    const a = props({ track: { title: 'Stratus', status: 'downloading', percent: 10 } })
    const b = props({ track: { title: 'Stratus', status: 'downloading', percent: 90 } })
    expect(trackRowPropsEqual(a, b)).toBe(false)
  })

  it('re-renders when a flag changes', () => {
    expect(trackRowPropsEqual(props({ selected: false }), props({ selected: true }))).toBe(false)
    expect(trackRowPropsEqual(props({ missing: false }), props({ missing: true }))).toBe(false)
    expect(trackRowPropsEqual(props({ active: false }), props({ active: true }))).toBe(false)
    expect(trackRowPropsEqual(props({ editing: false }), props({ editing: true }))).toBe(false)
  })

  it('ignores handler identity but reacts to handler presence', () => {
    const withA = props({ onSelect: () => {} })
    const withB = props({ onSelect: () => {} })
    expect(trackRowPropsEqual(withA, withB)).toBe(true)
    expect(trackRowPropsEqual(props({ onSelect: undefined }), withA)).toBe(false)
  })

  it('ignores actions identity but reacts to actions presence', () => {
    const withA = props({ actions: 'x' })
    const withB = props({ actions: 'y' })
    expect(trackRowPropsEqual(withA, withB)).toBe(true)
    expect(trackRowPropsEqual(props({ actions: undefined }), withA)).toBe(false)
  })

  it('compares source by value, ignoring object identity', () => {
    const a = props({ source: { videoId: 'x', downloadedAt: '2020' } })
    const b = props({ source: { videoId: 'x', downloadedAt: '2020' } })
    expect(trackRowPropsEqual(a, b)).toBe(true)
    const c = props({ source: { videoId: 'y' } })
    expect(trackRowPropsEqual(a, c)).toBe(false)
  })

  it('re-renders when variant or index changes', () => {
    expect(trackRowPropsEqual(props({ index: 1 }), props({ index: 2 }))).toBe(false)
    expect(trackRowPropsEqual(props({ variant: 'history' }), props({ variant: 'cache' }))).toBe(
      false
    )
  })

  it('re-renders when meta reference changes', () => {
    const m = { tags: {}, audio: {} }
    expect(trackRowPropsEqual(props({ meta: m }), props({ meta: m }))).toBe(true)
    expect(trackRowPropsEqual(props({ meta: { tags: {}, audio: {} } }), props({ meta: m }))).toBe(
      false
    )
  })
})
