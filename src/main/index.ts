import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { arch } from 'node:os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { loadSettings, saveSettings, settingsPath, expandHome } from './settings'
import { binaryPaths } from './binaries'
import { runJob } from './pipeline'
import type { Settings } from '../shared/types'

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
  ipcMain.handle('job:cancel', () => {
    abort?.abort()
  })
  ipcMain.handle('job:start', async (_e, url: string) => {
    const settings = loadSettings()
    const bin = binaryPaths({
      packaged: app.isPackaged,
      arch: arch() === 'arm64' ? 'arm64' : 'x64',
      resourcesPath: process.resourcesPath,
      projectRoot: app.getAppPath()
    })
    abort = new AbortController()
    await runJob(url, {
      bin,
      settings,
      homeBase: expandHome(settings.downloads.baseFolder),
      onProgress: (p) => getWindow()?.webContents.send('job:progress', p),
      signal: abort.signal
    })
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
  electronApp.setAppUserModelId('com.electron')

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
