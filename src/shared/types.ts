export type CookieSource = 'auto' | 'none' | 'chrome' | 'edge' | 'safari' | 'firefox' | 'brave'

export type Bitrate = 320 | 256 | 192 | 128 // MP3 re-encode target
export type MinBitrate = 64 | 96 | 128 | 160 // source-audio floor

export interface Settings {
  version: number
  downloads: { baseFolder: string; perPlaylistSubfolder: boolean }
  audio: { format: 'mp3'; preferredBitrate: Bitrate; minBitrate: MinBitrate | null }
  cookies: { source: CookieSource }
  tagging: {
    enabled: boolean
    primarySource: 'youtube' | 'musicbrainz'
    enrichWithMusicBrainz: boolean
    fetchCoverArt: boolean
    fetchGenre: boolean
    fetchTrackNumber: boolean
    minMatchScore: number
    userAgentEmail: string
  }
  rename: { enabled: boolean; template: string }
  performance: { parallel: number }
}

export type TrackStatus = 'queued' | 'downloading' | 'tagging' | 'done' | 'failed' | 'skipped'

export interface TrackProgress {
  index: number
  title: string
  status: TrackStatus
  percent?: number
  reason?: string
}

export interface JobProgress {
  jobTitle: string
  total: number
  tracks: TrackProgress[]
}

export interface ParsedTitle {
  artist: string | null
  title: string
}

export interface TrackTags {
  artist?: string
  title?: string
  album?: string
  date?: string
  year?: string
  trackNumber?: string
  genre?: string
}
