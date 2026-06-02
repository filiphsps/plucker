import { app, shell, BrowserWindow, ipcMain, dialog, systemPreferences, screen } from 'electron'
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
  resetSettings,
  expandHome,
  logPath,
  migrateLegacyConfig,
  pluckerDir
} from './settings'
import { loadWindowBounds, saveWindowBounds, isOnScreen } from './window-state'
import { log, addLogTransport, getLogTail, installProcessErrorHandlers } from './log'
import { createFileTransport } from './log-file'
import { binaryPaths, type BinaryPaths } from './binaries'
import {
  runPipeline,
  resolveJob,
  buildDownloadSourceFromEntries,
  type JobControls,
  type RunJobDeps
} from './pipeline'
import { buildRetransformSource, type RetransformTarget } from './retransform-source'
import {
  createCheckpointSink,
  listCheckpoints,
  deleteCheckpoint,
  dismissCheckpoint,
  readCheckpoint
} from './job-checkpoint'
import {
  partitionCheckpoint,
  mergeResumed,
  outcomeFromTracks,
  synthesizeEntry
} from './resume-merge'
import { getAnalyzeClient, terminateAnalyzeClient } from './workers/analyze-host'
import { getMediaClient, terminateMediaClient } from './workers/media-host'
import { getCatalog } from './transforms/registry'
import { readCoverDataUrl, writeTrackTags } from './tagger'
import { getTrackMetadata, forBinaries } from './metadata'
import { getWaveform, forWaveform } from './waveform'
import { addEntry, entryFiles, removeEntry, removeTrack, updateTrack } from './history'
import { addUrl, removeUrl } from '../shared/url-history'
import { killAllChildren, pauseAllChildren, resumeAllChildren } from './spawn'
import { registerUpdaterIpc, startBackgroundUpdates, installPendingUpdateOnQuit } from './updater'
import { registerContextMenuIpc } from './context-menu'
import { buildAppMenu, primeMenuIcons } from './menu'
import { getAccentColor } from './accent'
import { createMetadataCache, type MetadataCache, type CacheRecord } from './metadata-cache'
import type {
  Settings,
  HistoryEntry,
  CachedTrack,
  TrackTags,
  StartJobRequest,
  JobCheckpoint
} from '../shared/types'

// Set the app name as early as possible so the macOS app menu + About panel
// (built when the app becomes ready) read "Plucker" instead of "Electron".
app.setName('Plucker')

// Surface otherwise-fatal errors into the unified log (file + dev console) instead of
// letting them vanish into a silent crash. Installed before any async work runs.
installProcessErrorHandlers()

