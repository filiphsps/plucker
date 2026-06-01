import { describe, it, expect } from 'vitest'
import { destFolderFor, mergeTags } from './pipeline'
import { DEFAULT_SETTINGS } from '../shared/defaults'

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

describe('mergeTags (youtube primary, musicbrainz enrich)', () => {
  const yt = { artist: 'YT Artist', title: 'YT Title' }
  const mb = { artist: 'MB Artist', title: 'MB Title', album: 'MB Album', year: '1999', genre: 'Rock' }
  it('keeps YouTube values, fills gaps from MusicBrainz', () => {
    const merged = mergeTags(yt, mb, DEFAULT_SETTINGS)
    expect(merged.artist).toBe('YT Artist')   // YT wins
    expect(merged.title).toBe('YT Title')      // YT wins
    expect(merged.album).toBe('MB Album')      // gap filled
    expect(merged.year).toBe('1999')           // gap filled
    expect(merged.genre).toBe('Rock')          // gap filled
  })
  it('inverts precedence when primarySource is musicbrainz', () => {
    const s = { ...DEFAULT_SETTINGS, tagging: { ...DEFAULT_SETTINGS.tagging, primarySource: 'musicbrainz' as const } }
    const merged = mergeTags(yt, mb, s)
    expect(merged.artist).toBe('MB Artist')
  })
})
