// i18n strings for the native application menu ("chrome"). These live in src/shared so
// the main process (which builds the menu) and the renderer i18n catalog can both use
// them. The app resolves the menu language to exactly 'en' or 'de' (see
// src/main/menu.ts → resolveLang), so we own every label here — including standard
// role items like Copy/Paste — rather than relying on Electron's per-OS localization,
// which would never apply.
export const menu = {
  en: {
    // app menu
    about: 'About Plucker',
    checkForUpdates: 'Check for Updates…',
    services: 'Services',
    hide: 'Hide Plucker',
    hideOthers: 'Hide Others',
    unhide: 'Show All',
    quit: 'Quit Plucker',
    // File
    file: 'File',
    newDownload: 'New Download',
    openUrl: 'Open URL…',
    manageCache: 'Manage Cache…',
    settings: 'Settings…',
    // Edit
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    // View
    view: 'View',
    download: 'Download',
    history: 'History',
    reload: 'Reload',
    forceReload: 'Force Reload',
    toggleDevTools: 'Toggle Developer Tools',
    toggleConsole: 'Toggle Console',
    enterFullScreen: 'Enter Full Screen',
    // Window
    window: 'Window',
    minimize: 'Minimize',
    zoom: 'Zoom',
    bringAllToFront: 'Bring All to Front',
    // Help
    help: 'Help',
    viewReleases: 'View Releases'
  },
  de: {
    about: 'Über Plucker',
    checkForUpdates: 'Nach Updates suchen …',
    services: 'Dienste',
    hide: 'Plucker ausblenden',
    hideOthers: 'Andere ausblenden',
    unhide: 'Alle einblenden',
    quit: 'Plucker beenden',
    file: 'Datei',
    newDownload: 'Neuer Download',
    openUrl: 'URL öffnen …',
    manageCache: 'Cache verwalten …',
    settings: 'Einstellungen …',
    edit: 'Bearbeiten',
    undo: 'Widerrufen',
    redo: 'Wiederholen',
    cut: 'Ausschneiden',
    copy: 'Kopieren',
    paste: 'Einsetzen',
    selectAll: 'Alles auswählen',
    view: 'Darstellung',
    download: 'Download',
    history: 'Verlauf',
    reload: 'Neu laden',
    forceReload: 'Neu laden (erzwingen)',
    toggleDevTools: 'Entwicklerwerkzeuge ein-/ausblenden',
    toggleConsole: 'Konsole umschalten',
    enterFullScreen: 'Vollbild',
    // Window
    window: 'Fenster',
    minimize: 'Minimieren',
    zoom: 'Zoomen',
    bringAllToFront: 'Alle nach vorne bringen',
    // Help
    help: 'Hilfe',
    viewReleases: 'Releases ansehen'
  }
}

export type MenuLang = keyof typeof menu
export type MenuStrings = (typeof menu)['en']
