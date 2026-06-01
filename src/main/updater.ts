// Notify-only auto-update. Plucker ships unsigned, so Squirrel.Mac cannot apply
// updates in place — instead we check GitHub releases (via electron-updater, which
// reads the bundled app-update.yml) and, when a newer version exists, point the user
// at the releases page to download it manually. Nothing is ever downloaded or installed.
import { app, dialog, shell, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

export const RELEASES_URL = 'https://github.com/filiphsps/plucker/releases/latest'

export type GetWindow = () => BrowserWindow | null

let wired = false

/** Wire the one-time `update-available` listener that shows the notify dialog. */
function ensureWired(getWindow: GetWindow): void {
  if (wired) return
  wired = true

  // Notify only: never download, never auto-install on quit.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', async (info) => {
    const win = getWindow()
    const opts: Electron.MessageBoxOptions = {
      type: 'info',
      buttons: ['View Release', 'Later'],
      defaultId: 0,
      cancelId: 1,
      message: `Plucker ${info.version} is available`,
      detail: `You're on ${app.getVersion()}. Open the releases page to download the latest version.`
    }
    const { response } = win
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts)
    if (response === 0) await shell.openExternal(RELEASES_URL)
  })
}

function notify(getWindow: GetWindow, opts: Electron.MessageBoxOptions): void {
  const win = getWindow()
  if (win) dialog.showMessageBox(win, opts)
  else dialog.showMessageBox(opts)
}

/**
 * Check GitHub releases for a newer version.
 * - `silent: true` (launch check) stays quiet unless an update is found.
 * - `silent: false` (manual "Check for Updates…") also reports "up to date" / errors.
 * The `update-available` dialog fires in both modes via the wired listener.
 */
export async function checkForUpdates(
  getWindow: GetWindow,
  { silent }: { silent: boolean }
): Promise<void> {
  // electron-updater needs the bundled app-update.yml, which only exists in a packaged
  // build. In dev there's nothing to check against.
  if (!app.isPackaged) {
    if (!silent) {
      notify(getWindow, {
        type: 'info',
        buttons: ['OK'],
        message: 'Updates unavailable in development',
        detail: 'Update checks only run in the installed app.'
      })
    }
    return
  }

  ensureWired(getWindow)
  try {
    const result = await autoUpdater.checkForUpdates()
    if (!silent && result && !result.isUpdateAvailable) {
      notify(getWindow, {
        type: 'info',
        buttons: ['OK'],
        message: "You're up to date",
        detail: `Plucker ${app.getVersion()} is the latest version.`
      })
    }
  } catch (err) {
    if (silent) {
      console.error('Update check failed:', err)
      return
    }
    notify(getWindow, {
      type: 'error',
      buttons: ['OK'],
      message: 'Update check failed',
      detail: err instanceof Error ? err.message : String(err)
    })
  }
}
