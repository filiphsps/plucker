import type en from './en'

const de: typeof en = {
  app: {
    settings: 'Einstellungen'
  },
  nav: {
    download: 'Laden',
    history: 'Verlauf'
  },
  actions: {
    redownload: 'Erneut laden',
    delete: 'Löschen',
    openFolder: 'Ordner öffnen',
    reveal: 'Im Ordner anzeigen',
    confirmDelete: 'Von der Festplatte löschen? Dies kann nicht rückgängig gemacht werden.'
  },
  track: {
    coverAlt: 'Albumcover'
  },
  history: {
    title: 'Verlauf',
    empty: 'Noch keine Downloads'
  },
  download: {
    urlLabel: 'YouTube-Playlist- oder Video-URL einfügen',
    urlPlaceholder: 'https://youtube.com/playlist…',
    pluck: 'Laden',
    plucking: 'Lädt …',
    cancel: 'Abbrechen',
    clear: 'Leeren',
    tracks_one: '{{count}} Titel',
    tracks_other: '{{count}} Titel'
  },
  status: {
    queued: 'in Warteschlange',
    downloading: 'lädt herunter',
    transforming: 'verarbeitet',
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
      transforms: 'Transformationen',
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
    transforms: {
      add: 'Transformation hinzufügen …'
    },
    performance: {
      parallel: 'Parallele Downloads'
    }
  },
  transforms: {
    autoTag: {
      label: 'Auto-Tag',
      description: 'YouTube-Tags lesen und mit MusicBrainz anreichern.',
      fields: {
        primarySource: 'Primäre Quelle',
        enrich: 'Mit MusicBrainz anreichern',
        fetchCover: 'Albumcover abrufen',
        fetchGenre: 'Genre abrufen',
        fetchTrackNumber: 'Titelnummer abrufen',
        minMatchScore: 'Mindest-Trefferwert'
      },
      options: { youtube: 'YouTube', musicbrainz: 'MusicBrainz' }
    },
    rename: {
      label: 'Datei umbenennen',
      description: 'Datei anhand der finalen Tags umbenennen.',
      fields: {
        template: 'Dateinamen-Vorlage – Platzhalter: {artist} {track} {title} {album} {year}'
      }
    }
  }
}

export default de
