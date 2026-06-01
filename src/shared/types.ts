import type { TransformInstance } from './transforms'

export type CookieSource = 'auto' | 'none' | 'chrome' | 'edge' | 'safari' | 'firefox' | 'brave'

export type Bitrate = 320 | 256 | 192 | 128 // MP3 re-encode target
export type MinBitrate = 64 | 96 | 128 | 160 // source-audio floor

/** UI language: 'system' follows the OS locale, otherwise an explicit override. */
export type Language = 'system' | 'en' | 'de'

/** Targets the application menu can navigate the renderer to. */
export type MenuNavTarget = 'download' | 'history' | 'settings'

export interface Settings {
  version: number
  language: Language
  history: HistoryEntry[]
  downloads: { baseFolder: string; perPlaylistSubfolder: boolean }
  audio: { format: 'mp3'; preferredBitrate: Bitrate; minBitrate: MinBitrate | null }
  cookies: { source: CookieSource }
  transforms: TransformInstance[]
  performance: { parallel: number }
  updates: { checkOnLaunch: boolean }
}

export type TrackStatus = 'queued' | 'downloading' | 'transforming' | 'done' | 'failed' | 'skipped'

export interface TrackProgress {
  index: number
  title: string
  status: TrackStatus
  percent?: number
  /** 0..100 progress within the transform phase. */
  transformPercent?: number
  reason?: string
  /** Absolute path to the final mp3 once downloaded/tagged (enables reveal-in-folder). */
  file?: string
  videoId?: string
  artist?: string
  album?: string
  year?: string
  /** Tag-independent audio-content hash; cache key for extracted metadata. */
  hash?: string
}

export interface JobProgress {
  jobTitle: string
  total: number
  tracks: TrackProgress[]
  /** Absolute destination folder for this job (enables open-folder). */
  folder: string
  /** Source URL of the job (enables redownload). */
  url: string
  /** 0..1 overall job progress (download-weighted), for the OS progress bar. */
  overall: number
}

/** A single tagged track recorded in history. */
export interface HistoryTrack {
  file: string
  title: string
  artist?: string
  album?: string
  year?: string
  videoId?: string
  /** Tag-independent audio-content hash; cache key for extracted metadata. */
  hash?: string
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

/** Technical audio properties extracted from a media file. */
export interface AudioMeta {
  codec?: string
  bitrateKbps?: number
  sampleRateHz?: number
  channels?: number
  durationSec?: number
  sizeBytes?: number
}

/** File-derived metadata for the expanded track detail panel. */
export interface TrackMetadata {
  tags: TrackTags
  audio: AudioMeta
}

/** Last-known display identity of the track that produced a cache entry. */
export interface CacheTrackIdentity {
  title?: string
  file?: string
  videoId?: string
}

/** A cached track as surfaced to the cache-manager UI. */
export interface CachedTrack {
  hash: string
  audio?: AudioMeta
  /** Cached MusicBrainz tags (the editable block). */
  mb?: TrackTags
  track?: CacheTrackIdentity
  updatedAt?: string
  hasCover: boolean
  /** Whether the underlying library file still exists on disk. */
  fileExists: boolean
}
