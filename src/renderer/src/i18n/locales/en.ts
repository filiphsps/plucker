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
    openFolder: 'Open folder',
    reveal: 'Reveal in folder',
    confirmDelete: 'Delete from disk? This cannot be undone.'
  },
  track: {
    coverAlt: 'Album cover'
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
    clear: 'Clear',
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
      cache: 'Cache'
    },
    cache: {
      manage: 'Metadata cache',
      manageDesc: 'Browse, edit and delete cached track metadata',
      open: 'Open cache'
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
        'libmp3lame quality vs speed (0 = best, 9 = fastest). Higher is much faster on older Macs and inaudible at high bitrates.'
    },
    updates: {
      checkOnLaunch: 'Check for updates on launch',
      desc: 'Notify me when a new version is available'
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
    }
  }
}
