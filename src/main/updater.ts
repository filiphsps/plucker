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
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { join } from 'node:path'
import { log } from './log'
import { logPath, loadSettings } from './settings'
import { appBundlePath, installMacUpdate } from './mac-installer'
import { downloadMacUpdate, pickArchZip, type DownloadStatus } from './github-download'
import type { UpdateState } from '../shared/types'

export const RELEASES_URL = 'https://github.com/filiphsps/plucker/releases/latest'

/** How often the background updater checks for a new release. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000
/** Throttle for background auto-downloads (~2 MiB/s). Manual downloads run full-speed. */
const BACKGROUND_THROTTLE_BYTES_PER_SEC = 2 * 1024 * 1024

export type GetWindow = () => BrowserWindow | null

let wired = false
/** Path of the downloaded update zip, set once a download completes; armed for install-on-quit. */
let pendingZipPath: string | null = null
/** Most recent check result, so the download path can read the expected SHA-512. */
let lastUpdateInfo: UpdateInfo | null = null
/** Guard so the UI and the background ticker never download the same update twice. */
let downloading = false
/** The background check interval, if started. */
let backgroundTimer: ReturnType<typeof setInterval> | null = null

const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** Push the authoritative update state to the renderer so an open About card reflects it. */
function broadcast(getWindow: GetWindow, state: UpdateState): void {
  getWindow()?.webContents.send('updates:state', state)
}

/** Where the previous update zip + blockmap are cached as a differential diff base. */
function updateCacheDir(): string {
  return join(app.getPath('userData'), 'update-cache')
}

/**
 * The expected SHA-512 (base64) of the arch-matching update zip, read from the
 * checked release's file list. Reuses `pickArchZip`'s name-matching so it tracks
 * the same asset the downloader picks. Undefined when unavailable.
 */
function expectedSha512(info: UpdateInfo | null, arch: string): string | undefined {
  const files = info?.files ?? []
  const picked = pickArchZip(
    files.map((f) => ({ name: f.url, browser_download_url: f.url, size: f.size ?? 0 })),
    arch
  )
  return picked ? files.find((f) => f.url === picked.name)?.sha512 : undefined
}

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
 * Squirrel.Mac and fail the unsigned-app signature check). Uses a differential
 * download (reusing the cached previous zip) when possible, falling back to a
 * full download — see `downloadMacUpdate`.
 */
function downloadUpdateZip(
  onProgress: (percent: number) => void,
  onStatus?: (status: DownloadStatus) => void,
  throttleBytesPerSec = 0
): Promise<string> {
  return downloadMacUpdate({
    destDir: app.getPath('temp'),
    cacheDir: updateCacheDir(),
    arch: process.arch,
    expectedSha512: expectedSha512(lastUpdateInfo, process.arch),
    throttleBytesPerSec,
    onProgress,
    onStatus
  })
}

/**
 * Download the update zip once, broadcasting progress + phase to the renderer and
 * arming `pendingZipPath` for install. Shared by the UI button (full speed) and the
 * background ticker (throttled). Returns the final state; never downloads twice.
 */
async function runDownload(
  getWindow: GetWindow,
  throttleBytesPerSec: number
): Promise<UpdateState> {
  const currentVersion = app.getVersion()
  if (!canSelfInstall()) {
    log.info('app', 'download requested but this build cannot self-install; skipping')
    return { phase: 'available', currentVersion, canSelfInstall: false }
  }
  if (pendingZipPath) {
    log.info('app', 'download requested but an update is already staged; reusing it')
    return { phase: 'ready', currentVersion, canSelfInstall: true }
  }
  if (downloading) {
    log.info('app', 'download requested but one is already in progress; ignoring')
    return { phase: 'downloading', currentVersion, percent: 0, canSelfInstall: true }
  }

  downloading = true
  const mode =
    throttleBytesPerSec > 0
      ? `throttled to ${Math.round(throttleBytesPerSec / 1024)} KiB/s`
      : 'full speed'
  log.info('app', `downloading update ${lastUpdateInfo?.version ?? ''} (${mode})…`)
  broadcast(getWindow, { phase: 'downloading', currentVersion, percent: 0, canSelfInstall: true })
  // Reuse % from a differential download, surfaced in the ticker once known.
  let reusePercent: number | undefined
  let lastLogged = -1
  try {
    pendingZipPath = await downloadUpdateZip(
      (percent) => {
        getWindow()?.webContents.send('updates:progress', percent)
        broadcast(getWindow, {
          phase: 'downloading',
          currentVersion,
          percent,
          reusePercent,
          canSelfInstall: true
        })
        // Log every 10% so progress is traceable without flooding the log.
        if (percent >= lastLogged + 10) {
          lastLogged = percent - (percent % 10)
          log.info('app', `update download ${percent}%`)
        }
      },
      (status) => {
        if (status.phase === 'downloading') {
          reusePercent = status.reusePercent
          broadcast(getWindow, {
            phase: 'downloading',
            currentVersion,
            percent: 0,
            reusePercent,
            canSelfInstall: true
          })
        } else {
          broadcast(getWindow, { phase: 'verifying', currentVersion, canSelfInstall: true })
        }
      },
      throttleBytesPerSec
    )
    log.info('app', `update downloaded to ${pendingZipPath}; ready to install`)
    const ready: UpdateState = { phase: 'ready', currentVersion, canSelfInstall: true }
    broadcast(getWindow, ready)
    return ready
  } catch (err) {
    log.error('app', 'update download failed:', err)
    const failed: UpdateState = {
      phase: 'error',
      currentVersion,
      error: errMsg(err),
      canSelfInstall: true
    }
    broadcast(getWindow, failed)
    return failed
  } finally {
    downloading = false
  }
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
    if (result?.updateInfo) lastUpdateInfo = result.updateInfo
    if (!result || !result.isUpdateAvailable) {
      log.info('app', `update check: up to date (${currentVersion})`)
      return { phase: 'upToDate', currentVersion, canSelfInstall: self }
    }
    log.info(
      'app',
      `update check: ${result.updateInfo.version} available (on ${currentVersion}, canSelfInstall=${self})`
    )
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
  // Consume the staged update so `before-quit` doesn't stage a second swap.
  pendingZipPath = null
  app.quit()
  return true
}

