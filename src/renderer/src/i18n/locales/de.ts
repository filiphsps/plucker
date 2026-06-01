import type en from './en'
import { menu } from '../../../../shared/menu-strings'

const de: typeof en = {
  menu: menu.de,
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
  deck: {
    nowPlucking: 'WIRD GELADEN',
    jobProgress: 'FORTSCHRITT',
    tracks: 'TITEL',
    failed_one: '{{count}} FEHLER',
    failed_other: '{{count}} FEHLER'
  },
  history: {
    title: 'Verlauf',
    empty: 'Noch keine Downloads',
    search: 'Verlauf durchsuchen …',
    completeBadge: 'FERTIG',
    failedBadge_one: '{{count}} FEHLER',
    failedBadge_other: '{{count}} FEHLER',
    colFile: 'Datei',
    missing: 'Datei fehlt',
    missingBadge: 'FEHLT'
  },
  download: {
    urlLabel: 'YouTube-Playlist- oder Video-URL einfügen',
    urlPlaceholder: 'https://youtube.com/playlist…',
    pluck: 'Laden',
    plucking: 'Lädt …',
    cancel: 'Abbrechen',
    clear: 'Leeren',
    colTrack: 'Titel',
    colProgress: 'Fortschritt',
    colStatus: 'Status',
    colSource: 'Quelle',
    colDest: 'Ziel',
    emptyHint: 'Füge oben eine Playlist- oder Video-URL ein und klicke auf Laden.',
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
    cancel: 'Abbrechen',
    save: 'Änderungen speichern',
    sections: {
      language: 'Allgemein',
      downloads: 'Downloads',
      audio: 'Audio',
      cookies: 'Netzwerk & Cookies',
      transforms: 'Transformationskette',
      performance: 'Leistung',
      updates: 'Aktualisierungen',
      cache: 'Cache'
    },
    cache: {
      manage: 'Metadaten-Cache',
      manageDesc: 'Zwischengespeicherte Titel-Metadaten ansehen, bearbeiten und löschen',
      open: 'Cache öffnen'
    },
    language: {
      label: 'Sprache',
      desc: 'Oberflächensprache für Plucker',
      system: 'System'
    },
    downloads: {
      choose: 'Auswählen …',
      folder: 'Bibliotheksordner',
      folderDesc: 'Wo geladene Titel gespeichert werden',
      perPlaylistSubfolder: 'Unterordner pro Playlist',
      subfolderDesc: 'Einen nach jeder Playlist benannten Ordner erstellen'
    },
    audio: {
      preferredBitrate: 'Bevorzugte Bitrate',
      preferredDesc: 'Ziel-MP3-Qualität, wenn verfügbar',
      minQuality: 'Mindestqualität',
      minDesc: 'Quellen unter dieser Bitrate überspringen',
      off: 'Aus'
    },
    cookies: {
      label: 'Cookie-Quelle',
      desc: 'Browser-Cookies für altersbeschränkte oder private Inhalte importieren',
      auto: 'Automatisch',
      none: 'Keine'
    },
    transforms: {
      add: 'Transformation hinzufügen …',
      runsNote: 'läuft von oben nach unten für jeden Titel'
    },
    performance: {
      parallel: 'Parallele Downloads',
      parallelDesc: 'Wie viele Titel gleichzeitig geladen werden (1–16)'
    },
    updates: {
      checkOnLaunch: 'Beim Start nach Updates suchen',
      desc: 'Benachrichtigen, wenn eine neue Version verfügbar ist'
    }
  },
  cache: {
    title: 'Cache',
    back: 'Einstellungen',
    search: 'Cache durchsuchen …',
    empty: 'Noch nichts im Cache',
    untitled: 'Ohne Titel',
    colQuality: 'Qualität',
    colTime: 'Zeit',
    clear: 'Cache leeren',
    clearConfirm: 'Den gesamten Metadaten-Cache leeren? Dies kann nicht rückgängig gemacht werden.',
    deleteConfirm: 'Diesen Eintrag aus dem Cache entfernen?',
    entries_one: '{{count}} Eintrag · {{size}}',
    entries_other: '{{count}} Einträge · {{size}}',
    editingTags: 'Tags bearbeiten',
    audioReadonly: 'Audio schreibgeschützt',
    save: 'Speichern'
  },
  meta: {
    loading: 'Metadaten werden gelesen…',
    unavailable: 'Datei nicht verfügbar',
    audio: {
      bitrate: 'Bitrate',
      duration: 'Dauer',
      sampleRate: 'Abtastrate',
      channels: 'Kanäle',
      codec: 'Codec',
      size: 'Größe'
    },
    tags: {
      artist: 'Künstler',
      title: 'Titel',
      album: 'Album',
      year: 'Jahr',
      trackNumber: 'Titelnr.',
      genre: 'Genre'
    },
    source: {
      url: 'URL',
      videoId: 'Video-ID',
      downloaded: 'Heruntergeladen'
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
