import type en from './en'

const de: typeof en = {
  app: {
    settings: 'Einstellungen'
  },
  download: {
    urlLabel: 'YouTube-Playlist- oder Video-URL einfügen',
    urlPlaceholder: 'https://youtube.com/playlist…',
    pluck: 'Laden',
    plucking: 'Lädt …',
    cancel: 'Abbrechen',
    tracks_one: '{{count}} Titel',
    tracks_other: '{{count}} Titel'
  },
  status: {
    queued: 'in Warteschlange',
    downloading: 'lädt herunter',
    tagging: 'markiert',
    done: 'fertig',
    failed: 'fehlgeschlagen',
    skipped: 'übersprungen'
  },
  settings: {
    title: 'Einstellungen',
    done: 'Fertig',
    sections: {
      language: 'Sprache',
      downloads: 'Downloads',
      audio: 'Audio',
      cookies: 'Cookies',
      tagging: 'Tags',
      naming: 'Benennung',
      performance: 'Leistung'
    },
    language: {
      label: 'Sprache',
      system: 'System'
    },
    downloads: {
      choose: 'Auswählen',
      perPlaylistSubfolder: 'Unterordner pro Playlist'
    },
    audio: {
      preferredBitrate: 'Bevorzugte Bitrate',
      minQuality: 'Mindest-Quellqualität (darunter überspringen)',
      off: 'Aus'
    },
    cookies: {
      auto: 'Automatisch',
      none: 'Keine'
    },
    tagging: {
      enabled: 'Tagging aktivieren',
      enrich: 'Mit MusicBrainz anreichern',
      fetchCover: 'Albumcover abrufen',
      fetchGenre: 'Genre abrufen',
      fetchTrackNumber: 'Titelnummer abrufen',
      primarySource: 'Primäre Quelle',
      minMatchScore: 'Mindest-Trefferwert',
      contactEmail: 'MusicBrainz-Kontakt-E-Mail'
    },
    naming: {
      renameAfter: 'Dateien nach dem Taggen umbenennen',
      tokensHelp: 'Platzhalter: {artist} {track} {title} {album} {year}'
    },
    performance: {
      parallel: 'Parallele Downloads'
    }
  }
}

export default de
