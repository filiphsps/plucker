export default {
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
  history: {
    title: 'History',
    empty: 'No downloads yet'
  },
  download: {
    urlLabel: 'Paste a YouTube playlist or video URL',
    urlPlaceholder: 'https://youtube.com/playlist…',
    pluck: 'Pluck',
    plucking: 'Plucking…',
    cancel: 'Cancel',
    clear: 'Clear',
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
    sections: {
      language: 'Language',
      downloads: 'Downloads',
      audio: 'Audio',
      cookies: 'Cookies',
      transforms: 'Transforms',
      performance: 'Performance'
    },
    language: {
      label: 'Language',
      system: 'System'
    },
    downloads: {
      choose: 'Choose',
      perPlaylistSubfolder: 'Per-playlist subfolder'
    },
    audio: {
      preferredBitrate: 'Preferred bitrate',
      minQuality: 'Minimum source quality (skip below)',
      off: 'Off'
    },
    cookies: {
      auto: 'Automatic',
      none: 'None'
    },
    transforms: {
      add: 'Add transform…'
    },
    performance: {
      parallel: 'Parallel downloads'
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
