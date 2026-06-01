import { describe, it, expect } from 'vitest'
import { destFolderFor, parseEntries, finalizePendingTracks } from './pipeline'
import type { TrackProgress } from '../shared/types'

const track = (over: Partial<TrackProgress>): TrackProgress => ({
  index: 1,
  title: 'T',
  videoId: 'v',
  status: 'queued',
  percent: 0,
  transformPercent: 0,
  ...over
})

describe('finalizePendingTracks', () => {
  it('fails tracks left mid-transform so the job can settle to idle', () => {
    const t = track({ status: 'transforming', stage: 'probing' })
    const rescued = finalizePendingTracks([t])
    expect(t.status).toBe('failed')
    expect(t.stage).toBeUndefined()
    expect(rescued).toEqual([t])
  })

  it('fails queued and downloading tracks too', () => {
    const tracks = [track({ status: 'queued' }), track({ status: 'downloading' })]
    finalizePendingTracks(tracks)
    expect(tracks.every((t) => t.status === 'failed')).toBe(true)
  })

  it('leaves terminal tracks untouched', () => {
    const tracks = [
      track({ status: 'done' }),
      track({ status: 'failed', reason: 'boom' }),
      track({ status: 'skipped' })
    ]
    const rescued = finalizePendingTracks(tracks)
    expect(rescued).toEqual([])
    expect(tracks.map((t) => t.status)).toEqual(['done', 'failed', 'skipped'])
  })

  it('preserves an existing failure reason', () => {
    const t = track({ status: 'downloading', reason: 'network' })
    finalizePendingTracks([t])
    expect(t.reason).toBe('network')
  })
})

describe('destFolderFor', () => {
  it('nests playlist title under base when perPlaylistSubfolder', () => {
    expect(destFolderFor('/base', 'My Playlist', true, 'playlist')).toBe('/base/My Playlist')
  })
  it('sanitizes the playlist folder name', () => {
    expect(destFolderFor('/base', 'A/B:C', true, 'playlist')).toBe('/base/ABC')
  })
  it('uses base directly for single videos', () => {
    expect(destFolderFor('/base', 'whatever', true, 'video')).toBe('/base')
  })
  it('uses base when subfolder disabled', () => {
    expect(destFolderFor('/base', 'My Playlist', false, 'playlist')).toBe('/base')
  })
})

describe('parseEntries', () => {
  it('lists all playlist entries with 1-based index', () => {
    const json = {
      _type: 'playlist',
      title: 'My List',
      entries: [
        { id: 'aaa', title: 'First' },
        { id: 'bbb', title: 'Second' }
      ]
    }
    const r = parseEntries(json)
    expect(r.kind).toBe('playlist')
    expect(r.title).toBe('My List')
    expect(r.entries).toEqual([
      { videoId: 'aaa', title: 'First', index: 1 },
      { videoId: 'bbb', title: 'Second', index: 2 }
    ])
  })
  it('treats a single video as one entry', () => {
    const json = { id: 'vid', title: 'Solo' }
    const r = parseEntries(json)
    expect(r.kind).toBe('video')
    expect(r.entries).toEqual([{ videoId: 'vid', title: 'Solo', index: 1 }])
  })
  it('captures the per-entry url for single-video downloads', () => {
    const json = {
      _type: 'playlist',
      title: 'My List',
      entries: [{ id: 'aaa', title: 'First', url: 'https://youtu.be/aaa' }]
    }
    expect(parseEntries(json).entries[0].url).toBe('https://youtu.be/aaa')
  })
})