let mainWindow: BrowserWindow | null = null
let consoleWindow: BrowserWindow | null = null
// When the console window is destroyed we normally redock (mode → docked). The app
// shutdown / main-window-close path sets this false so a floating console is
// remembered and reopens floating next launch.
let consoleRedockOnClose = true
let abort: AbortController | null = null
/** Checkpoint id of the job currently running (download or resume), for resumability. */
let activeJobId: string | null = null
let metaCache: MetadataCache | null = null
/** Per-track controls for the live job, set by runPipeline via onControls. */
let jobControls: JobControls | null = null
/** Cookie file exported during the last job:resolve, reused by the next job:start. */
let pendingResolve: { url: string; cookieFile?: string } | null = null

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

  // History.
  ipcMain.handle('history:get', () => loadSettings().history)
  ipcMain.handle('history:removeEntry', (_e, id: string, deleteFiles: boolean) => {
    const s = loadSettings()
    if (deleteFiles) {
      // Delete only the files this entry owns — never the shared destination
      // folder, which would clobber other jobs' downloads (same-url redownloads,
      // or every job when per-playlist subfolders are off).
      const entry = s.history.find((h) => h.id === id)
      for (const file of entryFiles(entry)) rmSync(file, { force: true })
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
    // SIGKILL reaches stopped processes fine, but a paused job leaves the
    // module-level flag set — clear it so the next job's children aren't frozen.
    resumeAllChildren()
    getWindow()?.webContents.send('job:paused', false)
    abort?.abort()
  })
  ipcMain.handle('job:pause', () => {
    pauseAllChildren()
    getWindow()?.webContents.send('job:paused', true)
  })
  ipcMain.handle('job:resume', () => {
    resumeAllChildren()
    getWindow()?.webContents.send('job:paused', false)
  })
  // Per-track controls routed to the live job's controls handle.
  ipcMain.handle('job:skipTrack', (_e, index: number) => jobControls?.skipTrack(index))
  ipcMain.handle('job:pauseTrack', (_e, index: number) => {
    jobControls?.pauseTrack(index)
    getWindow()?.webContents.send('job:trackPaused', index, true)
  })
  ipcMain.handle('job:resumeTrack', (_e, index: number) => {
    jobControls?.resumeTrack(index)
    getWindow()?.webContents.send('job:trackPaused', index, false)
  })

  // Resolve a URL to its entries WITHOUT downloading, for the staging list. Stash
  // any exported cookie file so the subsequent job:start can reuse it.
  ipcMain.handle('job:resolve', async (_e, url: string) => {
    const settings = loadSettings()
    abort = new AbortController()
    const { job, cookieFile } = await resolveJob(url, {
      bin: currentBin(),
      settings,
      onStatus: (s) => getWindow()?.webContents.send('job:status', s),
      signal: abort.signal
    })
    pendingResolve = { url, cookieFile }
    return job
  })

  ipcMain.handle('job:start', async (_e, req: StartJobRequest) => {
    const settings = loadSettings()
    // A fresh job always starts unpaused; clear any lingering paused state from a
    // prior run that was cancelled mid-pause.
    resumeAllChildren()
    getWindow()?.webContents.send('job:paused', false)
    abort = new AbortController()
    activeJobId = randomUUID()
    const sink = createCheckpointSink(jobsDir(), activeJobId, () => Date.now())
    // Reuse the cookie file exported while resolving this exact URL (if any).
    const cookieFile = pendingResolve?.url === req.url ? pendingResolve.cookieFile : undefined
    pendingResolve = null
    const deps: RunJobDeps = {
      bin: currentBin(),
      settings,
      homeBase: expandHome(settings.downloads.baseFolder),
      cache: getMetaCache(),
      analyze: (file, config) =>
        getAnalyzeClient().analyze(file, config, currentBin().ffmpeg, abort?.signal),
      media: getMediaClient(),
      checkpoint: sink,
      onProgress: (p) => {
        const win = getWindow()
        win?.webContents.send('job:progress', p)
        win?.setProgressBar(p.overall > 0 && p.overall < 1 ? p.overall : p.overall >= 1 ? 1 : -1)
      },
      onStatus: (s) => getWindow()?.webContents.send('job:status', s),
      signal: abort.signal,
      folderOverride: req.folderOverride,
      onControls: (c) => {
        jobControls = c
      }
    }
    try {
      const result = await runPipeline(buildDownloadSourceFromEntries(req, deps, cookieFile), deps)
      getWindow()?.setProgressBar(-1)

      // Record every resolved job — including all-failed and cancelled ones —
      // so the user always sees the outcome. (Re-load fresh so we don't clobber
      // edits made during the run.) A user cancel becomes a resumable `interrupted`
      // entry; a genuine finish has nothing to resume.
      const cancelled = abort?.signal.aborted ?? false
      const entry: HistoryEntry = {
        id: randomUUID(),
        jobId: activeJobId ?? undefined,
        url: result.url,
        title: result.title,
        folder: result.folder,
        kind: result.kind,
        completedAt: new Date().toISOString(),
        outcome: cancelled ? 'interrupted' : result.outcome,
        tracks: result.tracks
      }
      const fresh = loadSettings()
      saveSettings(settingsPath(), { ...fresh, history: addEntry(fresh.history, entry) })
      getWindow()?.webContents.send('history:changed')
      if (!cancelled && activeJobId) deleteCheckpoint(jobsDir(), activeJobId)
      if (cancelled) getWindow()?.webContents.send('jobs:interruptedChanged')
    } catch (err) {
      getWindow()?.setProgressBar(-1)
      const cancelled = abort?.signal.aborted ?? false
      const message = err instanceof Error ? err.message : String(err)

      // The job threw before producing a result. Record a minimal failed/cancelled
      // entry so the attempt is still visible in history.
      const fresh = loadSettings()
      const entry: HistoryEntry = {
        id: randomUUID(),
        url: req.url,
        title: req.title || req.url,
        folder: req.folderOverride ?? expandHome(fresh.downloads.baseFolder),
        kind: req.kind,
        completedAt: new Date().toISOString(),
        outcome: cancelled ? 'cancelled' : 'failed',
        reason: message,
        tracks: []
      }
      saveSettings(settingsPath(), { ...fresh, history: addEntry(fresh.history, entry) })
      getWindow()?.webContents.send('history:changed')

      // A job that threw before producing a result left no useful checkpoint to
      // resume (resolution typically failed before any track ran) — drop it.
      if (activeJobId) deleteCheckpoint(jobsDir(), activeJobId)

      // Don't flash a red error panel for a deliberate cancellation.
      if (!cancelled) {
        log.error('app', 'job failed:', err)
        getWindow()?.webContents.send('job:status', { phase: 'error', error: message })
      } else {
        log.info('app', 'job cancelled')
      }
      throw err
    } finally {
      jobControls = null
      activeJobId = null
    }
  })

  ipcMain.handle('job:retransform', async (_e, targets: RetransformTarget[]) => {
    const fresh = loadSettings()
    // Resolve each target to a concrete file from current history (status 'done'
    // + a real path). Anything else is dropped — the renderer already filtered,
    // this is the trust-but-verify backstop.
    const resolved: RetransformTarget[] = []
    for (const tgt of targets) {
      const track = fresh.history.find((h) => h.id === tgt.entryId)?.tracks[tgt.index]
      if (track?.status === 'done' && track.file) {
        resolved.push({ ...tgt, file: track.file, title: track.title, videoId: track.videoId })
      }
    }
    if (resolved.length === 0) return

    // A fresh run always starts unpaused; clear any lingering paused state.
    resumeAllChildren()
    getWindow()?.webContents.send('job:paused', false)
    abort = new AbortController()
    try {
      const result = await runPipeline(buildRetransformSource(resolved), {
        bin: currentBin(),
        settings: fresh,
        homeBase: expandHome(fresh.downloads.baseFolder),
        cache: getMetaCache(),
        analyze: (file, config) =>
          getAnalyzeClient().analyze(file, config, currentBin().ffmpeg, abort?.signal),
        media: getMediaClient(),
        onProgress: (p) => {
          const win = getWindow()
          win?.webContents.send('job:progress', p)
          win?.setProgressBar(p.overall > 0 && p.overall < 1 ? p.overall : p.overall >= 1 ? 1 : -1)
        },
        signal: abort.signal
      })
      getWindow()?.setProgressBar(-1)

      // Fold each successfully re-transformed track back into history in place.
      // result.tracks is index-aligned with `resolved`. Skip non-done results so a
      // failed transform never clobbers a still-intact original.
      const latest = loadSettings()
      let history = latest.history
      result.tracks.forEach((tk, i) => {
        if (tk.status !== 'done') return
        const tgt = resolved[i]
        history = updateTrack(history, tgt.entryId, tgt.index, {
          file: tk.file,
          title: tk.title,
          artist: tk.artist,
          album: tk.album,
          year: tk.year,
          hash: tk.hash
        })
      })
      saveSettings(settingsPath(), { ...latest, history })
      getWindow()?.webContents.send('history:changed')
    } catch (err) {
      getWindow()?.setProgressBar(-1)
      const cancelled = abort?.signal.aborted ?? false
      if (!cancelled) {
        const message = err instanceof Error ? err.message : String(err)
        log.error('app', 'retransform failed:', err)
        getWindow()?.webContents.send('job:status', { phase: 'error', error: message })
      } else {
        log.info('app', 'retransform cancelled')
      }
    }
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

  /** Shared deps for a resume/retry run (mirrors job:start's wiring). */
  const resumeDeps = (settings: Settings, checkpoint?: RunJobDeps['checkpoint']): RunJobDeps => ({
    bin: currentBin(),
    settings,
    homeBase: expandHome(settings.downloads.baseFolder),
    cache: getMetaCache(),
    analyze: (file, config) =>
      getAnalyzeClient().analyze(file, config, currentBin().ffmpeg, abort?.signal),
    media: getMediaClient(),
    checkpoint,
    onProgress: (p) => {
      const win = getWindow()
      win?.webContents.send('job:progress', p)
      win?.setProgressBar(p.overall > 0 && p.overall < 1 ? p.overall : p.overall >= 1 ? 1 : -1)
    },
    onStatus: (s) => getWindow()?.webContents.send('job:status', s),
    signal: abort?.signal,
    onControls: (c) => {
      jobControls = c
    }
  })

  /** Resume an interrupted job from its checkpoint: re-download only the pending tracks. */
  const runResume = async (cp: JobCheckpoint): Promise<void> => {
    const settings = loadSettings()
    const { completed, pending } = partitionCheckpoint(cp)
    resumeAllChildren()
    getWindow()?.webContents.send('job:paused', false)
    abort = new AbortController()
    activeJobId = cp.jobId
    const sink = createCheckpointSink(jobsDir(), cp.jobId, () => Date.now())
    const req: StartJobRequest = {
      url: cp.url,
      title: cp.jobTitle,
      kind: cp.kind,
      entries: pending.map((e) => ({ videoId: e.videoId ?? '', title: e.title, index: e.index })),
      folderOverride: cp.folder
    }
    try {
      const deps = resumeDeps(settings, sink)
      const result = await runPipeline(buildDownloadSourceFromEntries(req, deps), deps)
      getWindow()?.setProgressBar(-1)
      const cancelled = abort?.signal.aborted ?? false
      const resumed = result.tracks.map((track, i) => ({ index: pending[i].index, track }))
      const merged = mergeResumed(completed, resumed)
      const fresh = loadSettings()
      const entry: HistoryEntry = {
        id: fresh.history.find((h) => h.jobId === cp.jobId)?.id ?? randomUUID(),
        jobId: cp.jobId,
        url: cp.url,
        title: cp.jobTitle,
        folder: cp.folder,
        kind: cp.kind,
        completedAt: new Date().toISOString(),
        outcome: cancelled ? 'interrupted' : outcomeFromTracks(merged),
        tracks: merged
      }
      saveSettings(settingsPath(), { ...fresh, history: addEntry(fresh.history, entry) })
      getWindow()?.webContents.send('history:changed')
      if (!cancelled) deleteCheckpoint(jobsDir(), cp.jobId)
      getWindow()?.webContents.send('jobs:interruptedChanged')
    } catch (err) {
      getWindow()?.setProgressBar(-1)
      if (!(abort?.signal.aborted ?? false)) {
        const message = err instanceof Error ? err.message : String(err)
        log.error('app', 'resume failed:', err)
        getWindow()?.webContents.send('job:status', { phase: 'error', error: message })
      }
    } finally {
      jobControls = null
      activeJobId = null
    }
  }

  /** Retry just the failed tracks of a finished history entry, merging results in place. */
  const runRetryFailed = async (entryId: string): Promise<void> => {
    const settings = loadSettings()
    const src = settings.history.find((h) => h.id === entryId)
    if (!src) return
    const failed = src.tracks
      .map((t, index) => ({ t, index }))
      .filter(({ t }) => t.status === 'failed')
    if (failed.length === 0) return
    resumeAllChildren()
    getWindow()?.webContents.send('job:paused', false)
    abort = new AbortController()
    const req: StartJobRequest = {
      url: src.url,
      title: src.title,
      kind: src.kind,
      entries: failed.map(({ t }, i) => ({
        videoId: t.videoId ?? '',
        title: t.title,
        index: i + 1
      })),
      folderOverride: src.folder
    }
    try {
      const deps = resumeDeps(settings)
      const result = await runPipeline(buildDownloadSourceFromEntries(req, deps), deps)
      getWindow()?.setProgressBar(-1)
      const latest = loadSettings()
      const current = latest.history.find((h) => h.id === entryId)?.tracks ?? src.tracks
      const tracks = [...current]
      result.tracks.forEach((rt, i) => {
        if (rt.status === 'done') tracks[failed[i].index] = rt
      })
      const history = latest.history.map((h) =>
        h.id === entryId ? { ...h, tracks, outcome: outcomeFromTracks(tracks) } : h
      )
      saveSettings(settingsPath(), { ...latest, history })
      getWindow()?.webContents.send('history:changed')
    } catch (err) {
      getWindow()?.setProgressBar(-1)
      if (!(abort?.signal.aborted ?? false)) log.error('app', 'retry-failed failed:', err)
    } finally {
      jobControls = null
    }
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
  ipcMain.handle('jobs:resume', async (_e, jobId: string) => {
    const cp = readCheckpoint(join(jobsDir(), `${jobId}.json`))
    if (cp) await runResume(cp)
  })
  ipcMain.handle('jobs:retryFailed', async (_e, entryId: string) => {
    await runRetryFailed(entryId)
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
  const alwaysOnTop = loadSettings().developer.consoleWindow.alwaysOnTop

  const win = new BrowserWindow({
    width: onScreen?.width ?? 560,
    height: onScreen?.height ?? 440,
    ...(onScreen ? { x: onScreen.x, y: onScreen.y } : {}),
    show: false,
    title: `Console — ${app.getName()}`,
    backgroundColor: '#0a0b0e',
    alwaysOnTop,
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  consoleWindow = win
  consoleRedockOnClose = true

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
 * Crash recovery: any checkpoint that outlived a crash has no (or a stale) history
 * entry. Synthesize an `interrupted` entry for it so it shows in History, then tell
 * the renderer to surface the resume banner once the window has loaded.
 */
function recoverInterruptedJobs(): void {
  const checkpoints = listCheckpoints(jobsDir())
  if (checkpoints.length === 0) return
  const fresh = loadSettings()
  let history = fresh.history
  for (const cp of checkpoints) {
    if (history.some((h) => h.jobId === cp.jobId)) continue
    history = addEntry(history, synthesizeEntry(cp, randomUUID(), new Date().toISOString()))
  }
  if (history !== fresh.history) saveSettings(settingsPath(), { ...fresh, history })
  const win = mainWindow
  const push = (): void => {
    win?.webContents.send('history:changed')
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
  abort?.abort()
  killAllChildren()
  terminateAnalyzeClient()
  terminateMediaClient()
  // If a background-downloaded update is waiting, swap it in after we exit (no relaunch).
  installPendingUpdateOnQuit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
