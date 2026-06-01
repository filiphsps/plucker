import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  Settings,
  JobProgress,
  JobStatus,
  HistoryEntry,
  MenuNavTarget,
  TrackMetadata,
  CachedTrack,
  TrackTags
} from '../shared/types'
import type { TransformManifest } from '../shared/transforms'

// Custom APIs for renderer
const api = {
  getSystemLocale: (): Promise<string> => ipcRenderer.invoke('app:locale'),
  getAccentColor: (): Promise<string> => ipcRenderer.invoke('accent:get'),
  onAccentChanged: (cb: (hex: string) => void): (() => void) => {
    const fn = (_: unknown, hex: string): void => cb(hex)
    ipcRenderer.on('accent:changed', fn)
    return () => ipcRenderer.removeListener('accent:changed', fn)
  },
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (s: Settings): Promise<void> => ipcRenderer.invoke('settings:save', s),
  getTransformCatalog: (): Promise<TransformManifest[]> => ipcRenderer.invoke('transforms:catalog'),
  chooseFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:chooseFolder'),
  startDownload: (url: string, folderOverride?: string): Promise<void> =>
    ipcRenderer.invoke('job:start', url, folderOverride),
  cancel: (): Promise<void> => ipcRenderer.invoke('job:cancel'),
  onProgress: (cb: (p: JobProgress) => void): (() => void) => {
    const fn = (_: unknown, p: JobProgress): void => cb(p)
    ipcRenderer.on('job:progress', fn)
    return () => ipcRenderer.removeListener('job:progress', fn)
  },
  onStatus: (cb: (s: JobStatus) => void): (() => void) => {
    const fn = (_: unknown, s: JobStatus): void => cb(s)
    ipcRenderer.on('job:status', fn)
    return () => ipcRenderer.removeListener('job:status', fn)
  },
  // Filesystem navigation + cover art
  openFolder: (path: string): Promise<string> => ipcRenderer.invoke('shell:openFolder', path),
  revealFile: (path: string): Promise<void> => ipcRenderer.invoke('shell:revealFile', path),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  getCover: (file: string): Promise<string | null> => ipcRenderer.invoke('cover:get', file),
  getTrackMetadata: (file: string, hash?: string): Promise<TrackMetadata> =>
    ipcRenderer.invoke('metadata:get', file, hash),
  filesExist: (paths: string[]): Promise<boolean[]> => ipcRenderer.invoke('files:exist', paths),
  // Metadata cache manager
  getCache: (): Promise<CachedTrack[]> => ipcRenderer.invoke('cache:list'),
  getCacheCover: (hash: string): Promise<string | null> => ipcRenderer.invoke('cache:cover', hash),
  updateCacheTrack: (hash: string, tags: TrackTags): Promise<CachedTrack[]> =>
    ipcRenderer.invoke('cache:update', hash, tags),
  deleteCacheTrack: (hash: string): Promise<CachedTrack[]> =>
    ipcRenderer.invoke('cache:delete', hash),
  clearCache: (): Promise<CachedTrack[]> => ipcRenderer.invoke('cache:clear'),
  // History
  getHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke('history:get'),
  removeHistoryEntry: (id: string, deleteFiles: boolean): Promise<HistoryEntry[]> =>
    ipcRenderer.invoke('history:removeEntry', id, deleteFiles),
  removeHistoryTrack: (id: string, file: string, deleteFile: boolean): Promise<HistoryEntry[]> =>
    ipcRenderer.invoke('history:removeTrack', id, file, deleteFile),
  onHistoryChanged: (cb: () => void): (() => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('history:changed', fn)
    return () => ipcRenderer.removeListener('history:changed', fn)
  },
  // Application-menu navigation (Settings / Download / History).
  onMenuNavigate: (cb: (target: MenuNavTarget) => void): (() => void) => {
    const fn = (_: unknown, target: MenuNavTarget): void => cb(target)
    ipcRenderer.on('menu:navigate', fn)
    return () => ipcRenderer.removeListener('menu:navigate', fn)
  }
}

export type PluckerApi = typeof api

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('plucker', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.plucker = api
}
