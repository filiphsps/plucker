import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { arch } from 'node:os'
import { rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { loadSettings, saveSettings, settingsPath, expandHome } from './settings'
import { binaryPaths } from './binaries'
import { runJob } from './pipeline'
import { readCoverDataUrl } from './tagger'
import { addEntry, removeEntry, removeTrack } from './history'
import type { Settings, HistoryEntry } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let abort: AbortController | null = null

function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('app:locale', () => app.getLocale())
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:save', (_e, s: Settings) => saveSettings(settingsPath(), s))
  ipcMain.handle('dialog:chooseFolder', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  // Filesystem navigation + cover art.
  ipcMain.handle('shell:openFolder', (_e, path: string) => shell.openPath(path))
  ipcMain.handle('shell:revealFile', (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.handle('cover:get', (_e, file: string) => readCoverDataUrl(file))

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
  ipcMain.handle('history:removeTrack', (_e, id: string, file: string, deleteFile: boolean) => {
    const s = loadSettings()
    if (deleteFile) rmSync(file, { force: true })
    const history = removeTrack(s.history, id, file)
    saveSettings(settingsPath(), { ...s, history })
    return history
  })

  ipcMain.handle('job:cancel', () => {
    abort?.abort()
  })
  ipcMain.handle('job:start', async (_e, url: string, folderOverride?: string) => {
    const settings = loadSettings()
    const bin = binaryPaths({
      packaged: app.isPackaged,
      arch: arch() === 'arm64' ? 'arm64' : 'x64',
      resourcesPath: process.resourcesPath,
      projectRoot: app.getAppPath()
    })
    abort = new AbortController()
    const result = await runJob(url, {
      bin,
      settings,
      homeBase: expandHome(settings.downloads.baseFolder),
      onProgress: (p) => getWindow()?.webContents.send('job:progress', p),
      signal: abort.signal,
      folderOverride
    })

    // Record to history (re-load fresh so we don't clobber edits made during the run).
    if (result.tracks.length > 0) {
      const entry: HistoryEntry = {
        id: randomUUID(),
        url: result.url,
        title: result.title,
        folder: result.folder,
        kind: result.kind,
        completedAt: new Date().toISOString(),
        tracks: result.tracks
      }
      const fresh = loadSettings()
      saveSettings(settingsPath(), { ...fresh, history: addEntry(fresh.history, entry) })
      getWindow()?.webContents.send('history:changed')
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
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.plucker.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  registerIpc(() => mainWindow)

  createWindow()

  app.on('activate', function () {
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

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
