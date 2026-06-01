import { describe, it, expect } from 'vitest'
import { destFolderFor, parseEntries } from './pipeline'

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
