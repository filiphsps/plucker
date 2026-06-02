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
    clear: 'Entfernen',
    openFolder: 'Ordner öffnen',
    reveal: 'Im Ordner anzeigen',
    collapse: 'Einklappen',
    expand: 'Ausklappen',
    confirmDelete: 'Von der Festplatte löschen? Dies kann nicht rückgängig gemacht werden.'
  },
  context: {
    reveal: 'Im Ordner anzeigen',
    copyTitle: 'Titel kopieren',
    copyUrl: 'YouTube-URL kopieren',
    openYouTube: 'Auf YouTube öffnen',
    redownload: 'Erneut herunterladen',
    editTags: 'Tags bearbeiten',
    deleteFile: 'Datei löschen',
    copyError: 'Fehlercode kopieren',
    openFolder: 'Ordner öffnen',
    redownloadAll: 'Alle erneut herunterladen',
    copyPlaylistUrl: 'Playlist-URL kopieren',
    deleteEntry: 'Eintrag löschen',
    clearCache: 'Cache leeren',
    copyLine: 'Zeile kopieren',
    copyAll: 'Alles kopieren',
    revealLog: 'Protokolldatei anzeigen'
  },
  track: {
    coverAlt: 'Albumcover'
  },
  error: {
    heading: 'Fehlerdetails',
    code: 'Fehlercode',
    message: 'Meldung',
    none: 'Keine weiteren Angaben verfügbar.'
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
    outcomeCompleted: 'FERTIG',
    outcomePartial_one: '{{count}} FEHLER',
    outcomePartial_other: '{{count}} FEHLER',
    outcomeFailed: 'FEHLGESCHLAGEN',
    outcomeCancelled: 'ABGEBROCHEN',
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
    pause: 'Pausieren',
    resume: 'Fortsetzen',
    clear: 'Leeren',
    clearTitle: 'Seite leeren',
    invalidUrl: 'Keine unterstützte URL',
    history: {
      delete: 'Aus Verlauf entfernen'
    },
    colTrack: 'Titel',
    colSpeed: 'Tempo',
    colProgress: 'Fortschritt',
    colStatus: 'Status',
    colSource: 'Quelle',
    colDest: 'Ziel',
    emptyHint: 'Füge oben eine Playlist- oder Video-URL ein und klicke auf Laden.',
    tracks_one: '{{count}} Titel',
    tracks_other: '{{count}} Titel'
  },
  resolve: {
    title: 'Download wird gestartet',
    launching: 'yt-dlp gestartet',
    resolving: 'Playlist wird aufgelöst…',
    resolved_one: '{{count}} Titel gefunden',
    resolved_other: '{{count}} Titel gefunden',
    errorTitle: 'Download konnte nicht gestartet werden'
  },
  console: {
    toggle: 'Konsole umschalten',
    title: 'Konsole',
    empty: 'Noch keine Protokollausgabe',
    clear: 'Leeren',
    copy: 'Kopieren',
    copied: 'Kopiert',
    reveal: 'Protokolldatei anzeigen',
    autoScroll: 'Auto-Scroll',
    levels: 'Stufen',
    scopes: 'Bereiche',
    counts: '{{shown}} / {{total}}'
  },
  status: {
    queued: 'in Warteschlange',
    downloading: 'lädt herunter',
    transforming: 'verarbeitet',
    done: 'fertig',
    failed: 'fehlgeschlagen',
    skipped: 'übersprungen',
    cancelled: 'abgebrochen'
  },
  stage: {
    downloading: 'Lädt herunter · yt-dlp',
    hashing: 'Audio-Hash wird berechnet',
    probing: 'Audiodaten werden gelesen',
    saving: 'Datei wird gespeichert',
    'auto-tag': 'Auto-Tagging · MusicBrainz',
    rename: 'Datei wird umbenannt',
    'square-cover': 'Cover wird quadratisch zugeschnitten',
    took: 'dauerte {{time}}'
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
      cache: 'Cache',
      developer: 'Entwickler',
      reset: 'Zurücksetzen',
      about: 'Über'
    },
    cache: {
      manage: 'Metadaten-Cache',
      manageDesc: 'Zwischengespeicherte Titel-Metadaten ansehen, bearbeiten und löschen',
      open: 'Cache öffnen'
    },
    developer: {
      console: 'Konsole aktivieren',
      consoleDesc: 'Eine Live-Protokollkonsole anzeigen (Terminal-Schaltfläche in der Kopfzeile)'
    },
    reset: {
      label: 'Einstellungen zurücksetzen',
      desc: 'Die gesamte Plucker-Konfiguration löschen und mit Werkseinstellungen neu starten',
      button: 'Einstellungen zurücksetzen',
      confirm:
        'Alle Einstellungen zurücksetzen? Dies löscht deine Plucker-Konfiguration (Einstellungen und Download-Verlauf) dauerhaft und startet die App neu. Dies kann nicht rückgängig gemacht werden.'
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
      off: 'Aus',
      sampleRate: 'Abtastrate',
      sampleRateDesc: 'Ausgabe-Abtastrate; Quelle behält die Originalrate',
      sampleRateSource: 'Quelle'
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
      parallelDesc: 'Wie viele Titel gleichzeitig geladen werden (1–16)',
      compressionLevel: 'Encoding-Aufwand',
      compressionLevelDesc:
        'libmp3lame Qualität vs. Tempo (0 = beste, 9 = schnellste). Höhere Werte sind auf älteren Macs deutlich schneller und bei hohen Bitraten nicht hörbar.',
      concurrentFragments: 'Gleichzeitige Fragmente',
      concurrentFragmentsDesc:
        'Parallele Fragment-Downloads pro Titel (1–16). Beschleunigt segmentierte Quellen (HLS/DASH); kein Effekt bei Einzeldatei-Audio.',
      priority: 'Download-Priorität',
      priorityDesc:
        'Downloads mit niedrigerer CPU-Priorität ausführen, damit dein Mac beim Encoding auf älterer Hardware reaktionsfähig bleibt.',
      priorityNormal: 'Normal',
      priorityLow: 'Niedrig (Hintergrund)'
    },
    updates: {
      checkOnLaunch: 'Beim Start nach Updates suchen',
      desc: 'Benachrichtigen, wenn eine neue Version verfügbar ist'
    },
    about: {
      repository: 'Repository',
      repositoryDesc: 'Quellcode ansehen und Probleme melden',
      viewRepo: 'Öffnen',
      author: 'Autor',
      contributors: 'Mitwirkende',
      update: {
        checking: 'Suche nach Updates …',
        upToDate: 'Plucker ist aktuell',
        available: 'Version {{version}} ist verfügbar',
        downloading: 'Update wird geladen … {{percent}} %',
        downloadingDiff:
          'Update wird geladen … {{percent}} % ({{reuse}} % aus deiner Version übernommen)',
        verifying: 'Update wird überprüft …',
        ready: 'Update geladen — zum Abschluss neu starten',
        error: 'Suche nach Updates fehlgeschlagen',
        devOnly: 'Updates sind nur in der installierten App verfügbar',
        current: 'Du nutzt Version {{version}}',
        checkAgain: 'Erneut suchen',
        relaunch: 'Neu starten',
        retry: 'Erneut versuchen',
        download: 'Release ansehen'
      }
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
      genre: 'Genre',
      key: 'Tonart',
      camelot: 'Camelot',
      bpm: 'BPM'
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
    analyzeKeyBpm: {
      label: 'Tonart & BPM analysieren',
      description: 'Tonart und Tempo des Tracks schätzen und in die Tags schreiben.',
      fields: {
        detectKey: 'Tonart erkennen (schreibt Tonart + Camelot)',
        detectBpm: 'Tempo erkennen (BPM)',
        minBpm: 'Minimale BPM — untere Grenze für die Tempo-Faltung',
        maxBpm: 'Maximale BPM — obere Grenze für die Tempo-Faltung'
      }
    },
    rename: {
      label: 'Datei umbenennen',
      description: 'Datei anhand der finalen Tags umbenennen.',
      fields: {
        template: 'Dateinamen-Vorlage – Platzhalter: {artist} {track} {title} {album} {year}'
      }
    },
    squareCover: {
      label: 'Cover quadratisch zuschneiden',
      description:
        'Eingebettetes Cover mittig auf ein Quadrat zuschneiden und die längere Seite kürzen.'
    },
    trimSilence: {
      label: 'Stille entfernen',
      description: 'Stille am Anfang und/oder Ende des Titels entfernen.',
      fields: {
        mode: 'Entfernen',
        thresholdDb: 'Stille-Schwelle (dB) — niedriger ist strenger; -90 ≈ echte Stille',
        minDurationSec: 'Mindeststille (Sekunden)'
      },
      modes: {
        both: 'Anfang und Ende',
        start: 'Nur Anfang',
        end: 'Nur Ende',
        none: 'Deaktiviert'
      }
    }
  }
}

export default de