/** Wire the renderer-facing update IPC: check / download / install + progress stream. */
export function registerUpdaterIpc(getWindow: GetWindow): void {
  ensureWired()
  ipcMain.handle('updates:check', () => checkForUpdatesUi())
  // User-initiated download runs at full speed (background ticks throttle instead).
  ipcMain.handle('updates:download', () => runDownload(getWindow, 0))
  ipcMain.handle('updates:install', () => installUpdateUi())
}

// ---------------------------------------------------------------------------
// Background auto-updater: check every 15 minutes, auto-download (throttled) any
// available update, and arm it to install when the app next quits.
// ---------------------------------------------------------------------------

/**
 * One background pass: silently check, and if a self-installable update is found
 * (and not already downloaded / downloading), start a throttled background download.
 * Never throws; failures are logged and retried on the next tick.
 */
async function backgroundTick(getWindow: GetWindow): Promise<void> {
  if (!canSelfInstall()) {
    log.info('app', 'background update tick skipped: build cannot self-install')
    return
  }
  if (pendingZipPath) {
    log.info('app', 'background update tick skipped: an update is already staged for install')
    return
  }
  if (downloading) {
    log.info('app', 'background update tick skipped: a download is already in progress')
    return
  }
  log.info('app', 'background update tick: checking for updates')
  broadcast(getWindow, {
    phase: 'checking',
    currentVersion: app.getVersion(),
    canSelfInstall: true
  })
  const state = await checkForUpdatesUi()
  broadcast(getWindow, state)
  if (state.phase === 'available' && state.canSelfInstall) {
    log.info('app', `background update tick: ${state.newVersion} available, starting download`)
    await runDownload(getWindow, BACKGROUND_THROTTLE_BYTES_PER_SEC)
  }
}

/**
 * Start the background updater: an initial check shortly after launch, then every
 * 15 minutes. Respects the user's "check on launch" setting as the master switch
 * (re-read each tick, so toggling it takes effect without a restart) and only runs
 * on a packaged macOS build that can self-install. Idempotent.
 */
export function startBackgroundUpdates(getWindow: GetWindow): void {
  if (backgroundTimer) {
    log.info('app', 'background updater already running')
    return
  }
  if (!canSelfInstall()) {
    log.info('app', 'background updater not started: build cannot self-install (dev or non-macOS)')
    return
  }
  ensureWired()
  const tick = (): void => {
    if (!loadSettings().updates.checkOnLaunch) {
      log.info('app', 'background update tick skipped: automatic updates disabled in settings')
      return
    }
    void backgroundTick(getWindow)
  }
  log.info('app', `background updater started: checking every ${CHECK_INTERVAL_MS / 60000} min`)
  setTimeout(tick, 3000)
  backgroundTimer = setInterval(tick, CHECK_INTERVAL_MS)
}

/**
 * If an update has finished downloading, stage an install-on-quit: swap the bundle
 * in place after this process exits, *without* relaunching (the user is closing the
 * app). Returns true when an install was staged. Call from `before-quit`.
 */
export function installPendingUpdateOnQuit(): boolean {
  const bundlePath = appBundlePath(app.getPath('exe'))
  if (!pendingZipPath || !bundlePath) return false
  log.info('app', 'installing pending update on quit (no relaunch)')
  installMacUpdate({
    zipPath: pendingZipPath,
    bundlePath,
    pid: process.pid,
    logPath: logPath(),
    scriptDir: app.getPath('temp'),
    relaunch: false
  })
  return true
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
      // Always leave a working escape hatch: a failed self-install should still let
      // the user grab the build manually rather than dead-end on an OK button.
      const { response } = await notify(getWindow, {
        type: 'error',
        buttons: ['View Release', 'OK'],
        defaultId: 0,
        cancelId: 1,
        message: 'Update download failed',
        detail: err instanceof Error ? err.message : String(err)
      })
      if (response === 0) await shell.openExternal(RELEASES_URL)
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
    if (result?.updateInfo) lastUpdateInfo = result.updateInfo
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
