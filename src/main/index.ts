import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  dialog,
  systemPreferences,
  screen,
  protocol,
  net
} from 'electron'
import { join } from 'path'
import { arch } from 'node:os'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { version as appVersion } from '../../package.json'
import icon from '../../resources/icon.png?asset'
import {
  loadSettings,
  saveSettings,
  settingsPath,
  resetSettings,
  expandHome,
  logPath,
  migrateLegacyConfig,
  pluckerDir
} from '@app/app/settings/settings'
import {
  loadWindowBounds,
  saveWindowBounds,
  clearWindowBounds,
  isOnScreen
} from '@app/app/windows/window-state'
import { log, addLogTransport, getLogTail, replayLogEntry } from '@app/app/logging/log'
import { bootstrapFileLogging } from '@app/app/logging/bootstrap'
import { binaryPaths, type BinaryPaths } from '@app/app/download/binaries'
import { resolveJob, type JobResult } from '@app/app/pipeline/pipeline'
import { createJobPool, type JobPool } from '@app/app/pipeline/jobs/job-pool'
import { spawnJobClient } from '@app/workers/job-host'
import type { JobStartPayload } from '@app/workers/job-protocol'
import {
  listCheckpoints,
  deleteCheckpoint,
  dismissCheckpoint,
  readCheckpoint
} from '@app/app/pipeline/jobs/job-checkpoint'
import { partitionCheckpoint } from '@app/app/pipeline/resume-merge'
import { terminateAnalyzeClient } from '@app/workers/analyze-host'
import { terminateMediaClient } from '@app/workers/media-host'
import { getCatalog } from '@app/transforms/registry'
import { readCoverDataUrl, writeTrackTags } from '@app/app/metadata/id3/tagger'
import { getTrackMetadata, forBinaries } from '@app/app/metadata/metadata'
import { getWaveform, forWaveform } from '@app/app/audio/waveform'
import { getLibraryDb } from '@app/library/db'
import { createRepo } from '@app/library/repo'
import { createContentStore } from '@app/library/content-store'
import { createLibraryService } from '@app/library/service'
import { createMaterializer } from '@app/library/materialize'
import { collectGarbage } from '@app/library/gc'
import { buildRegistry } from '@app/transforms/registry'
import { transformLog } from '@app/transforms/transform-logger'
import { buildFileName } from '@app/app/metadata/rename'
import { addUrl, removeUrl } from '@shared/url-history'
import { clampConsoleZoom } from '@shared/console-zoom'
import type { TransformInstance } from '@shared/transforms'
import { killAllChildren } from '@app/app/process/spawn'
import {
  registerUpdaterIpc,
  startBackgroundUpdates,
  installPendingUpdateOnQuit
} from '@app/app/updater/updater'
import { registerContextMenuIpc } from '@app/app/menus/context-menu'
import { createCrashGuard, type CrashGuard } from '@app/app/windows/window-recovery'
import { buildAppMenu, primeMenuIcons } from '@app/app/menus/menu'
import { getAccentColor } from '@app/app/accent'
import {
  createMetadataCache,
  type MetadataCache,
  type CacheRecord
} from '@app/app/metadata/metadata-cache'
import type {
  Settings,
  CachedTrack,
  TrackTags,
  StartJobRequest,
  JobCheckpoint
} from '@shared/types'

// Attach the durable file log + process error handlers as the very first thing the main
// process does — before any window or native-module work — so a startup crash (e.g. a
// native module failing to `dlopen`) is written to ~/.plucker/plucker.log and surfaced,
// instead of vanishing into a silent no-window launch.
bootstrapFileLogging({ version: appVersion, logFile: logPath() })

// Set the app name as early as possible so the macOS app menu + About panel
// (built when the app becomes ready) read "Plucker" instead of "Electron".
app.setName('Plucker')

// Privileged scheme so the renderer can stream library blobs (range-capable) for the
// hover-preview player and the editor transport, without exposing file paths.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'plucker-audio',
    privileges: { stream: true, supportFetchAPI: true, secure: true, bypassCSP: true }
  }
])

