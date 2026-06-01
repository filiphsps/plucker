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
    tracks: 'TRACKS'
  },
  history: {
    title: 'History',
    empty: 'No downloads yet',
    search: 'Search history…',
    completeBadge: 'COMPLETE',
    failedBadge_one: '{{count}} FAILED',
    failedBadge_other: '{{count}} FAILED',
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
    colProgress: 'Progress',
    colStatus: 'Status',
    colSource: 'Source',
    colDest: 'Destination',
    emptyHint: 'Paste a playlist or video URL above and press Pluck.',
    tracks_one: '{{count}} track',
    tracks_other: '{{count}} tracks'
  },
  status: {
    queued: 'queued',
    downloading: 'downloading',
    transforming: 'transforming',
    done: 'done',
    failed: 'failed',
    skipped: 'skipped'
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
      off: 'Off'
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
      parallelDesc: 'How many tracks to pluck at once (1–16)'
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
