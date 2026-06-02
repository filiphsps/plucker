import { describe, it, expect } from 'vitest'
import { classifySource } from './channel-classifier'

describe('classifySource', () => {
  it('detects Topic channels by uploader suffix', () => {
    expect(classifySource({ uploader: 'Daft Punk - Topic' })).toBe('topic')
  })
  it('detects Topic by the "Provided to YouTube by" description marker', () => {
    expect(
      classifySource({ channel: 'Daft Punk', description: 'Provided to YouTube by Columbia' })
    ).toBe('topic')
  })
  it('detects VEVO channels', () => {
    expect(classifySource({ channel: 'TaylorSwiftVEVO' })).toBe('vevo')
  })
  it('detects record-label channels by name suffix', () => {
    expect(classifySource({ channel: 'Mad Decent Records' })).toBe('label')
    expect(classifySource({ uploader: 'Spinnin Recordings' })).toBe('label')
  })
  it('detects an official artist channel when channel ~= structured artist', () => {
    expect(classifySource({ channel: 'The Weeknd', artist: 'The Weeknd' })).toBe('official-artist')
  })
  it('falls back to generic', () => {
    expect(classifySource({ channel: 'Random Uploads 2009', uploader: 'xX_dj_Xx' })).toBe('generic')
  })
})