let mainWindow: BrowserWindow | null = null
let consoleWindow: BrowserWindow | null = null
// When the console window is destroyed we normally redock (mode → docked). The app
// shutdown / main-window-close path sets this false so a floating console is
// remembered and reopens floating next launch.
let consoleRedockOnClose = true
let metaCache: MetadataCache | null = null
/** Cookie file exported during the last job:resolve, reused by the next job:start. */
let pendingResolve: { url: string; cookieFile?: string } | null = null
/** Own abort for job:resolve (decoupled from running jobs, which abort per-worker). */
let resolveAbort: AbortController | null = null
/** The job scheduler (bounded pool + queue). Created in registerIpc. */
let jobPool: JobPool | null = null
/** Renderer-crash safeguard: recreates a crashed window, or hard-exits on a crash loop. */
let crashGuard: CrashGuard | null = null

/** Resolve the bundled binary paths for the current runtime. */
function currentBin(): BinaryPaths {
  return binaryPaths({
    packaged: app.isPackaged,
    arch: arch() === 'arm64' ? 'arm64' : 'x64',
    resourcesPath: process.resourcesPath,
    projectRoot: app.getAppPath()
  })
}

/** Directory holding the content-addressed metadata cache. */
function metaCacheDir(): string {
  return join(app.getPath('userData'), 'metadata-cache')
}

/** Lazily-created global metadata cache under the app's userData dir. */
function getMetaCache(): MetadataCache {
  if (!metaCache) metaCache = createMetadataCache(metaCacheDir())
  return metaCache
}

// The developer console's *live IPC stream* (the in-app renderer overlay) is a developer
// feature: on in dev, otherwise gated behind the `developer.console` setting. The durable
// **file** log is separate and always on — it's attached at startup by bootstrapFileLogging
// so crashes are always captured to disk — so only this in-app live stream toggles here.
let detachIpcLog: (() => void) | null = null

function applyConsoleLogging(): void {
  const enabled = !app.isPackaged || loadSettings().developer.console
  if (enabled && !detachIpcLog) {
    detachIpcLog = addLogTransport((e) => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('log:line', e)
      }
    })
  } else if (!enabled && detachIpcLog) {
    detachIpcLog()
    detachIpcLog = null
  }
}

