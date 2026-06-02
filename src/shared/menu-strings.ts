// i18n strings for the native application menu ("chrome"). These live in src/shared so
// the main process (which builds the menu) and the renderer i18n catalog can both use
// them. Standard role-based menus (Edit/View/Window and their items) are provided and
// localized by Electron itself, so only our custom items need keys here.
//
// The main process has no i18next runtime; it resolves these directly (see
// src/main/menu.ts). The renderer merges them into its catalog under the `menu` key.
export const menu = {
  en: {
    settings: 'Settings…',
    checkForUpdates: 'Check for Updates…',
    viewReleases: 'View Releases',
    go: 'Go',
    download: 'Download',
    history: 'History',
    retransformSelection: 'Re-run Transforms on Selection',
    toggleConsole: 'Toggle Console'
  },
  de: {
    settings: 'Einstellungen …',
    checkForUpdates: 'Nach Updates suchen …',
    viewReleases: 'Releases ansehen',
    go: 'Gehe zu',
    download: 'Download',
    history: 'Verlauf',
    retransformSelection: 'Transformationen für Auswahl erneut ausführen',
    toggleConsole: 'Konsole umschalten'
  }
}

export type MenuLang = keyof typeof menu
