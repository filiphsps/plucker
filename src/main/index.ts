import { app, shell, BrowserWindow, ipcMain, dialog, systemPreferences } from 'electron'
import { join } from 'path'
import { arch } from 'node:os'
import { rmSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { version as appVersion } from '../../package.json'
import icon from '../../resources/icon.png?asset'
import {
  loadSettings,
  saveSettings,
  settingsPath,
  expandHome,
  logPath,
  migrateLegacyConfig
} from './settings'
import { log, addLogTransport, getLogTail } from './log'
import { createFileTransport } from './log-file'
import { binaryPaths, type BinaryPaths } from './binaries'
import { runJob } from './pipeline'
import { getCatalog } from './transforms/registry'
import { readCoverDataUrl, writeTrackTags } from './tagger'
import { getTrackMetadata, forBinaries } from './metadata'
import { addEntry, removeEntry, removeTrack } from './history'
import { killAllChildren } from './spawn'
import { checkForUpdates, registerUpdaterIpc } from './updater'
import { buildAppMenu } from './menu'
import { getAccentColor } from './accent'
import { createMetadataCache, type MetadataCache, type CacheRecord } from './metadata-cache'
import type { Settings, HistoryEntry, CachedTrack, TrackTags } from '../shared/types'

// Set the app name as early as possible so the macOS app menu + About panel
// (built when the app becomes ready) read "Plucker" instead of "Electron".
app.setName('Plucker')

let mainWindow: BrowserWindow | null = null
let abort: AbortController | null = null
let metaCache: MetadataCache | null = null

/** Resolve the bundled binary paths for the current runtime. */
function currentBin(): BinaryPaths {
  return binaryPaths({
    packaged: app.isPackaged,
    arch: arch() === 'arm64' ? 'arm64' : 'x64',
    resourcesPath: process.resourcesPath,
    projectRoot: app.getAppPath()
  })
}

/** Lazily-created global metadata cache under the app's userData dir. */
function getMetaCache(): MetadataCache {
  if (!metaCache) metaCache = createMetadataCache(join(app.getPath('userData'), 'metadata-cache'))
  return metaCache
}

// Console logging (file + live IPC stream) is a developer feature: on in dev, and
// otherwise gated behind the `developer.console` setting. We attach/detach the
// transports as the setting changes so a normal user gets no log file at all.
let detachFileLog: (() => void) | null = null
let detachIpcLog: (() => void) | null = null

function applyConsoleLogging(getWindow: () => BrowserWindow | null): void {
  const enabled = !app.isPackaged || loadSettings().developer.console
  if (enabled && !detachIpcLog) {
    detachIpcLog = addLogTransport((e) => getWindow()?.webContents.send('log:line', e))
  } else if (!enabled && detachIpcLog) {
    detachIpcLog()
    detachIpcLog = null
  }
  if (enabled && !detachFileLog) {
    detachFileLog = addLogTransport(createFileTransport(logPath()))
  } else if (!enabled && detachFileLog) {
    detachFileLog()
    detachFileLog = null
  }
}

function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('app:locale', () => app.getLocale())
  ipcMain.handle('accent:get', () => getAccentColor())
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:save', (_e, s: Settings) => {
    saveSettings(settingsPath(), s)
    // Re-evaluate console logging (the developer flag may have flipped) and let the
    // renderer react live (show/hide the console button).
    applyConsoleLogging(getWindow)
    getWindow()?.webContents.send('settings:changed', s)
  })
  // Developer console: buffered tail (seeds the overlay on open) + reveal the log file.
  ipcMain.handle('log:tail', () => getLogTail())
  ipcMain.handle('log:reveal', () => shell.showItemInFolder(logPath()))
  ipcMain.handle('transforms:catalog', () => getCatalog())
  ipcMain.handle('dialog:chooseFolder', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  // Filesystem navigation + cover art.
  ipcMain.handle('shell:openFolder', (_e, path: string) => shell.openPath(path))
  ipcMain.handle('shell:revealFile', (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))
  ipcMain.handle('cover:get', (_e, file: string) => readCoverDataUrl(file))

  // Track metadata (tags + technical audio, cache-first) and file-existence checks.
  ipcMain.handle('metadata:get', (_e, file: string, hash?: string) =>
    getTrackMetadata(file, hash, forBinaries(currentBin(), getMetaCache()))
  )
  ipcMain.handle('files:exist', (_e, paths: string[]) => paths.map((p) => existsSync(p)))

  // Metadata cache manager.
  const toCachedTrack = (r: CacheRecord): CachedTrack => ({
    ...r,
    fileExists: !!r.track?.file && existsSync(r.track.file)
  })
  const listCache = (): CachedTrack[] =>
    getMetaCache()
      .list()
      .map(toCachedTrack)
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))

  ipcMain.handle('cache:list', () => listCache())
  ipcMain.handle('cache:cover', (_e, hash: string) => {
    const buf = getMetaCache().readCover(hash)
    return buf ? `data:image/jpeg;base64,${buf.toString('base64')}` : null
  })
  ipcMain.handle('cache:update', (_e, hash: string, mb: TrackTags) => {
    const cache = getMetaCache()
    cache.update(hash, mb)
    // Also rewrite the library file's ID3 tags when it still exists.
    const file = cache.read(hash)?.track?.file
    if (file && existsSync(file)) {
      try {
        writeTrackTags(file, mb)
      } catch {
        /* non-mp3 / unwritable — cache is still updated */
      }
    }
    return listCache()
  })
  ipcMain.handle('cache:delete', (_e, hash: string) => {
    getMetaCache().remove(hash)
    return listCache()
  })
  ipcMain.handle('cache:clear', () => {
    getMetaCache().clear()
    return listCache()
  })

  // History.
  ipcMain.handle('history:get', () => loadSettings().history)
  ipcMain.handle('history:removeEntry', (_e, id: string, deleteFiles: boolean) => {
    const s = loadSettings()
    if (deleteFiles) {
      const entry = s.history.find((h) => h.id === id)
      if (entry?.folder) rmSync(entry.folder, { recursive: true, force: true })
    }
    const history = removeEntry(s.history, id)
    saveSettings(settingsPath(), { ...s, history })
    return history
  })
  ipcMain.handle('history:removeTrack', (_e, id: string, index: number, deleteFile: boolean) => {
    const s = loadSettings()
    if (deleteFile) {
      const file = s.history.find((h) => h.id === id)?.tracks[index]?.file
      if (file) rmSync(file, { force: true })
    }
    const history = removeTrack(s.history, id, index)
    saveSettings(settingsPath(), { ...s, history })
    return history
  })

  ipcMain.handle('job:cancel', () => {
    abort?.abort()
  })
  ipcMain.handle('job:start', async (_e, url: string, folderOverride?: string) => {
    const settings = loadSettings()
    abort = new AbortController()
    try {
      const result = await runJob(url, {
        bin: currentBin(),
        settings,
        homeBase: expandHome(settings.downloads.baseFolder),
        cache: getMetaCache(),
        onProgress: (p) => {
          const win = getWindow()
          win?.webContents.send('job:progress', p)
          win?.setProgressBar(p.overall > 0 && p.overall < 1 ? p.overall : p.overall >= 1 ? 1 : -1)
        },
        onStatus: (s) => getWindow()?.webContents.send('job:status', s),
        signal: abort.signal,
        folderOverride
      })
      getWindow()?.setProgressBar(-1)

      // Record every resolved job — including all-failed and cancelled ones —
      // so the user always sees the outcome. (Re-load fresh so we don't clobber
      // edits made during the run.)
      const entry: HistoryEntry = {
        id: randomUUID(),
        url: result.url,
        title: result.title,
        folder: result.folder,
        kind: result.kind,
        completedAt: new Date().toISOString(),
        outcome: result.outcome,
        tracks: result.tracks
      }
      const fresh = loadSettings()
      saveSettings(settingsPath(), { ...fresh, history: addEntry(fresh.history, entry) })
      getWindow()?.webContents.send('history:changed')
    } catch (err) {
      getWindow()?.setProgressBar(-1)
      const cancelled = abort?.signal.aborted ?? false
      const message = err instanceof Error ? err.message : String(err)

      // The job threw before producing a result — typically resolution failed
      // (bad URL, yt-dlp error). Record a minimal failed/cancelled entry so the
      // attempt is still visible in history.
      const fresh = loadSettings()
      const entry: HistoryEntry = {
        id: randomUUID(),
        url,
        title: url,
        folder: folderOverride ?? expandHome(fresh.downloads.baseFolder),
        kind: 'video',
        completedAt: new Date().toISOString(),
        outcome: cancelled ? 'cancelled' : 'failed',
        reason: message,
        tracks: []
      }
      saveSettings(settingsPath(), { ...fresh, history: addEntry(fresh.history, entry) })
      getWindow()?.webContents.send('history:changed')

      // Don't flash a red error panel for a deliberate cancellation.
      if (!cancelled) {
        log.error('app', message)
        getWindow()?.webContents.send('job:status', { phase: 'error', error: message })
      } else {
        log.info('app', 'job cancelled')
      }
      throw err
    }
  })
}

