import { menu } from '../../../../shared/menu-strings'

export default {
  menu: menu.en,
  app: {
    settings: 'Settings'
  },
  nav: {
    download: 'Download',
    history: 'History'
  },
  actions: {
    redownload: 'Redownload',
    delete: 'Delete',
    clear: 'Clear',
    openFolder: 'Open folder',
    reveal: 'Reveal in folder',
    confirmDelete: 'Delete from disk? This cannot be undone.'
  },
  context: {
    reveal: 'Reveal in folder',
    copyTitle: 'Copy title',
    copyUrl: 'Copy YouTube URL',
    openYouTube: 'Open on YouTube',
    redownload: 'Re-download',
    editTags: 'Edit tags',
    deleteFile: 'Delete file',
    copyError: 'Copy error code',
    openFolder: 'Open folder',
    redownloadAll: 'Re-download all',
    copyPlaylistUrl: 'Copy playlist URL',
    deleteEntry: 'Delete entry',
    clearCache: 'Clear cache',
    copyLine: 'Copy line',
    copyAll: 'Copy all',
    revealLog: 'Reveal log file'
  },
  track: {
    coverAlt: 'Album cover'
  },
  error: {
    heading: 'Error details',
    code: 'Error code',
    message: 'Message',
    none: 'No additional detail provided.'
  },
  deck: {
    nowPlucking: 'NOW PLUCKING',
    jobProgress: 'JOB PROGRESS',
    tracks: 'TRACKS',
    failed_one: '{{count}} FAILED',
    failed_other: '{{count}} FAILED'
  },
  history: {
    title: 'History',
    empty: 'No downloads yet',
    search: 'Search history…',
    outcomeCompleted: 'COMPLETE',
    outcomePartial_one: '{{count}} FAILED',
    outcomePartial_other: '{{count}} FAILED',
    outcomeFailed: 'FAILED',
    outcomeCancelled: 'CANCELLED',
    colFile: 'File',
    missing: 'File missing',
    missingBadge: 'MISSING'
  },
  download: {
    urlLabel: 'Paste a YouTube playlist or video URL',
    urlPlaceholder: 'https://youtube.com/playlist…',
    pluck: 'Pluck',
    plucking: 'Plucking…',
    cancel: 'Cancel',
    pause: 'Pause',
    resume: 'Resume',
    clear: 'Clear',
    clearTitle: 'Clear page',
    invalidUrl: 'Not a supported URL',
    history: {
      delete: 'Remove from history'
    },
    colTrack: 'Track',
    colSpeed: 'Speed',
    colProgress: 'Progress',
    colStatus: 'Status',
    colSource: 'Source',
    colDest: 'Destination',
    emptyHint: 'Paste a playlist or video URL above and press Pluck.',
    tracks_one: '{{count}} track',
    tracks_other: '{{count}} tracks'
  },
  resolve: {
    title: 'Starting download',
    launching: 'Launched yt-dlp',
    resolving: 'Resolving playlist…',
    resolved_one: 'Found {{count}} track',
    resolved_other: 'Found {{count}} tracks',
    errorTitle: 'Couldn’t start download'
  },
  console: {
    toggle: 'Toggle console',
    title: 'Console',
    empty: 'No log output yet',
    clear: 'Clear',
    copy: 'Copy',
    copied: 'Copied',
    reveal: 'Reveal log file',
    autoScroll: 'Auto-scroll',
    levels: 'Levels',
    scopes: 'Scopes',
    counts: '{{shown}} / {{total}}'
  },
  status: {
    queued: 'queued',
    downloading: 'downloading',
    transforming: 'transforming',
    done: 'done',
    failed: 'failed',
    skipped: 'skipped',
    cancelled: 'cancelled'
  },
  stage: {
    downloading: 'Downloading · yt-dlp',
    hashing: 'Hashing audio',
    probing: 'Reading audio specs',
    saving: 'Saving file',
    'auto-tag': 'Auto-tagging · MusicBrainz',
    rename: 'Renaming file',
    'square-cover': 'Squaring cover art',
    took: 'took {{time}}'
  },
  settings: {
    title: 'Settings',
    done: 'Done',
    cancel: 'Cancel',
    save: 'Save changes',
    sections: {
      language: 'General',
      downloads: 'Downloads',
      audio: 'Audio',
      cookies: 'Network & Cookies',
      transforms: 'Transform Chain',
      performance: 'Performance',
      updates: 'Updates',
      cache: 'Cache',
      developer: 'Developer',
      reset: 'Reset',
      about: 'About'
    },
    cache: {
      manage: 'Metadata cache',
      manageDesc: 'Browse, edit and delete cached track metadata',
      open: 'Open cache'
    },
    developer: {
      console: 'Enable console',
      consoleDesc: 'Show a live log console overlay (terminal button in the header)'
    },
    reset: {
      label: 'Reset settings',
      desc: 'Delete the entire Plucker config and restart with factory defaults',
      button: 'Reset settings',
      confirm:
        'Reset all settings? This permanently deletes your Plucker config (settings and download history) and restarts the app. This cannot be undone.'
    },
    language: {
      label: 'Language',
      desc: 'Interface language for Plucker',
      system: 'System'
    },
    downloads: {
      choose: 'Choose…',
      folder: 'Library folder',
      folderDesc: 'Where plucked tracks are saved',
      perPlaylistSubfolder: 'Sub-folder per playlist',
      subfolderDesc: 'Create a folder named after each playlist'
    },
    audio: {
      preferredBitrate: 'Preferred bitrate',
      preferredDesc: 'Target MP3 quality when available',
      minQuality: 'Minimum quality',
      minDesc: 'Skip sources below this bitrate',
      off: 'Off',
      sampleRate: 'Sample rate',
      sampleRateDesc: 'Output sample rate; Source keeps the original',
      sampleRateSource: 'Source'
    },
    cookies: {
      label: 'Cookie source',
      desc: 'Import browser cookies for age-restricted or private content',
      auto: 'Automatic',
      none: 'None'
    },
    transforms: {
      add: 'Add transform…',
      runsNote: 'runs top → bottom on every track'
    },
    performance: {
      parallel: 'Parallel downloads',
      parallelDesc: 'How many tracks to pluck at once (1–16)',
      compressionLevel: 'Encoding effort',
      compressionLevelDesc:
        'libmp3lame quality vs speed (0 = best, 9 = fastest). Higher is much faster on older Macs and inaudible at high bitrates.',
      concurrentFragments: 'Concurrent fragments',
      concurrentFragmentsDesc:
        'Parallel fragment downloads per track (1–16). Speeds up segmented (HLS/DASH) sources; no effect on single-file audio.',
      priority: 'Download priority',
      priorityDesc:
        'Run downloads at lower CPU priority to keep your Mac responsive while encoding on older hardware.',
      priorityNormal: 'Normal',
      priorityLow: 'Low (background)'
    },
    updates: {
      checkOnLaunch: 'Check for updates on launch',
      desc: 'Notify me when a new version is available'
    },
    about: {
      repository: 'Repository',
      repositoryDesc: 'View the source code and report issues',
      viewRepo: 'Open',
      author: 'Author',
      contributors: 'Contributors',
      update: {
        checking: 'Checking for updates…',
        upToDate: 'Plucker is up to date',
        available: 'Version {{version}} is available',
        downloading: 'Downloading update… {{percent}}%',
        downloadingDiff: 'Downloading update… {{percent}}% (reusing {{reuse}}% from your build)',
        verifying: 'Verifying update…',
        ready: 'Update downloaded — relaunch to finish',
        error: 'Couldn’t check for updates',
        devOnly: 'Updates are only available in the installed app',
        current: 'You’re on version {{version}}',
        checkAgain: 'Check again',
        relaunch: 'Relaunch',
        retry: 'Try again',
        download: 'View release'
      }
    }
  },
  cache: {
    title: 'Cache',
    back: 'Settings',
    search: 'Search cache…',
    empty: 'Nothing cached yet',
    untitled: 'Untitled',
    colQuality: 'Quality',
    colTime: 'Time',
    clear: 'Clear cache',
    clearConfirm: 'Clear the entire metadata cache? This cannot be undone.',
    deleteConfirm: 'Remove this entry from the cache?',
    entries_one: '{{count}} entry · {{size}}',
    entries_other: '{{count}} entries · {{size}}',
    editingTags: 'Editing tags',
    audioReadonly: 'Audio read-only',
    save: 'Save'
  },
  meta: {
    loading: 'Reading metadata…',
    unavailable: 'File not available',
    audio: {
      bitrate: 'Bitrate',
      duration: 'Duration',
      sampleRate: 'Sample rate',
      channels: 'Channels',
      codec: 'Codec',
      size: 'Size'
    },
    tags: {
      artist: 'Artist',
      title: 'Title',
      album: 'Album',
      year: 'Year',
      trackNumber: 'Track #',
      genre: 'Genre'
    },
    source: {
      url: 'URL',
      videoId: 'Video ID',
      downloaded: 'Downloaded'
    }
  },
  transforms: {
    autoTag: {
      label: 'Auto-tag',
      description: 'Read YouTube tags and enrich from MusicBrainz.',
      fields: {
        primarySource: 'Primary source',
        enrich: 'Enrich with MusicBrainz',
        fetchCover: 'Fetch album cover',
        fetchGenre: 'Fetch genre',
        fetchTrackNumber: 'Fetch track number',
        minMatchScore: 'Min match score'
      },
      options: { youtube: 'YouTube', musicbrainz: 'MusicBrainz' }
    },
    rename: {
      label: 'Rename file',
      description: 'Rename the file from its final tags.',
      fields: {
        template: 'Filename template — tokens: {artist} {track} {title} {album} {year}'
      }
    },
    squareCover: {
      label: 'Square cover art',
      description: 'Center-crop the embedded cover to a square, trimming the longer side.'
    },
    trimSilence: {
      label: 'Trim silence',
      description: 'Remove silent audio from the start and/or end of the track.',
      fields: {
        mode: 'Trim',
        thresholdDb: 'Silence threshold (dB) — lower is stricter; -90 ≈ true silence',
        minDurationSec: 'Minimum silence (seconds)'
      },
      modes: {
        both: 'Start and end',
        start: 'Start only',
        end: 'End only',
        none: 'Disabled'
      }
    }
  }
}
