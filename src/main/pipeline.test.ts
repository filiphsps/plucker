import { describe, it, expect } from 'vitest'
import {
  destFolderFor,
  parseEntries,
  finalizePendingTracks,
  isRelevantStatusLine,
  markCancelledTracks,
  toHistoryTracks,
  jobOutcome,
  classifyDownload
} from './pipeline'
import type { TrackProgress, HistoryTrack } from '../shared/types'

const tp = (index: number, status: TrackProgress['status']): TrackProgress => ({
  index,
  title: `Track ${index}`,
  status,
  percent: 0,
  transformPercent: 0
})

describe('classifyDownload', () => {
  const ok = { skipped: [], errors: [] }

  it('is done when a file was produced, regardless of stray skip/error noise', () => {
    expect(
      classifyDownload('/out/x.mp3', { skipped: [{ videoId: 'a' }], errors: [] }, 128)
    ).toEqual({ kind: 'done', file: '/out/x.mp3' })
  })

  it('is a below-minimum-quality skip only when a bitrate floor is configured', () => {
    const dl = { skipped: [{ videoId: 'a' }], errors: [] }
    expect(classifyDownload(null, dl, 128)).toEqual({
      kind: 'skipped',
      reason: 'below minimum quality'
    })
  })

  it('treats format-not-available as a real failure when NO floor is set', () => {
    // The reported x64 regression: healthy tracks mislabeled "below minimum quality".
    const dl = { skipped: [{ videoId: 'a' }], errors: [] }
    expect(classifyDownload(null, dl, null)).toEqual({
      kind: 'failed',
      reason: 'No downloadable audio format found'
    })
  })

  it('prefers yt-dlp’s own error message when one was captured', () => {
    const dl = { skipped: [], errors: [{ message: 'Video unavailable' }] }
    expect(classifyDownload(null, dl, 128)).toEqual({ kind: 'failed', reason: 'Video unavailable' })
  })

  it('falls back to a generic failure when there is no signal at all', () => {
    expect(classifyDownload(null, ok, 128)).toEqual({ kind: 'failed', reason: 'Download failed' })
  })
})

describe('markCancelledTracks', () => {
  it('relabels unfinished tracks as cancelled, leaving done/skipped intact', () => {
    const tracks = [tp(1, 'done'), tp(2, 'downloading'), tp(3, 'failed'), tp(4, 'skipped')]
    markCancelledTracks(tracks)
    expect(tracks.map((t) => t.status)).toEqual(['done', 'cancelled', 'cancelled', 'skipped'])
  })
})

describe('toHistoryTracks', () => {
  it('reuses the rich record for done tracks and records others minimally', () => {
    const tracks = [tp(1, 'done'), tp(2, 'failed')]
    tracks[1].reason = 'boom'
    tracks[1].videoId = 'vid2'
    const byIndex: (HistoryTrack | undefined)[] = [
      { status: 'done', file: '/m/1.mp3', title: 'One', hash: 'h1' },
      undefined
    ]
    expect(toHistoryTracks(tracks, byIndex)).toEqual([
      { status: 'done', file: '/m/1.mp3', title: 'One', hash: 'h1' },
      { title: 'Track 2', status: 'failed', reason: 'boom', videoId: 'vid2' }
    ])
  })
})

describe('jobOutcome', () => {
  const ht = (status: HistoryTrack['status']): HistoryTrack => ({ title: 's', status })
  it('is cancelled when aborted regardless of track states', () => {
    expect(jobOutcome([ht('done'), ht('failed')], true)).toBe('cancelled')
  })
  it('is completed when nothing failed (done and/or skipped)', () => {
    expect(jobOutcome([ht('done'), ht('skipped')], false)).toBe('completed')
  })
  it('is failed when nothing succeeded', () => {
    expect(jobOutcome([ht('failed'), ht('failed')], false)).toBe('failed')
  })
  it('is partial when some succeeded and some failed', () => {
    expect(jobOutcome([ht('done'), ht('failed')], false)).toBe('partial')
  })
})

describe('isRelevantStatusLine', () => {
  it('keeps extraction/progress lines', () => {
    expect(isRelevantStatusLine('[youtube:tab] Downloading page 1')).toBe(true)
    expect(isRelevantStatusLine('[download] Downloading playlist: My Mix')).toBe(true)
  })
  it('drops the verbose [debug] environment dump', () => {
    expect(isRelevantStatusLine('[debug] yt-dlp version 2025.01.01')).toBe(false)
    expect(isRelevantStatusLine('[debug] Proxy map: {}')).toBe(false)
  })
  it('drops empty / whitespace-only lines', () => {
    expect(isRelevantStatusLine('')).toBe(false)
    expect(isRelevantStatusLine('   ')).toBe(false)
  })
})

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
