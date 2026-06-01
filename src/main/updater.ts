// Self-update for an unsigned macOS app.
//
// electron-updater does the *check* only (reading the bundled app-update.yml /
// latest-mac.yml to detect a newer release). We deliberately do NOT use its
// download path: electron-updater's MacUpdater hands the download to native
// Squirrel.Mac, which validates the *running* app's Developer ID signature and
// throws "Could not get code signature for running application" on an unsigned
// build. Instead we fetch the per-arch `.zip` straight from the GitHub release
// (see github-download.ts) and install it ourselves (see mac-installer.ts): swap
// the running `.app` bundle in place and relaunch. No signature is ever verified.
//
// On other platforms we stay notify-only: point the user at the releases page to download
// manually. Nothing is auto-installed there.
import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { log } from './log'
import { logPath } from './settings'
import { appBundlePath, installMacUpdate } from './mac-installer'
import { downloadLatestMacZip } from './github-download'
import type { UpdateState } from '../shared/types'

export const RELEASES_URL = 'https://github.com/filiphsps/plucker/releases/latest'

export type GetWindow = () => BrowserWindow | null

let wired = false
/** Path of the downloaded update zip, set by a successful `downloadUpdateForUi()`. */
let pendingZipPath: string | null = null

const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** Whether this build can install an update itself (a packaged macOS .app bundle). */
function canSelfInstall(): boolean {
  return (
    app.isPackaged && process.platform === 'darwin' && appBundlePath(app.getPath('exe')) != null
  )
}

/** One-time updater configuration: never let electron-updater auto-install (we do it). */
function ensureWired(): void {
  if (wired) return
  wired = true

  // We only use electron-updater for the check, never its download/install path.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = null

  autoUpdater.on('error', (err) => {
    log.error('app', 'updater error:', err)
  })
}

function notify(
  getWindow: GetWindow,
  opts: Electron.MessageBoxOptions
): Promise<Electron.MessageBoxReturnValue> {
  const win = getWindow()
  return win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)
}

/**
 * Download the per-arch update zip straight from the GitHub release and resolve its
 * on-disk path. Bypasses electron-updater's download path (which would invoke
 * Squirrel.Mac and fail the unsigned-app signature check).
 */
function downloadUpdateZip(onProgress?: (percent: number) => void): Promise<string> {
  return downloadLatestMacZip({
    destDir: app.getPath('temp'),
    arch: process.arch,
    onProgress
  })
}

// ---------------------------------------------------------------------------
// Programmatic API for the Chrome-style About card (no dialogs — the renderer
// drives the UI). The menu/launch dialog flow above is left untouched.
// ---------------------------------------------------------------------------

/** Run a check and report the result as an `UpdateState` (never throws). */
async function checkForUpdatesUi(): Promise<UpdateState> {
  const currentVersion = app.getVersion()
  const self = canSelfInstall()
  if (!app.isPackaged) {
    return { phase: 'unsupported', currentVersion, canSelfInstall: false }
  }
  ensureWired()
  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result || !result.isUpdateAvailable) {
      return { phase: 'upToDate', currentVersion, canSelfInstall: self }
    }
    return {
      phase: 'available',
      currentVersion,
      newVersion: result.updateInfo.version,
      canSelfInstall: self
    }
  } catch (err) {
    log.error('app', 'update check failed:', err)
    return { phase: 'error', currentVersion, error: errMsg(err), canSelfInstall: self }
  }
}

/** Download the update zip (macOS) and stash its path for `installUpdateUi()`. */
async function downloadUpdateForUi(onProgress?: (percent: number) => void): Promise<UpdateState> {
  const currentVersion = app.getVersion()
  if (!canSelfInstall()) {
    return { phase: 'available', currentVersion, canSelfInstall: false }
  }
  try {
    pendingZipPath = await downloadUpdateZip(onProgress)
    log.info('app', 'update downloaded, ready to install')
    return { phase: 'ready', currentVersion, canSelfInstall: true }
  } catch (err) {
    log.error('app', 'update download failed:', err)
    return { phase: 'error', currentVersion, error: errMsg(err), canSelfInstall: true }
  }
}

/** Swap in the downloaded update and relaunch. Returns false if nothing is staged. */
function installUpdateUi(): boolean {
  const bundlePath = appBundlePath(app.getPath('exe'))
  if (!pendingZipPath || !bundlePath) return false
  log.info('app', 'installing downloaded update and restarting')
  installMacUpdate({
    zipPath: pendingZipPath,
    bundlePath,
    pid: process.pid,
    logPath: logPath(),
    scriptDir: app.getPath('temp')
  })
  app.quit()
  return true
}

