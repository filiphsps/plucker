export default {
  app: {
    settings: 'Settings'
  },
  download: {
    urlLabel: 'Paste a YouTube playlist or video URL',
    urlPlaceholder: 'https://youtube.com/playlist…',
    pluck: 'Pluck',
    plucking: 'Plucking…',
    cancel: 'Cancel',
    tracks_one: '{{count}} track',
    tracks_other: '{{count}} tracks'
  },
  status: {
    queued: 'queued',
    downloading: 'downloading',
    tagging: 'tagging',
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
      tagging: 'Tagging',
      naming: 'Naming',
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
    tagging: {
      enabled: 'Enable tagging',
      enrich: 'Enrich with MusicBrainz',
      fetchCover: 'Fetch album cover',
      fetchGenre: 'Fetch genre',
      fetchTrackNumber: 'Fetch track number',
      primarySource: 'Primary source',
      minMatchScore: 'Min match score',
      contactEmail: 'MusicBrainz contact email'
    },
    naming: {
      renameAfter: 'Rename files after tagging',
      tokensHelp: 'Tokens: {artist} {track} {title} {album} {year}'
    },
    performance: {
      parallel: 'Parallel downloads'
    }
  }
}
