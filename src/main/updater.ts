// Self-update for an unsigned macOS app.
//
// electron-updater does the *check* and *download* (reading the bundled app-update.yml /
// latest-mac.yml and fetching the per-arch `.zip` from GitHub releases), but its install
// path hands the zip to native Squirrel.Mac — which hard-requires a valid Developer ID
// signature. Plucker ships unsigned, so on macOS we install the downloaded zip ourselves
// (see mac-installer.ts): swap the running `.app` bundle in place and relaunch. No signature
// is verified because Squirrel never touches the update.
//
// On other platforms we stay notify-only: point the user at the releases page to download
// manually. Nothing is auto-installed there.
import { app, dialog, shell, type BrowserWindow } from 'electron'
import { autoUpdater, type UpdateDownloadedEvent } from 'electron-updater'
import { log } from './log'
import { logPath } from './settings'
import { appBundlePath, installMacUpdate } from './mac-installer'

export const RELEASES_URL = 'https://github.com/filiphsps/plucker/releases/latest'

export type GetWindow = () => BrowserWindow | null

let wired = false

/** One-time updater configuration: never let electron-updater auto-install (we do it). */
function ensureWired(): void {
  if (wired) return
  wired = true

  // We drive download + install manually, so disable every automatic behaviour.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = null

  autoUpdater.on('download-progress', (p) => {
    log.info('app', `update download ${Math.round(p.percent)}%`)
  })
  autoUpdater.on('error', (err) => {
    log.error('app', `updater error: ${err instanceof Error ? err.message : String(err)}`)
  })
}

function notify(
  getWindow: GetWindow,
  opts: Electron.MessageBoxOptions
): Promise<Electron.MessageBoxReturnValue> {
  const win = getWindow()
  return win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)
}

/** Download the per-arch update zip via electron-updater and resolve its on-disk path. */
function downloadUpdateZip(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const onDownloaded = (e: UpdateDownloadedEvent): void => {
      autoUpdater.removeListener('error', onError)
      resolve(e.downloadedFile)
    }
    const onError = (err: Error): void => {
      autoUpdater.removeListener('update-downloaded', onDownloaded)
      reject(err)
    }
    autoUpdater.once('update-downloaded', onDownloaded)
    autoUpdater.once('error', onError)
    autoUpdater.downloadUpdate().catch(onError)
  })
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
    zipPath = await downloadUpdateZip()
  } catch (err) {
    log.error('app', `update download failed: ${err instanceof Error ? err.message : String(err)}`)
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
      log.error('app', `update check failed: ${err instanceof Error ? err.message : String(err)}`)
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