function registerIpc(getWindow: () => BrowserWindow | null): void {
  // Library (editor model): the managed, content-addressed store + SQLite index that
  // replaces the flat history. Reconcile any crash-orphaned blobs on launch, then expose
  // a service the IPC handlers and the job-result fold call into.
  const libraryStore = createContentStore(join(pluckerDir(), 'blobs'))
  const libraryRepo = createRepo(getLibraryDb())
  collectGarbage(libraryRepo, libraryStore)
  // plucker-audio://<sha256> → stream that blob (range-capable). Only well-formed hashes that exist.
  protocol.handle('plucker-audio', (request) => {
    const hash = new URL(request.url).hostname
    if (!/^[0-9a-f]{64}$/.test(hash)) return new Response(null, { status: 400 })
    const file = libraryStore.pathFor(hash)
    if (!existsSync(file)) return new Response(null, { status: 404 })
    // net.fetch of a file:// URL honours the forwarded Range header (seek/scrub).
    return net.fetch(pathToFileURL(file).toString(), { headers: request.headers })
  })
  // Recompute cold versions on demand by replaying their (deterministic) chains in the
  // main process. analyze/media off-thread hosts are omitted — the affected transforms
  // fall back to inline execution.
  const libraryMaterializer = createMaterializer({
    repo: libraryRepo,
    store: libraryStore,
    registry: buildRegistry(),
    services: { bin: currentBin(), fetch, log: transformLog(), cache: getMetaCache() }
  })
  const library = createLibraryService({
    repo: libraryRepo,
    store: libraryStore,
    emit: (event) => getWindow()?.webContents.send(event),
    materialize: (versionId) => libraryMaterializer.ensureMaterialized(versionId),
    dispatchEdit: async (payload) => {
      jobPool?.enqueue(randomUUID(), { kind: 'libraryEdit', ...payload })
    },
    buildName: (tags) => {
      // Name exports with the user's rename-transform template (or its default).
      const rename = loadSettings().transforms.find((i) => i.type === 'rename')
      const template =
        (rename?.config.template as string | undefined) ??
        '{artist} - {track}. {title} - {album} ({year})'
      return buildFileName(template, tags)
    },
    perPlaylistSubfolder: () => loadSettings().downloads.perPlaylistSubfolder
  })

  ipcMain.handle('app:locale', () => app.getLocale())
  ipcMain.handle('accent:get', () => getAccentColor())
  // Fullscreen state drives the custom toolbar layout: macOS hides the native traffic
  // lights in fullscreen, so the renderer drops the gap reserved for them.
  ipcMain.handle('window:isFullscreen', () => getWindow()?.isFullScreen() ?? false)
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:save', (_e, s: Settings) => {
    saveSettings(settingsPath(), s)
    // Re-evaluate console logging (the developer flag may have flipped) and let the
    // renderer react live (show/hide the console button).
    applyConsoleLogging()
    // Disabling the developer console pulls down any floating console window too.
    if (app.isPackaged && !loadSettings().developer.console) closeConsoleWindow()
    getWindow()?.webContents.send('settings:changed', s)
  })
  // URL history: scoped add/remove that mutate just the urlHistory list, so the command
  // bar never has to round-trip the whole Settings object (avoids clobbering the panel).
  const mutateUrlHistory = (fn: (list: string[]) => string[]): string[] => {
    const current = loadSettings()
    const next = { ...current, urlHistory: fn(current.urlHistory) }
    saveSettings(settingsPath(), next)
    getWindow()?.webContents.send('settings:changed', next)
    return next.urlHistory
  }
  // Factory reset: wipe the config file entirely, then relaunch into a fresh default state.
  ipcMain.handle('settings:reset', () => {
    resetSettings(settingsPath())
    app.relaunch()
    app.exit(0)
  })
  ipcMain.handle('urlHistory:add', (_e, url: string) => mutateUrlHistory((l) => addUrl(l, url)))
  ipcMain.handle('urlHistory:remove', (_e, url: string) =>
    mutateUrlHistory((l) => removeUrl(l, url))
  )
  // Developer console: buffered tail (seeds the overlay on open) + reveal the log file.
  ipcMain.handle('log:tail', () => getLogTail())
  ipcMain.handle('log:reveal', () => shell.showItemInFolder(logPath()))

  // Console docking: undock pops the console into its own floating window, redock
  // closes it back into the in-app drawer, ⌘J-while-floating shows/hides it, and the
  // pin keeps it above other windows. Mode + always-on-top persist in settings.
  ipcMain.handle('console:undock', () => {
    setConsoleSettings({ mode: 'floating' })
    openConsoleWindow(getWindow)
    getWindow()?.webContents.send('console:mode', 'floating')
  })
  ipcMain.handle('console:redock', () => closeConsoleWindow())
  ipcMain.handle('console:toggleWindow', () => {
    if (!consoleWindow) {
      openConsoleWindow(getWindow)
      return
    }
    if (consoleWindow.isVisible() && consoleWindow.isFocused()) consoleWindow.hide()
    else {
      consoleWindow.show()
      consoleWindow.focus()
    }
  })
  ipcMain.handle('console:alwaysOnTop', (_e, on: boolean) => {
    consoleWindow?.setAlwaysOnTop(on)
    setConsoleSettings({ alwaysOnTop: on })
  })
  // Console zoom: scales the floating console independently of the main window.
  ipcMain.handle('console:setZoom', (_e, zoom: number) => {
    const clamped = clampConsoleZoom(zoom)
    consoleWindow?.webContents.setZoomFactor(clamped)
    setConsoleSettings({ zoom: clamped })
    return clamped
  })
  ipcMain.handle('console:getState', () => loadSettings().developer.consoleWindow)
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
  // Waveform peaks for the expanded panel — generated lazily on first expand,
  // cached per content hash, returns null when the file can't be decoded.
  ipcMain.handle('waveform:get', (_e, file: string, hash?: string) =>
    getWaveform(file, hash, forWaveform(currentBin(), getMetaCache()))
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

  // Library read/mutate IPC (editor model; replaces the old history:* surface).
  ipcMain.handle('library:getCollections', () => library.listCollections())
  ipcMain.handle('library:getTrack', (_e, trackId: string) => library.getTrack(trackId))
  // Resolve a track's *current* (active-branch tip) version to its on-disk blob. The tip
  // is always materialized (model policy), so file/hash are non-null in practice; callers
  // must still tolerate nulls (cold/broken root). Reuses the existing cover:/waveform:/
  // metadata: handlers, which take a file path.
  ipcMain.handle(
    'library:getTrackBlob',
    (_e, trackId: string): { file: string | null; hash: string | null } => {
      const t = libraryRepo.getTrack(trackId)
      if (!t) return { file: null, hash: null }
      const branch = libraryRepo.getBranch(t.activeBranchId)
      if (!branch) return { file: null, hash: null }
      const ver = libraryRepo.getVersion(branch.tipVersionId)
      const hash = ver?.blobHash ?? null
      return { file: hash ? libraryStore.pathFor(hash) : null, hash }
    }
  )
  // Resolve a *specific* version to its on-disk blob (for the version-graph card
  // waveforms). Cold/unmaterialized versions have no blob → nulls. Like
  // getTrackBlob, the file path feeds the shared waveform:/metadata: handlers.
  ipcMain.handle(
    'library:getVersionBlob',
    (_e, versionId: string): { file: string | null; hash: string | null } => {
      const ver = libraryRepo.getVersion(versionId)
      const hash = ver?.blobHash ?? null
      return { file: hash ? libraryStore.pathFor(hash) : null, hash }
    }
  )
  ipcMain.handle('library:getActivity', (_e, limit?: number) => library.listActivity(limit))
  ipcMain.handle('library:deleteTrack', (_e, trackId: string) => {
    library.deleteTrack(trackId)
    return library.listCollections()
  })
  ipcMain.handle('library:deleteCollection', (_e, id: string) => {
    library.deleteCollection(id)
    return library.listCollections()
  })
  ipcMain.handle('library:edit', (_e, trackId: string, chain: TransformInstance[]) =>
    library.edit(trackId, chain)
  )
  ipcMain.handle(
    'library:createBranch',
    (_e, trackId: string, fromVersionId: string, name: string) => {
      const id = library.createBranch(trackId, fromVersionId, name)
      return { id, detail: library.getTrack(trackId) }
    }
  )
  ipcMain.handle('library:switchBranch', (_e, trackId: string, branchId: string) => {
    library.switchBranch(trackId, branchId)
    return library.getTrack(trackId)
  })
  ipcMain.handle('library:renameBranch', (_e, branchId: string, name: string) =>
    library.renameBranch(branchId, name)
  )
  ipcMain.handle('library:renameVersion', (_e, versionId: string, label: string) =>
    library.renameVersion(versionId, label)
  )
  ipcMain.handle('library:renameCollection', (_e, id: string, title: string) =>
    library.renameCollection(id, title)
  )
  ipcMain.handle('library:deleteVersion', (_e, versionId: string) => {
    library.deleteVersion(versionId)
  })
  ipcMain.handle('library:export', (_e, trackIds: string[], destFolder: string) =>
    library.exportTracks(trackIds, destFolder)
  )

  const win = (): BrowserWindow | null => getWindow()
  const setBar = (overall: number): void =>
    win()?.setProgressBar(overall > 0 && overall < 1 ? overall : overall >= 1 ? 1 : -1)

  /** Fold a finished job's result into the Library. Main is the sole library writer. */
  const foldJobResult = (jobId: string, payload: JobStartPayload, result: JobResult): void => {
    win()?.setProgressBar(-1)
    // runPipeline resolves even on cancel, returning a partial result with
    // outcome 'cancelled'; in that case the checkpoint is kept for resume.
    const cancelled = result.outcome === 'cancelled'
    if (payload.kind === 'download' || payload.kind === 'resume') {
      library.ingestJobResult(jobId, result)
      if (!cancelled) deleteCheckpoint(jobsDir(), jobId)
      if (cancelled) win()?.webContents.send('jobs:interruptedChanged')
      return
    }
    if (payload.kind === 'libraryEdit') {
      const res = library.foldEditResult({
        trackId: payload.trackId,
        branchId: payload.branchId,
        parentVersionId: payload.parentVersionId,
        chainSteps: payload.chain.map((c) => ({ type: c.type, config: c.config })),
        result
      })
      // Surface a failed edit to the user instead of letting it vanish silently.
      if (!res.ok) {
        log.error('app', `library edit failed: ${res.reason}`)
        win()?.webContents.send('library:editFailed', res.reason)
      }
      return
    }
    // retransform / retryFailed: removed; editing is now a libraryEdit job.
  }

  /** Handle a job that rejected before producing a result (resolve failure / cancel). */
  const foldJobError = (
    jobId: string,
    _payload: JobStartPayload,
    e: { message: string; cancelled: boolean }
  ): void => {
    win()?.setProgressBar(-1)
    // A throw-before-result left no useful checkpoint to resume — drop it. Downloads
    // that fail before producing a result simply aren't ingested into the Library.
    deleteCheckpoint(jobsDir(), jobId)
    if (!e.cancelled) {
      log.error('app', 'job failed:', e.message)
      win()?.webContents.send('job:status', jobId, { phase: 'error', error: e.message })
    } else {
      log.info('app', 'job cancelled')
    }
  }

  const pool = (jobPool = createJobPool({
    spawn: spawnJobClient,
    getParallel: () => loadSettings().performance.parallel,
    depsConfig: () => {
      const s = loadSettings()
      return {
        bin: currentBin(),
        settings: s,
        homeBase: expandHome(s.downloads.baseFolder),
        cacheDir: metaCacheDir(),
        jobsDir: jobsDir()
      }
    },
    onRosterChange: (roster) => win()?.webContents.send('jobs:listChanged', roster),
    onProgress: (jobId, p) => {
      win()?.webContents.send('job:progress', jobId, p)
      setBar(p.overall)
    },
    onStatus: (jobId, s) => win()?.webContents.send('job:status', jobId, s),
    onPaused: (jobId, paused) => win()?.webContents.send('job:paused', jobId, paused),
    onTrackPaused: (jobId, i, paused) =>
      win()?.webContents.send('job:trackPaused', jobId, i, paused),
    onLog: (_jobId, entry) => replayLogEntry(entry),
    onDone: (jobId, payload, result) => foldJobResult(jobId, payload, result),
    onError: (jobId, payload, e) => foldJobError(jobId, payload, e)
  }))

  ipcMain.handle('job:cancel', (_e, jobId: string) => pool.cancel(jobId))
  ipcMain.handle('job:pause', (_e, jobId: string) => pool.pause(jobId))
  ipcMain.handle('job:resume', (_e, jobId: string) => pool.resume(jobId))
  ipcMain.handle('job:skipTrack', (_e, jobId: string, index: number) =>
    pool.skipTrack(jobId, index)
  )
  ipcMain.handle('job:pauseTrack', (_e, jobId: string, index: number) =>
    pool.pauseTrack(jobId, index)
  )
  ipcMain.handle('job:resumeTrack', (_e, jobId: string, index: number) =>
    pool.resumeTrack(jobId, index)
  )
  ipcMain.handle('jobs:list', () => pool.roster())

  // Resolve a URL to its entries WITHOUT downloading, for the staging list. Stash
  // any exported cookie file so the subsequent job:start can reuse it. Uses its own
  // abort, decoupled from running jobs. Status carries an empty jobId (pre-job).
  ipcMain.handle('job:resolve', async (_e, url: string) => {
    const settings = loadSettings()
    resolveAbort = new AbortController()
    const { job, cookieFile } = await resolveJob(url, {
      bin: currentBin(),
      settings,
      onStatus: (s) => win()?.webContents.send('job:status', '', s),
      signal: resolveAbort.signal
    })
    pendingResolve = { url, cookieFile }
    return job
  })

  ipcMain.handle('job:start', (_e, req: StartJobRequest) => {
    const jobId = randomUUID()
    const cookieFile = pendingResolve?.url === req.url ? pendingResolve.cookieFile : undefined
    pendingResolve = null
    pool.enqueue(jobId, { kind: 'download', req, cookieFile })
    return jobId
  })

  // ---- Interrupted / resumable jobs ----

  /** Compact per-checkpoint summary for the renderer (banner + History affordance). */
  const listInterruptedSummaries = (): {
    jobId: string
    title: string
    done: number
    total: number
  }[] =>
    listCheckpoints(jobsDir())
      .filter((cp) => !cp.dismissed)
      .map((cp) => ({
        jobId: cp.jobId,
        title: cp.jobTitle,
        done: cp.entries.filter((e) => e.status === 'done' || e.status === 'skipped').length,
        total: cp.total
      }))

  /** Resume an interrupted job: enqueue only the pending tracks under its jobId. */
  const runResume = (cp: JobCheckpoint): void => {
    const { completed, pending } = partitionCheckpoint(cp)
    const req: StartJobRequest = {
      url: cp.url,
      title: cp.jobTitle,
      kind: cp.kind,
      entries: pending.map((e) => ({ videoId: e.videoId ?? '', title: e.title, index: e.index })),
      folderOverride: cp.folder
    }
    // Reuse the checkpoint's jobId so the worker's sink continues the same file.
    pool.enqueue(cp.jobId, { kind: 'resume', req, completed })
  }

  ipcMain.handle('jobs:listInterrupted', () => listInterruptedSummaries())
  ipcMain.handle('jobs:discard', (_e, jobId: string) => {
    deleteCheckpoint(jobsDir(), jobId)
    return listInterruptedSummaries()
  })
  ipcMain.handle('jobs:dismiss', (_e, jobId: string) => {
    dismissCheckpoint(jobsDir(), jobId, Date.now())
    return listInterruptedSummaries()
  })
  ipcMain.handle('jobs:resume', (_e, jobId: string) => {
    const cp = readCheckpoint(join(jobsDir(), `${jobId}.json`))
    if (cp) runResume(cp)
  })
}