function createWindow(): void {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    // Custom frame: hide the OS title bar but keep the real macOS traffic lights,
    // positioned to sit centered in our 48px toolbar. Our toolbar is the drag region.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 19, y: 15 } }
      : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    // Set title to app name.
    title: app.getName()
  })
  mainWindow = win

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Relocate the legacy ~/.plucker.json config into ~/.plucker/config.json before any
  // settings read, so existing installs carry their settings over transparently.
  migrateLegacyConfig()

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.plucker.app')

  // macOS "About Plucker" panel details.
  app.setAboutPanelOptions({
    applicationName: 'Plucker',
    applicationVersion: appVersion,
    copyright: '© 2026 Filiph Sandström',
    credits: 'Download YouTube playlists as tagged MP3s'
  })

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  registerIpc(() => mainWindow)
  registerUpdaterIpc(() => mainWindow)

  // Push OS accent-color changes to the renderer so --color-accent updates live.
  systemPreferences.subscribeNotification?.('AppleColorPreferencesChangedNotification', () =>
    mainWindow?.webContents.send('accent:changed', getAccentColor())
  )

  buildAppMenu(() => mainWindow)

  createWindow()

  // Attach the file + live-stream log transports if the console is enabled.
  applyConsoleLogging(() => mainWindow)
  log.info('app', `Plucker ${appVersion} ready`)

  // Notify-only update check shortly after launch (opt-out via settings).
  if (loadSettings().updates.checkOnLaunch) {
    setTimeout(() => void checkForUpdates(() => mainWindow, { silent: true }), 3000)
  }

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Force-kill any in-flight yt-dlp/ffmpeg subprocesses when the app exits, so a
// download in progress can never leave orphaned processes running afterwards.
app.on('before-quit', () => {
  abort?.abort()
  killAllChildren()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
