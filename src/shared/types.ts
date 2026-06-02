import type { TransformInstance } from './transforms'

export type CookieSource = 'auto' | 'none' | 'chrome' | 'edge' | 'safari' | 'firefox' | 'brave'

export type Bitrate = 320 | 256 | 192 | 128 // MP3 re-encode target
export type MinBitrate = 64 | 96 | 128 | 160 // source-audio floor
/** Output sample rate (Hz). The valid MPEG-1 Layer III MP3 rates; `null` keeps the source rate. */
export type SampleRate = 44100 | 48000 | 32000
/**
 * libmp3lame algorithm-quality / effort (ffmpeg `-compression_level`): 0 = best
 * but slowest, 9 = fastest but lowest. Higher values cut encode time on slow
 * CPUs and are effectively inaudible at high bitrates. Default 7.
 */
export type CompressionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/**
 * Scheduling priority for the yt-dlp/ffmpeg subprocess. `low` runs the download
 * niced down so heavy encoding keeps the rest of the system (and the UI)
 * responsive on older machines; `normal` competes for CPU as usual.
 */
export type ProcessPriority = 'normal' | 'low'

/** UI language: 'system' follows the OS locale, otherwise an explicit override. */
export type Language = 'system' | 'en' | 'de'

/** Targets the application menu can navigate the renderer to. */
export type MenuNavTarget = 'download' | 'history' | 'settings' | 'cache'

/** Docked = inline drawer; floating = its own window. */
export type ConsoleMode = 'docked' | 'floating'

/** Persisted console-window preferences. */
export interface ConsoleWindowState {
  mode: ConsoleMode
  alwaysOnTop: boolean
}

export interface Settings {
  version: number
  language: Language
  history: HistoryEntry[]
  /** Past download URLs entered in the command bar, most-recent-first and deduped. */
  urlHistory: string[]
  downloads: { baseFolder: string; perPlaylistSubfolder: boolean }
  audio: {
    format: 'mp3'
    preferredBitrate: Bitrate
    minBitrate: MinBitrate | null
    /** Output sample rate; `null` keeps the source rate. */
    sampleRate: SampleRate | null
  }
  cookies: { source: CookieSource }
  transforms: TransformInstance[]
  performance: {
    parallel: number
    compressionLevel: CompressionLevel
    /** yt-dlp `--concurrent-fragments`: parallel fragment downloads for HLS/DASH. */
    concurrentFragments: number
    /** Scheduling priority for the download/encode subprocess. */
    priority: ProcessPriority
  }
  updates: { checkOnLaunch: boolean }
  /** Developer/diagnostics options. */
  developer: { console: boolean; consoleWindow: ConsoleWindowState }
}

/** Severity of a log line, in ascending order. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * A serialized log argument, preserving its runtime type so the developer console can
 * render it the way browser devtools does — type-coloured primitives and expandable
 * objects/arrays/errors — instead of a flat string. Produced in the main process and
 * shipped over IPC, so every variant is structured-clone-safe (no live references).
 */
export type LogValue =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'bigint'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'null' }
  | { kind: 'undefined' }
  | { kind: 'symbol'; value: string }
  | { kind: 'function'; value: string }
  | { kind: 'date'; value: string }
  | { kind: 'error'; name: string; message: string; stack?: string }
  | { kind: 'array'; items: LogValue[]; truncated?: number }
  | { kind: 'object'; ctor?: string; entries: LogEntryField[]; truncated?: number }
  /** A node the serializer refused to descend into (cycle or depth cap). */
  | { kind: 'circular' }
  | { kind: 'max-depth' }

/** One `key: value` pair inside a serialized object. */
export interface LogEntryField {
  key: string
  value: LogValue
}

/**
 * A single line in the unified main-process log stream — surfaced live in the
 * developer console overlay and appended to `~/.plucker/plucker.log`.
 */
export interface LogEntry {
  /** Epoch milliseconds when the line was emitted. */
  time: number
  level: LogLevel
  /** Subsystem that emitted the line (e.g. `app`, `yt-dlp`, `transform`). */
  scope: string
  /** Flat `console.log`-formatted text — the file/clipboard representation. */
  message: string
  /**
   * Structured form of the original log arguments, for rich console rendering. Only
   * populated when at least one argument is non-string (a pure-string line is fully
   * represented by {@link message}); consumers fall back to `message` when absent.
   */
  args?: LogValue[]
}

export type TrackStatus =
  | 'queued'
  | 'downloading'
  | 'transforming'
  | 'done'
  | 'failed'
  | 'skipped'
  | 'cancelled'

/**
 * Fine-grained "what is this track doing right now" pushed by the pipeline ticker.
 * Built-ins map to localized labels under the `stage.*` i18n namespace; transform
 * steps use the transform's `type` (e.g. `auto-tag`, `rename`).
 */
export type TrackStage = 'downloading' | 'hashing' | 'probing' | 'saving' | (string & {})