/** Path of the persisted window-geometry file under the plucker app-data dir. */
function windowStatePath(): string {
  return join(pluckerDir(), 'window-state.json')
}

/** Path of the persisted floating-console geometry under the plucker app-data dir. */
function consoleWindowStatePath(): string {
  return join(pluckerDir(), 'console-window-state.json')
}

/** Patch and persist the console-window preferences (mode / alwaysOnTop). */
function setConsoleSettings(patch: Partial<Settings['developer']['consoleWindow']>): void {
  const s = loadSettings()
  const consoleWindowState = { ...s.developer.consoleWindow, ...patch }
  saveSettings(settingsPath(), {
    ...s,
    developer: { ...s.developer, consoleWindow: consoleWindowState }
  })
}

/** Create (or focus) the floating console window. */
function openConsoleWindow(getMain: () => BrowserWindow | null): void {
  if (consoleWindow) {
    consoleWindow.show()
    consoleWindow.focus()
    return
  }
  const saved = loadWindowBounds(consoleWindowStatePath())
  const onScreen =
    saved &&
    isOnScreen(
      saved,
      screen.getAllDisplays().map((d) => d.workArea)
    )
      ? saved
      : null
  const { alwaysOnTop, zoom } = loadSettings().developer.consoleWindow

  const win = new BrowserWindow({
    width: onScreen?.width ?? 560,
    height: onScreen?.height ?? 440,
    ...(onScreen ? { x: onScreen.x, y: onScreen.y } : {}),
    show: false,
    title: `Console — ${app.getName()}`,
    backgroundColor: '#0a0b0e',
    alwaysOnTop,
    autoHideMenuBar: true,
    // Custom frame so the console shows only its own in-app title bar instead of
    // stacking a native one on top. macOS keeps the traffic lights (positioned into
    // the compact bar); other platforms go fully frameless.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 10, y: 7 } }
      : { frame: false }),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  consoleWindow = win
  consoleRedockOnClose = true

  // Apply the persisted zoom once the page is ready (setZoomFactor only sticks after
  // a document is loaded). The console scales independently of the main window.
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(clampConsoleZoom(zoom)))

  // A crashed console renderer would strand a blank floating window; fold it back into the
  // in-app drawer (destroy → 'closed' redocks) instead. It's reopenable via ⌘J / the console
  // button. The essential main window has its own recover-or-hard-exit guard.
  win.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit') return
    log.error('app', `console renderer gone (${details.reason}); redocking`)
    if (!win.isDestroyed()) win.destroy()
  })

  // The shared index.html sets <title>Plucker</title>; keep our explicit
  // "Console — Plucker" window title instead of letting the page override it.
  win.on('page-title-updated', (e) => e.preventDefault())
  win.on('ready-to-show', () => win.show())
  const persist = (): void => saveWindowBounds(consoleWindowStatePath(), win.getBounds())
  win.on('moved', persist)
  win.on('resized', persist)
  win.on('close', persist)
  win.on('closed', () => {
    consoleWindow = null
    // A user-initiated close (OS X button or the Dock control) redocks; an app/main
    // shutdown leaves the persisted mode as 'floating' so it reopens next launch.
    if (consoleRedockOnClose) {
      // Docking forgets the floating geometry so the next undock opens fresh
      // (centered) rather than restoring the last floating position.
      clearWindowBounds(consoleWindowStatePath())
      setConsoleSettings({ mode: 'docked' })
      getMain()?.webContents.send('console:mode', 'docked')
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#console`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'console' })
  }
}

/** Close the floating console window if one is open. */
function closeConsoleWindow(): void {
  consoleWindow?.close()
}

/** Directory holding per-job resume checkpoints. */
function jobsDir(): string {
  return join(pluckerDir(), 'jobs')
}

/**
 * Crash recovery: any checkpoint that outlived a crash is surfaced to the renderer as a
 * resumable job (read directly from the checkpoint dir by `jobs:listInterrupted`). The
 * Library is the source of truth for finished work, so there's no history to synthesize —
 * we just nudge the renderer to show the resume banner once the window has loaded.
 */
function recoverInterruptedJobs(): void {
  const checkpoints = listCheckpoints(jobsDir())
  if (checkpoints.length === 0) return
  const win = mainWindow
  const push = (): void => {
    win?.webContents.send('jobs:interruptedChanged')
  }
  if (win?.webContents.isLoading()) win.webContents.once('did-finish-load', push)
  else push()
}

function createWindow(): void {
  // Restore the last window geometry so a relaunch — including an electron-vite dev
  // hot-restart on every main-process edit — reopens where the user left it instead of
  // re-centering the default size on top of whatever they were doing. Fall back to the
  // default size when there's no saved state or it would land off every display.
  const saved = loadWindowBounds(windowStatePath())
  const onScreen =
    saved &&
    isOnScreen(
      saved,
      screen.getAllDisplays().map((d) => d.workArea)
    )
      ? saved
      : null

  // Create the browser window.
  const win = new BrowserWindow({
    width: onScreen?.width ?? 900,
    height: onScreen?.height ?? 670,
    ...(onScreen ? { x: onScreen.x, y: onScreen.y } : {}),
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
  // Watch this window's renderer for crashes; a dead renderer leaves a blank "empty shell"
  // that we recover (recreate) from, or hard-exit on if crashes form a loop.
  crashGuard?.attach(win)

  win.on('ready-to-show', () => {
    // The screenshot tooling (scripts/build-screenshots.mjs) shows the window without
    // activating it, so generating images never steals focus. In dev we do the same:
    // electron-vite restarts the whole app on every main-process edit, and a focus-
    // stealing show() would yank you out of your editor on each save. In production
    // (a real launch) we show + focus as usual.
    if (process.env.PLUCKER_SCREENSHOT || is.dev) win.showInactive()
    else win.show()
  })

  // Persist window geometry so the next launch / dev hot-restart reopens in place.
  // 'moved'/'resized' coalesce native drag/resize gestures into one event each.
  const persistBounds = (): void => saveWindowBounds(windowStatePath(), win.getBounds())
  win.on('moved', persistBounds)
  win.on('resized', persistBounds)
  win.on('close', persistBounds)

  // The floating console must not outlive the main window; keep the persisted mode
  // (don't redock) so a remembered floating console reopens next launch.
  win.on('close', () => {
    consoleRedockOnClose = false
    closeConsoleWindow()
  })

  // Tell the renderer when we cross the fullscreen boundary so the custom toolbar can
  // reclaim the space normally reserved for the (now hidden) macOS traffic lights.
  win.on('enter-full-screen', () => win.webContents.send('window:fullscreen', true))
  win.on('leave-full-screen', () => win.webContents.send('window:fullscreen', false))

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

/**
 * Recover from a renderer crash by replacing the dead (blank) frame with a fresh window. The
 * replacement is created *before* the old one is destroyed so the open-window count never hits
 * zero — otherwise `window-all-closed` would quit the app on Linux/Windows mid-recovery. The
 * live `() => mainWindow` getter handed to registerIpc/updater/etc. picks up the new window, so
 * no IPC re-registration is needed; the renderer rehydrates its own state on load.
 */
function recreateMainWindow(): void {
  log.warn('app', 'recreating main window after renderer crash')
  const dead = mainWindow
  createWindow() // points mainWindow at the fresh window (and attaches the crash guard)
  if (dead && !dead.isDestroyed()) dead.destroy()
}

/**
 * Last resort when crashes form an unrecoverable loop: kill child processes so nothing is
 * orphaned, then hard-exit non-zero. A real exit (not a polite `app.quit()`) guarantees we never
 * leave the user staring at a dead, empty Electron shell.
 */
function hardCrash(reason: string): void {
  log.error('app', `unrecoverable renderer crash loop (${reason}); exiting`)
  try {
    resolveAbort?.abort()
    jobPool?.shutdown()
    killAllChildren()
    terminateAnalyzeClient()
    terminateMediaClient()
  } catch (err) {
    log.error('app', 'cleanup during hard-crash failed:', err)
  }
  app.exit(1)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
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
  registerContextMenuIpc(() => mainWindow)

  // Push OS accent-color changes to the renderer so --color-accent updates live.
  systemPreferences.subscribeNotification?.('AppleColorPreferencesChangedNotification', () =>
    mainWindow?.webContents.send('accent:changed', getAccentColor())
  )

  // Prime SF-Symbol icons (native, macOS-only) before building so the menu shows them
  // on first paint; a no-op off macOS or when the addon isn't built.
  await primeMenuIcons()
  buildAppMenu(() => mainWindow)

  // Renderer-crash safeguard: recreate a crashed window, or hard-exit if crashes form a loop,
  // so a dead renderer never leaves a blank "empty shell". Created before the first window so
  // createWindow() can attach it.
  crashGuard = createCrashGuard({ recover: recreateMainWindow, fatal: hardCrash })
  // A non-clean child-process exit (GPU/utility) is logged for diagnosis; Chromium recovers
  // these itself, so unlike a renderer crash it needs no window rebuild.
  app.on('child-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit')
      log.warn('app', `child process gone: ${details.type} (${details.reason})`)
  })

  createWindow()

  // Attach the file + live-stream log transports if the console is enabled.
  applyConsoleLogging()
  log.info('app', `Plucker ${appVersion} ready`)

  // Reopen the console floating if that's how the user left it (and the feature is on).
  const consoleEnabled = !app.isPackaged || loadSettings().developer.console
  if (consoleEnabled && loadSettings().developer.consoleWindow.mode === 'floating') {
    openConsoleWindow(() => mainWindow)
  }

  // Surface any job that was interrupted by a crash/quit as a resumable entry.
  recoverInterruptedJobs()

  // Background auto-updater: checks every 15 min and auto-downloads (throttled) any
  // available update, arming it to install on quit. Respects the "check on launch"
  // setting as its master switch (see startBackgroundUpdates).
  startBackgroundUpdates(() => mainWindow)

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
  // A throw anywhere in the startup sequence above (e.g. the Library DB's native module
  // failing to load on a mismatched-arch build) would otherwise reject silently — leaving
  // the user with no window. Persist it to the log file (already attached at boot) and
  // surface it in a dialog so the failure is visible and diagnosable, then exit non-zero
  // instead of lingering as a dead, windowless process.
  .catch((err) => {
    log.error('app', 'fatal error during startup:', err)
    try {
      dialog.showErrorBox(
        'Plucker failed to start',
        `${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n\n` +
          `Details were written to:\n${logPath()}`
      )
    } catch {
      // A failing dialog (e.g. no display) must not mask the original error.
    }
    app.exit(1)
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
  // Closing the console during shutdown must not reset its remembered floating mode.
  consoleRedockOnClose = false
  resolveAbort?.abort()
  jobPool?.shutdown()
  killAllChildren()
  terminateAnalyzeClient()
  terminateMediaClient()
  // If a background-downloaded update is waiting, swap it in after we exit (no relaunch).
  installPendingUpdateOnQuit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
