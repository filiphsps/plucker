/**
 * Electron accelerator strings for app commands, defined once and shared between the
 * native menu (which binds them) and the renderer (which displays them as hints), so a
 * keyboard-shortcut label in the UI can never drift away from the binding that's live.
 */
export const ACCELERATORS = {
  toggleConsole: 'CmdOrCtrl+J',
  newDownload: 'CmdOrCtrl+N',
  openUrl: 'CmdOrCtrl+Shift+N',
  retransform: 'CmdOrCtrl+Shift+R'
} as const

export type AcceleratorName = keyof typeof ACCELERATORS
