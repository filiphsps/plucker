import { describe, it, expect } from 'vitest'
import { selectBestMatch } from './mb-select'

const json = {
  recordings: [
    {
      id: 'rec-low',
      score: 50,
      title: 'Low',
      'artist-credit': [{ artist: { name: 'X' } }],
      releases: [{ id: 'r1', title: 'Single', 'release-group': { 'primary-type': 'Single' } }]
    },
    {
      id: 'rec-hi',
      score: 95,
      title: 'Da Funk',
      'artist-credit': [{ artist: { name: 'Daft Punk' } }],
      releases: [
        {
          id: 'r-single',
          title: 'Da Funk',
          date: '1995',
          'release-group': { 'primary-type': 'Single', id: 'rg-s' }
        },
        {
          id: 'r-album',
          title: 'Homework',
          date: '1997-01-20',
          'release-group': { 'primary-type': 'Album', id: 'rg-a' }
        }
      ]
    }
  ]
}

describe('selectBestMatch', () => {
  it('returns null when no recording meets minScore', () => {
    expect(selectBestMatch(json, 99)).toBeNull()
  })
  it('picks highest-scoring recording and prefers an Album release', () => {
    const m = selectBestMatch(json, 80)
    expect(m).not.toBeNull()
    expect(m!.recordingId).toBe('rec-hi')
    expect(m!.artist).toBe('Daft Punk')
    expect(m!.title).toBe('Da Funk')
    expect(m!.album).toBe('Homework')
    expect(m!.releaseId).toBe('r-album')
    expect(m!.releaseGroupId).toBe('rg-a')
    expect(m!.year).toBe('1997')
  })
  it('falls back to first release when no album exists', () => {
    const onlySingle = {
      recordings: [
        {
          id: 'r',
          score: 90,
          title: 'T',
          'artist-credit': [{ artist: { name: 'A' } }],
          releases: [
            {
              id: 'r1',
              title: 'S',
              date: '2000',
              'release-group': { 'primary-type': 'Single', id: 'g1' }
            }
          ]
        }
      ]
    }
    const m = selectBestMatch(onlySingle, 80)
    expect(m!.releaseId).toBe('r1')
    expect(m!.year).toBe('2000')
  })
  it('returns null on empty/garbage input', () => {
    expect(selectBestMatch({}, 80)).toBeNull()
    expect(selectBestMatch({ recordings: [] }, 80)).toBeNull()
  })
})
