export type CookieSource = 'auto' | 'none' | 'chrome' | 'edge' | 'safari' | 'firefox' | 'brave'

export type Bitrate = 320 | 256 | 192 | 128 // MP3 re-encode target
export type MinBitrate = 64 | 96 | 128 | 160 // source-audio floor

/** UI language: 'system' follows the OS locale, otherwise an explicit override. */
export type Language = 'system' | 'en' | 'de'

export interface Settings {
  version: number
  language: Language
  history: HistoryEntry[]
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
  /** Absolute path to the final mp3 once downloaded/tagged (enables reveal-in-folder). */
  file?: string
  videoId?: string
  artist?: string
  album?: string
  year?: string
}

export interface JobProgress {
  jobTitle: string
  total: number
  tracks: TrackProgress[]
  /** Absolute destination folder for this job (enables open-folder). */
  folder: string
  /** Source URL of the job (enables redownload). */
  url: string
}

/** A single tagged track recorded in history. */
export interface HistoryTrack {
  file: string
  title: string
  artist?: string
  album?: string
  year?: string
  videoId?: string
}

/** A completed download recorded in the persistent history. */
export interface HistoryEntry {
  id: string
  url: string
  title: string
  folder: string
  kind: 'playlist' | 'video'
  completedAt: string // ISO timestamp
  tracks: HistoryTrack[]
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
