import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  Settings,
  JobProgress,
  JobStatus,
  MenuNavTarget,
  TrackMetadata,
  Waveform,
  CachedTrack,
  TrackTags,
  LogEntry,
  UpdateState,
  ResolvedJob,
  StartJobRequest,
  JobMeta,
  ConsoleWindowState
} from '../shared/types'
import type { TransformManifest, TransformInstance } from '../shared/transforms'
import type { CollectionView, TrackDetail, ActivityEvent } from '../shared/library'
import type { MenuAnchor, MenuDescriptor } from '../shared/context-menu'

// Custom APIs for renderer
const api = {
  getSystemLocale: (): Promise<string> => ipcRenderer.invoke('app:locale'),
  getAccentColor: (): Promise<string> => ipcRenderer.invoke('accent:get'),
  onAccentChanged: (cb: (hex: string) => void): (() => void) => {
    const fn = (_: unknown, hex: string): void => cb(hex)
    ipcRenderer.on('accent:changed', fn)
    return () => ipcRenderer.removeListener('accent:changed', fn)
  },
  // Fullscreen state: lets the custom toolbar drop the macOS traffic-light gap when the
  // native lights are hidden in fullscreen.
  isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:isFullscreen'),
  onFullscreenChanged: (cb: (full: boolean) => void): (() => void) => {
    const fn = (_: unknown, full: boolean): void => cb(full)
    ipcRenderer.on('window:fullscreen', fn)
    return () => ipcRenderer.removeListener('window:fullscreen', fn)
  },
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (s: Settings): Promise<void> => ipcRenderer.invoke('settings:save', s),
  // Factory reset: delete the config file and relaunch the app into default settings.
  resetSettings: (): Promise<void> => ipcRenderer.invoke('settings:reset'),
  // URL history (command-bar suggestions). Both return the updated, deduped list.
  addUrlHistory: (url: string): Promise<string[]> => ipcRenderer.invoke('urlHistory:add', url),
  removeUrlHistory: (url: string): Promise<string[]> =>
    ipcRenderer.invoke('urlHistory:remove', url),
  getTransformCatalog: (): Promise<TransformManifest[]> => ipcRenderer.invoke('transforms:catalog'),
  chooseFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:chooseFolder'),
  // Resolve a URL to its entries without downloading (drives the staging list).
  resolveJob: (url: string): Promise<ResolvedJob> => ipcRenderer.invoke('job:resolve', url),
  // Start a download of a curated, reordered entry list confirmed in staging.
  // Resolves to the new job's id so the renderer can address its controls.
  startDownload: (req: StartJobRequest): Promise<string> => ipcRenderer.invoke('job:start', req),
  cancel: (jobId: string): Promise<void> => ipcRenderer.invoke('job:cancel', jobId),
  pause: (jobId: string): Promise<void> => ipcRenderer.invoke('job:pause', jobId),
  resume: (jobId: string): Promise<void> => ipcRenderer.invoke('job:resume', jobId),
  // Per-track controls for a specific job.
  skipTrack: (jobId: string, index: number): Promise<void> =>
    ipcRenderer.invoke('job:skipTrack', jobId, index),
  pauseTrack: (jobId: string, index: number): Promise<void> =>
    ipcRenderer.invoke('job:pauseTrack', jobId, index),
  resumeTrack: (jobId: string, index: number): Promise<void> =>
    ipcRenderer.invoke('job:resumeTrack', jobId, index),
  // Current roster of jobs (running + queued).
  jobsList: (): Promise<JobMeta[]> => ipcRenderer.invoke('jobs:list'),
  onJobsChanged: (cb: (roster: JobMeta[]) => void): (() => void) => {
    const fn = (_: unknown, roster: JobMeta[]): void => cb(roster)
    ipcRenderer.on('jobs:listChanged', fn)
    return () => ipcRenderer.removeListener('jobs:listChanged', fn)
  },
  onTrackPaused: (cb: (jobId: string, index: number, paused: boolean) => void): (() => void) => {
    const fn = (_: unknown, jobId: string, index: number, paused: boolean): void =>
      cb(jobId, index, paused)
    ipcRenderer.on('job:trackPaused', fn)
    return () => ipcRenderer.removeListener('job:trackPaused', fn)
  },
  onPaused: (cb: (jobId: string, paused: boolean) => void): (() => void) => {
    const fn = (_: unknown, jobId: string, paused: boolean): void => cb(jobId, paused)
    ipcRenderer.on('job:paused', fn)
    return () => ipcRenderer.removeListener('job:paused', fn)
  },
  onProgress: (cb: (jobId: string, p: JobProgress) => void): (() => void) => {
    const fn = (_: unknown, jobId: string, p: JobProgress): void => cb(jobId, p)
    ipcRenderer.on('job:progress', fn)
    return () => ipcRenderer.removeListener('job:progress', fn)
  },
  onStatus: (cb: (jobId: string, s: JobStatus) => void): (() => void) => {
    const fn = (_: unknown, jobId: string, s: JobStatus): void => cb(jobId, s)
    ipcRenderer.on('job:status', fn)
    return () => ipcRenderer.removeListener('job:status', fn)
  },
  // Filesystem navigation + cover art
  openFolder: (path: string): Promise<string> => ipcRenderer.invoke('shell:openFolder', path),
  revealFile: (path: string): Promise<void> => ipcRenderer.invoke('shell:revealFile', path),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  // Native context menu: send a serializable descriptor, resolve with the clicked
  // item id (or null on dismiss). Clipboard write backs "Copy …" menu items.
  popupMenu: (descriptor: MenuDescriptor, anchor?: MenuAnchor): Promise<string | null> =>
    ipcRenderer.invoke('menu:popup', descriptor, anchor),
  copyText: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:write', text),
  getCover: (file: string): Promise<string | null> => ipcRenderer.invoke('cover:get', file),
  getTrackMetadata: (file: string, hash?: string): Promise<TrackMetadata> =>
    ipcRenderer.invoke('metadata:get', file, hash),
  getWaveform: (file: string, hash?: string): Promise<Waveform | null> =>
    ipcRenderer.invoke('waveform:get', file, hash),
  filesExist: (paths: string[]): Promise<boolean[]> => ipcRenderer.invoke('files:exist', paths),
  // Metadata cache manager
  getCache: (): Promise<CachedTrack[]> => ipcRenderer.invoke('cache:list'),
  getCacheCover: (hash: string): Promise<string | null> => ipcRenderer.invoke('cache:cover', hash),
  updateCacheTrack: (hash: string, tags: TrackTags): Promise<CachedTrack[]> =>
    ipcRenderer.invoke('cache:update', hash, tags),
  deleteCacheTrack: (hash: string): Promise<CachedTrack[]> =>
    ipcRenderer.invoke('cache:delete', hash),
  clearCache: (): Promise<CachedTrack[]> => ipcRenderer.invoke('cache:clear'),
  // Library (editor model)
  getCollections: (): Promise<CollectionView[]> => ipcRenderer.invoke('library:getCollections'),
  getLibraryTrack: (trackId: string): Promise<TrackDetail | null> =>
    ipcRenderer.invoke('library:getTrack', trackId),
  getLibraryTrackBlob: (
    trackId: string
  ): Promise<{ file: string | null; hash: string | null }> =>
    ipcRenderer.invoke('library:getTrackBlob', trackId),
  getLibraryVersionBlob: (
    versionId: string
  ): Promise<{ file: string | null; hash: string | null }> =>
    ipcRenderer.invoke('library:getVersionBlob', versionId),
  getActivity: (limit?: number): Promise<ActivityEvent[]> =>
    ipcRenderer.invoke('library:getActivity', limit),
  deleteLibraryTrack: (trackId: string): Promise<CollectionView[]> =>
    ipcRenderer.invoke('library:deleteTrack', trackId),
  deleteLibraryCollection: (id: string): Promise<CollectionView[]> =>
    ipcRenderer.invoke('library:deleteCollection', id),
  renameLibraryCollection: (id: string, title: string): Promise<void> =>
    ipcRenderer.invoke('library:renameCollection', id, title),
  editTrack: (trackId: string, chain: TransformInstance[]): Promise<void> =>
    ipcRenderer.invoke('library:edit', trackId, chain),
  createBranch: (
    trackId: string,
    fromVersionId: string,
    name: string
  ): Promise<{ id: string; detail: TrackDetail | null }> =>
    ipcRenderer.invoke('library:createBranch', trackId, fromVersionId, name),
  switchBranch: (trackId: string, branchId: string): Promise<TrackDetail | null> =>
    ipcRenderer.invoke('library:switchBranch', trackId, branchId),
  renameBranch: (branchId: string, name: string): Promise<void> =>
    ipcRenderer.invoke('library:renameBranch', branchId, name),
  renameVersion: (versionId: string, label: string): Promise<void> =>
    ipcRenderer.invoke('library:renameVersion', versionId, label),
  deleteLibraryVersion: (versionId: string): Promise<void> =>
    ipcRenderer.invoke('library:deleteVersion', versionId),
  exportLibraryTracks: (trackIds: string[], destFolder: string): Promise<string[]> =>
    ipcRenderer.invoke('library:export', trackIds, destFolder),
  onLibraryChanged: (cb: () => void): (() => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('library:changed', fn)
    return () => ipcRenderer.removeListener('library:changed', fn)
  },
  onLibraryActivityChanged: (cb: () => void): (() => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('library:activityChanged', fn)
    return () => ipcRenderer.removeListener('library:activityChanged', fn)
  },
  // A library edit job finished without producing a new version — surface the reason.
  onLibraryEditFailed: (cb: (reason: string) => void): (() => void) => {
    const fn = (_: unknown, reason: string): void => cb(reason)
    ipcRenderer.on('library:editFailed', fn)
    return () => ipcRenderer.removeListener('library:editFailed', fn)
  },
  // Interrupted / resumable jobs (crash, clean quit, or user cancel).
  listInterruptedJobs: (): Promise<
    { jobId: string; title: string; done: number; total: number }[]
  > => ipcRenderer.invoke('jobs:listInterrupted'),
  resumeJob: (jobId: string): Promise<void> => ipcRenderer.invoke('jobs:resume', jobId),
  discardJob: (
    jobId: string
  ): Promise<{ jobId: string; title: string; done: number; total: number }[]> =>
    ipcRenderer.invoke('jobs:discard', jobId),
  // Permanently hide one job's resume banner (kept in History, never offered again).
  dismissResumeJob: (
    jobId: string
  ): Promise<{ jobId: string; title: string; done: number; total: number }[]> =>
    ipcRenderer.invoke('jobs:dismiss', jobId),
  onInterruptedChanged: (cb: () => void): (() => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('jobs:interruptedChanged', fn)
    return () => ipcRenderer.removeListener('jobs:interruptedChanged', fn)
  },
  // Application-menu navigation (Settings / Download / History).
  onMenuNavigate: (cb: (target: MenuNavTarget) => void): (() => void) => {
    const fn = (_: unknown, target: MenuNavTarget): void => cb(target)
    ipcRenderer.on('menu:navigate', fn)
    return () => ipcRenderer.removeListener('menu:navigate', fn)
  },
  // Application-menu commands that need a renderer hook (File ▸ New Download / Open URL…).
  onMenuNewDownload: (cb: () => void): (() => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('menu:new-download', fn)
    return () => ipcRenderer.removeListener('menu:new-download', fn)
  },
  onMenuOpenUrl: (cb: (url: string) => void): (() => void) => {
    const fn = (_: unknown, url: string): void => cb(url)
    ipcRenderer.on('menu:open-url', fn)
    return () => ipcRenderer.removeListener('menu:open-url', fn)
  },
  // Developer console: live log stream, buffered tail, and reveal-in-Finder.
  onLog: (cb: (entry: LogEntry) => void): (() => void) => {
    const fn = (_: unknown, entry: LogEntry): void => cb(entry)
    ipcRenderer.on('log:line', fn)
    return () => ipcRenderer.removeListener('log:line', fn)
  },
  getLogTail: (): Promise<LogEntry[]> => ipcRenderer.invoke('log:tail'),
  revealLog: (): Promise<void> => ipcRenderer.invoke('log:reveal'),
  // Undock / redock the console into its own floating window.
  undockConsole: (): Promise<void> => ipcRenderer.invoke('console:undock'),
  redockConsole: (): Promise<void> => ipcRenderer.invoke('console:redock'),
  // Show/hide the floating console window (⌘J while floating).
  toggleConsoleWindow: (): Promise<void> => ipcRenderer.invoke('console:toggleWindow'),
  // Pin the floating console above other windows.
  setConsoleAlwaysOnTop: (on: boolean): Promise<void> =>
    ipcRenderer.invoke('console:alwaysOnTop', on),
  // Scale the floating console independently of the main window; resolves to the
  // applied (clamped) zoom factor.
  setConsoleZoom: (zoom: number): Promise<number> => ipcRenderer.invoke('console:setZoom', zoom),
  // Initial { mode, alwaysOnTop } for whichever window asks.
  getConsoleState: (): Promise<ConsoleWindowState> => ipcRenderer.invoke('console:getState'),
  // Main → main-window: the console moved between docked and floating.
  onConsoleMode: (cb: (mode: ConsoleWindowState['mode']) => void): (() => void) => {
    const fn = (_: unknown, mode: ConsoleWindowState['mode']): void => cb(mode)
    ipcRenderer.on('console:mode', fn)
    return () => ipcRenderer.removeListener('console:mode', fn)
  },
  // Chrome-style updater for the About card: check → download → relaunch-to-install.
  checkForUpdates: (): Promise<UpdateState> => ipcRenderer.invoke('updates:check'),
  downloadUpdate: (): Promise<UpdateState> => ipcRenderer.invoke('updates:download'),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke('updates:install'),
  onUpdateProgress: (cb: (percent: number) => void): (() => void) => {
    const fn = (_: unknown, percent: number): void => cb(percent)
    ipcRenderer.on('updates:progress', fn)
    return () => ipcRenderer.removeListener('updates:progress', fn)
  },
  // Full state pushed by the background auto-updater (check → download → ready).
  onUpdateState: (cb: (state: UpdateState) => void): (() => void) => {
    const fn = (_: unknown, state: UpdateState): void => cb(state)
    ipcRenderer.on('updates:state', fn)
    return () => ipcRenderer.removeListener('updates:state', fn)
  },
  // Toggle the console drawer from the application menu (⌘J).
  onToggleConsole: (cb: () => void): (() => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('menu:toggle-console', fn)
    return () => ipcRenderer.removeListener('menu:toggle-console', fn)
  },
  // Settings persisted elsewhere (e.g. saved in the Settings panel) — lets the UI
  // react live (e.g. show/hide the console button when the developer flag changes).
  onSettingsChanged: (cb: (s: Settings) => void): (() => void) => {
    const fn = (_: unknown, s: Settings): void => cb(s)
    ipcRenderer.on('settings:changed', fn)
    return () => ipcRenderer.removeListener('settings:changed', fn)
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