export interface TrackProgress {
  index: number
  title: string
  status: TrackStatus
  percent?: number
  /** 0..100 progress within the transform phase. */
  transformPercent?: number
  /** Current activity for the live status tooltip (the ticker). */
  stage?: TrackStage
  /** Live download speed in bytes/sec while downloading. */
  speedBytesPerSec?: number
  /** Total processing time in ms, set once the track reaches a terminal state. */
  elapsedMs?: number
  reason?: string
  /** Machine error code for a failure (e.g. yt-dlp exit code), preferred over `reason` in tooltips. */
  errorCode?: string
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

/**
 * Lifecycle status emitted before the first JobProgress (and on a failed start),
 * driving the download view's loading panel during playlist/video resolution.
 */
export interface JobStatus {
  phase: 'resolving' | 'error'
  /** Curated, translatable step. Renderer maps via i18n `resolve.<key>`. */
  key?: 'launching' | 'resolving' | 'resolved'
  /** Interpolation params for `key` (e.g. { count }). */
  params?: Record<string, string | number>
  /** Raw yt-dlp stderr line, shown verbatim (untranslated). */
  line?: string
  /** Human-readable error message when phase === 'error'. */
  error?: string
}

/** Terminal per-track outcome recorded in history. */
export type HistoryTrackStatus = 'done' | 'failed' | 'skipped' | 'cancelled'

/** A single track recorded in history (downloaded, failed, skipped, or cancelled). */
export interface HistoryTrack {
  title: string
  /** Terminal outcome of this track. */
  status: HistoryTrackStatus
  /** Absolute path to the final mp3 — present only for successfully downloaded tracks. */
  file?: string
  /** Failure/skip detail (e.g. yt-dlp error tail, "below minimum quality"). */
  reason?: string
  /** Machine error code for a failure (e.g. yt-dlp exit code), preferred over `reason` in tooltips. */
  errorCode?: string
  artist?: string
  album?: string
  year?: string
  videoId?: string
  /** Tag-independent audio-content hash; cache key for extracted metadata. */
  hash?: string
}

/** Overall outcome of a recorded job, driving the history entry badge. */
export type JobOutcome = 'completed' | 'partial' | 'failed' | 'cancelled' | 'interrupted'

/** A download job recorded in the persistent history. */
export interface HistoryEntry {
  id: string
  /** Links this entry to its checkpoint file when the job was interrupted/resumable. */
  jobId?: string
  url: string
  title: string
  folder: string
  kind: 'playlist' | 'video'
  completedAt: string // ISO timestamp
  /** Job-level result: all done, some failed (partial), all failed, cancelled, or interrupted. */
  outcome: JobOutcome
  /** Job-level error detail when the job failed to start (e.g. resolution failure). */
  reason?: string
  tracks: HistoryTrack[]
}

/** One entry in a durable job checkpoint (mirrors a track's lifecycle). */
export interface CheckpointEntry {
  index: number
  /** Source video id, used to rebuild the per-track download URL on resume. */
  videoId?: string
  title: string
  status: TrackStatus
  /** Rich record once the track is terminal (carried into the resumed history entry). */
  track?: HistoryTrack
}

/** A durable, resumable snapshot of an in-progress job. One file per active job. */
export interface JobCheckpoint {
  jobId: string
  version: 1
  url: string
  folder: string
  jobTitle: string
  kind: 'playlist' | 'video'
  startedAt: number
  updatedAt: number
  total: number
  entries: CheckpointEntry[]
  /**
   * Set once the user dismisses this job's resume banner. The checkpoint is kept
   * (the job stays resumable from History), but the banner is never offered again.
   */
  dismissed?: boolean
}

/** One entry in a resolved playlist/video, before download. */
export interface PlaylistEntry {
  videoId: string
  title: string
  index: number
  /** Per-entry page URL from the flat playlist, used to download this video alone. */
  url?: string
}

/** Result of resolving a URL without downloading. */
export interface ResolvedJob {
  kind: 'playlist' | 'video'
  title: string
  entries: PlaylistEntry[]
}

/** Curated, reordered job the user confirmed in the staging list. */
export interface StartJobRequest {
  url: string
  title: string
  kind: 'playlist' | 'video'
  entries: PlaylistEntry[]
  /** Force a specific output folder (history redownload reuses the original). */
  folderOverride?: string
}

export interface ParsedTitle {
  artist: string | null
  title: string
  /** Featured artists pulled out of the title (feat./ft./with), if any. */
  featured?: string[]
  /** Version/edit descriptor pulled out of the title, e.g. "Acoustic Remix". */
  version?: string
}

export interface TrackTags {
  artist?: string
  title?: string
  album?: string
  date?: string
  year?: string
  trackNumber?: string
  genre?: string
  /** Musical key (TKEY), e.g. "Am" — written by the analyze-key-bpm transform. */
  key?: string
  /** Camelot wheel code (TXXX:CAMELOT), e.g. "8A". */
  camelot?: string
  /** Tempo in BPM (TBPM) as a string, e.g. "124". */
  bpm?: string
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

/** Precomputed waveform peaks for the expanded-panel visualization. */
export interface Waveform {
  /** Normalized 0..1 peaks, one per rendered bar (length {@link WAVEFORM_BARS}). */
  peaks: number[]
  /** Total duration in seconds, carried for a future playhead + the tooltip. */
  durationSec?: number
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

/**
 * Chrome-style updater state machine, surfaced to the About card.
 * - `checking`     — a check is in flight
 * - `upToDate`     — no newer version available
 * - `available`    — a newer version exists (download not started / can't self-install)
 * - `downloading`  — the update zip is downloading (`percent` populated)
 * - `verifying`    — download finished; checking its integrity before install
 * - `ready`        — downloaded and ready; relaunch to swap-and-install
 * - `unsupported`  — running unpackaged (dev) where updates don't apply
 * - `error`        — the check or download failed (`error` populated)
 */
export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'upToDate'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'unsupported'
  | 'error'

export interface UpdateState {
  phase: UpdatePhase
  currentVersion: string
  /** The available newer version, when one was found. */
  newVersion?: string
  /** Download progress 0–100 while `phase === 'downloading'`. */
  percent?: number
  /**
   * For a differential download, the % of the new build reused from the cached
   * previous build (so the UI can show how little is actually being fetched).
   */
  reusePercent?: number
  /** Human-readable failure reason while `phase === 'error'`. */
  error?: string
  /**
   * Whether this platform/build can install the update itself (macOS .app bundle).
   * When false the UI offers a manual download link instead of a relaunch button.
   */
  canSelfInstall: boolean
}