/** Wire the renderer-facing update IPC: check / download / install + progress stream. */
export function registerUpdaterIpc(getWindow: GetWindow): void {
  ensureWired()
  ipcMain.handle('updates:check', () => checkForUpdatesUi())
  ipcMain.handle('updates:download', () =>
    downloadUpdateForUi((percent) => getWindow()?.webContents.send('updates:progress', percent))
  )
  ipcMain.handle('updates:install', () => installUpdateUi())
}

/**
 * macOS: download the update zip, then offer to install & restart. The install replaces
 * the running `.app` bundle ourselves (no Squirrel, no signature check) and relaunches.
 */
async function downloadAndOfferInstall(
  getWindow: GetWindow,
  version: string,
  silent: boolean
): Promise<void> {
  const bundlePath = appBundlePath(app.getPath('exe'))
  if (!bundlePath) {
    // Not running from an .app bundle — fall back to the manual download path.
    await offerOpenReleases(getWindow, version)
    return
  }

  log.info('app', `downloading Plucker ${version}…`)
  let zipPath: string
  try {
    zipPath = await downloadUpdateZip((percent) => {
      log.info('app', `update download ${percent}%`)
    })
  } catch (err) {
    log.error('app', 'update download failed:', err)
    if (!silent) {
      await notify(getWindow, {
        type: 'error',
        buttons: ['OK'],
        message: 'Update download failed',
        detail: err instanceof Error ? err.message : String(err)
      })
    }
    return
  }

  const { response } = await notify(getWindow, {
    type: 'info',
    buttons: ['Install & Restart', 'Later'],
    defaultId: 0,
    cancelId: 1,
    message: `Plucker ${version} is ready to install`,
    detail: `You're on ${app.getVersion()}. Plucker will replace itself and restart.`
  })
  if (response !== 0) return

  log.info('app', `installing Plucker ${version} and restarting`)
  installMacUpdate({
    zipPath,
    bundlePath,
    pid: process.pid,
    logPath: logPath(),
    scriptDir: app.getPath('temp')
  })
  // The detached script waits for us to exit, then swaps the bundle and relaunches.
  app.quit()
}

/** Non-macOS / non-bundle fallback: open the releases page for a manual download. */
async function offerOpenReleases(getWindow: GetWindow, version: string): Promise<void> {
  const { response } = await notify(getWindow, {
    type: 'info',
    buttons: ['View Release', 'Later'],
    defaultId: 0,
    cancelId: 1,
    message: `Plucker ${version} is available`,
    detail: `You're on ${app.getVersion()}. Open the releases page to download the latest version.`
  })
  if (response === 0) await shell.openExternal(RELEASES_URL)
}

/**
 * Check GitHub releases for a newer version.
 * - `silent: true` (launch check) stays quiet unless an update is found.
 * - `silent: false` (manual "Check for Updates…") also reports "up to date" / errors.
 * When an update exists, macOS downloads + offers in-place install; other platforms
 * open the releases page.
 */
export async function checkForUpdates(
  getWindow: GetWindow,
  { silent }: { silent: boolean }
): Promise<void> {
  // electron-updater needs the bundled app-update.yml, which only exists in a packaged
  // build. In dev there's nothing to check against.
  if (!app.isPackaged) {
    if (!silent) {
      await notify(getWindow, {
        type: 'info',
        buttons: ['OK'],
        message: 'Updates unavailable in development',
        detail: 'Update checks only run in the installed app.'
      })
    }
    return
  }

  ensureWired()
  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result || !result.isUpdateAvailable) {
      if (!silent) {
        await notify(getWindow, {
          type: 'info',
          buttons: ['OK'],
          message: "You're up to date",
          detail: `Plucker ${app.getVersion()} is the latest version.`
        })
      }
      return
    }

    const version = result.updateInfo.version
    if (process.platform === 'darwin') {
      await downloadAndOfferInstall(getWindow, version, silent)
    } else {
      await offerOpenReleases(getWindow, version)
    }
  } catch (err) {
    if (silent) {
      log.error('app', 'update check failed:', err)
      return
    }
    await notify(getWindow, {
      type: 'error',
      buttons: ['OK'],
      message: 'Update check failed',
      detail: err instanceof Error ? err.message : String(err)
    })
  }
}
