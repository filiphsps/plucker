// Direct GitHub release download for the macOS self-updater.
//
// electron-updater's MacUpdater.downloadUpdate() can't be used for an unsigned
// build: under the hood it spins up a proxy server and hands the download to
// native Squirrel.Mac, which validates the *running* app's Developer ID signature
// and throws "Could not get code signature for running application". Plucker ships
// unsigned, so that step always fails — the error the user sees in the update card.
//
// We therefore use electron-updater only to *detect* a new version (it parses the
// release's latest-mac.yml, no Squirrel involved) and fetch the per-arch `.zip`
// ourselves straight from the GitHub release via the public API.
//
// `downloadMacUpdate` is the entry point. When a previous build is cached it does
// a *differential* download — diffing the new zip's blockmap against the cached
// one (see differential.ts) and fetching only the changed byte ranges over HTTP
// Range requests, copying the rest (the bulk: bundled binaries) from the cached
// zip. It verifies the assembled zip's SHA-512 and falls back to a full download
// on any problem (no cache, missing blockmap, Range unsupported, or mismatch).
import { net } from 'electron'
import { createWriteStream, createReadStream, openSync, readSync, closeSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { log } from './log'
import { parseBlockmap } from './blockmap'
import {
  planDifferential,
  shouldUseDifferential,
  chunkDownloadOps,
  reconstruct,
  type Op
} from './differential'
import { findCachedUpdate, storeCachedUpdate } from './update-cache'
import { nextPause } from './throttle'
import { formatBytes } from '../shared/format-bytes'

const LATEST_RELEASE_API = 'https://api.github.com/repos/filiphsps/plucker/releases/latest'

/** Cap on a single HTTP range request, so a large changed region streams in pieces. */
const MAX_RANGE_CHUNK = 8 * 1024 * 1024
/** Fold copyable gaps smaller than this into a download to keep request counts low. */
const MERGE_GAP = 64 * 1024

/** Raised when the server ignored our Range header (HTTP 200), so we fall back to a full download. */
class RangeUnsupportedError extends Error {}

/** Coarse progress phases emitted by `downloadMacUpdate` for the UI ticker. */
export type DownloadStatus =
  | { phase: 'downloading'; reusePercent?: number } // transfer started (reusePercent set for differential)
  | { phase: 'verifying' } // bytes in hand; checking integrity before install

export interface GithubAsset {
  name: string
  browser_download_url: string
  size: number
}

/**
 * Pick the macOS update zip matching the running architecture from a release's
 * assets. electron-builder tags the arm64 zip with "arm64" in its file name; the
 * x64 zip is whichever remaining `.zip` does not. Returns null when no suitable
 * asset is present. (`.zip.blockmap` and `.dmg` assets are ignored.)
 */
export function pickArchZip(assets: GithubAsset[], arch: string): GithubAsset | null {
  const zips = assets.filter((a) => a.name.endsWith('.zip'))
  const exact = zips.find((a) => a.name.includes(arch))
  if (exact) return exact
  // Older electron-builder defaults omit the arch tag from the x64 artifact name.
  if (arch === 'x64') return zips.find((a) => !a.name.includes('arm64')) ?? null
  return null
}

/** Find the `.blockmap` asset that accompanies a given zip (named `<zip>.blockmap`). */
export function pickBlockmapFor(assets: GithubAsset[], zipName: string): GithubAsset | null {
  return assets.find((a) => a.name === `${zipName}.blockmap`) ?? null
}

/** GET a URL via Electron's net stack and parse the JSON body (follows redirects). */
function fetchJson(url: string): Promise<{ assets?: GithubAsset[] }> {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, method: 'GET' })
    req.setHeader('User-Agent', 'Plucker-Updater')
    req.setHeader('Accept', 'application/vnd.github+json')
    req.on('response', (res) => {
      const status = res.statusCode ?? 0
      if (status >= 400) {
        reject(new Error(`GitHub API request failed: HTTP ${status}`))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

/**
 * Consume a response stream, handing each chunk to `onChunk`, while pacing it to
 * `throttleBytesPerSec` (0 = unthrottled). Pacing uses a one-second token bucket:
 * once a window's byte budget is spent the stream is paused for the rest of the
 * second (see throttle.ts). Resolves at end-of-stream; rejects on stream error.
 */
function consumeResponse(
  res: Electron.IncomingMessage,
  throttleBytesPerSec: number,
  onChunk: (chunk: Buffer) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    let windowStart = Date.now()
    let windowBytes = 0
    res.on('data', (c: Buffer) => {
      onChunk(c)
      if (throttleBytesPerSec <= 0) return
      windowBytes += c.length
      if (windowBytes < throttleBytesPerSec) return
      const pause = nextPause(windowBytes, throttleBytesPerSec, Date.now() - windowStart)
      // Electron's IncomingMessage is a Readable at runtime; its type omits pause/resume.
      const flow = res as unknown as { pause(): void; resume(): void }
      if (pause > 0) {
        flow.pause()
        setTimeout(() => {
          windowStart = Date.now()
          windowBytes = 0
          flow.resume()
        }, pause)
      } else {
        windowStart = Date.now()
        windowBytes = 0
      }
    })
    res.on('end', () => resolve())
    res.on('error', reject)
  })
}

/** Stream a URL to `destPath`, reporting 0–100 progress when a length is known. */
function downloadToFile(
  url: string,
  destPath: string,
  opts: { onProgress?: (percent: number) => void; throttleBytesPerSec?: number } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, method: 'GET' })
    req.setHeader('User-Agent', 'Plucker-Updater')
    req.on('response', (res) => {
      const status = res.statusCode ?? 0
      if (status >= 400) {
        reject(new Error(`update download failed: HTTP ${status}`))
        return
      }
      const total = Number(res.headers['content-length'] ?? 0)
      let received = 0
      const out = createWriteStream(destPath)
      out.on('error', reject)
      consumeResponse(res, opts.throttleBytesPerSec ?? 0, (c) => {
        received += c.length
        out.write(c)
        if (opts.onProgress && total > 0) opts.onProgress(Math.round((received / total) * 100))
      })
        .then(() => out.end(() => resolve()))
        .catch((err) => {
          out.destroy()
          reject(err)
        })
    })
    req.on('error', reject)
    req.end()
  })
}

/** Base64 SHA-512 of a file — the format electron-builder records in latest-mac.yml. */
export function sha512OfFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (c) => hash.update(c))
    stream.on('end', () => resolve(hash.digest('base64')))
  })
}

/** Fetch bytes [start, end) from `url` via an HTTP range request. Throws if the server ignores it. */
function fetchRange(
  url: string,
  start: number,
  end: number,
  throttleBytesPerSec = 0
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, method: 'GET' })
    req.setHeader('User-Agent', 'Plucker-Updater')
    req.setHeader('Range', `bytes=${start}-${end - 1}`) // HTTP ranges are inclusive
    req.on('response', (res) => {
      const status = res.statusCode ?? 0
      if (status === 200) {
        // Range ignored — the whole body would stream back. Abort and bail to a full download.
        req.abort()
        reject(new RangeUnsupportedError('server ignored Range header'))
        return
      }
      if (status !== 206) {
        reject(new Error(`range request failed: HTTP ${status}`))
        return
      }
      const chunks: Buffer[] = []
      consumeResponse(res, throttleBytesPerSec, (c) => chunks.push(c))
        .then(() => resolve(Buffer.concat(chunks)))
        .catch(reject)
    })
    req.on('error', reject)
    req.end()
  })
}

/** Read `size` bytes from an open file descriptor at `offset`. */
function readAt(fd: number, offset: number, size: number): Buffer {
  const buf = Buffer.allocUnsafe(size)
  let read = 0
  while (read < size) {
    const n = readSync(fd, buf, read, size - read, offset + read)
    if (n === 0) break
    read += n
  }
  return buf
}

/**
 * Reconstruct the new zip at `destPath` from the cached old zip plus ranged
 * downloads of the new zip, following `ops`. Streams to a write stream; copies
 * are read from the old zip's fd. Throws `RangeUnsupportedError` if the CDN
 * ignores Range, letting the caller fall back to a full download.
 */
async function assembleDifferential(opts: {
  ops: Op[]
  oldZipPath: string
  newZipUrl: string
  destPath: string
  downloadBytes: number
  throttleBytesPerSec?: number
  onProgress?: (percent: number) => void
}): Promise<void> {
  const out = createWriteStream(opts.destPath)
  const write = (chunk: Buffer): Promise<void> =>
    new Promise((resolve, reject) => out.write(chunk, (err) => (err ? reject(err) : resolve())))
  const oldFd = openSync(opts.oldZipPath, 'r')
  try {
    const plan = { ops: opts.ops, downloadBytes: opts.downloadBytes, copyBytes: 0, totalBytes: 0 }
    await reconstruct(
      plan,
      async (offset, size) => readAt(oldFd, offset, size),
      async (start, end) => fetchRange(opts.newZipUrl, start, end, opts.throttleBytesPerSec ?? 0),
      write,
      (downloaded) => {
        if (opts.downloadBytes > 0) {
          opts.onProgress?.(Math.round((downloaded / opts.downloadBytes) * 100))
        }
      }
    )
  } finally {
    closeSync(oldFd)
    await new Promise<void>((resolve) => out.end(resolve))
  }
}

/**
 * Download the macOS update zip for `arch`, using a differential download when a
 * cached previous zip is available and worthwhile, otherwise a full download.
 * Verifies the result against `expectedSha512` (when provided), refreshes the
 * cache for next time, and resolves the on-disk zip path. Any differential
 * failure (missing pieces, range unsupported, checksum mismatch) transparently
 * falls back to a full download.
 */
export async function downloadMacUpdate(opts: {
  destDir: string
  cacheDir: string
  arch: string
  expectedSha512?: string
  /** Cap network throughput (bytes/sec) for the large transfers; 0 = full speed. */
  throttleBytesPerSec?: number
  onProgress?: (percent: number) => void
  /** Coarse phase updates for the UI ticker: the actual transfer, then verification. */
  onStatus?: (status: DownloadStatus) => void
}): Promise<string> {
  const { destDir, cacheDir, arch, expectedSha512, onProgress, onStatus } = opts
  const throttle = opts.throttleBytesPerSec ?? 0
  log.info('app', `update download starting (arch=${arch}, throttle=${throttle} B/s)`)
  const release = await fetchJson(LATEST_RELEASE_API)
  const assets = release.assets ?? []
  const zipAsset = pickArchZip(assets, arch)
  if (!zipAsset) throw new Error(`no macOS ${arch} update asset in the latest release`)
  const blockmapAsset = pickBlockmapFor(assets, zipAsset.name)
  const zipDest = join(destDir, zipAsset.name)
  log.info(
    'app',
    `update asset: ${zipAsset.name} (${formatBytes(zipAsset.size)}), blockmap=${blockmapAsset ? 'yes' : 'no'}`
  )

  let newBlockmapPath: string | null = null
  let differential = false

  const base = findCachedUpdate(cacheDir)
  if (!base) log.info('app', 'no cached build to diff against — full download')
  else if (!blockmapAsset) log.info('app', 'release has no blockmap — full download')
  else if (!expectedSha512) log.info('app', 'no expected checksum available — full download')

  if (base && blockmapAsset && expectedSha512) {
    try {
      log.info('app', `differential candidate: diffing against cached ${base.zipPath}`)
      newBlockmapPath = join(destDir, blockmapAsset.name)
      await downloadToFile(blockmapAsset.browser_download_url, newBlockmapPath, {
        throttleBytesPerSec: throttle
      })
      const oldBlocks = parseBlockmap(await readFile(base.blockmapPath)).blocks
      const newBlocks = parseBlockmap(await readFile(newBlockmapPath)).blocks
      const plan = planDifferential(oldBlocks, newBlocks, { mergeGap: MERGE_GAP })
      const ranges = plan.ops.filter((o) => o.kind === 'download').length
      log.info(
        'app',
        `diff plan: download ${formatBytes(plan.downloadBytes)} in ${ranges} range(s), ` +
          `reuse ${formatBytes(plan.copyBytes)} of ${formatBytes(plan.totalBytes)}`
      )
      if (shouldUseDifferential(plan)) {
        const saved = Math.round((plan.copyBytes / plan.totalBytes) * 100)
        log.info('app', `differential update: reusing ${saved}% from the cached build`)
        onStatus?.({ phase: 'downloading', reusePercent: saved })
        await assembleDifferential({
          ops: chunkDownloadOps(plan.ops, MAX_RANGE_CHUNK),
          oldZipPath: base.zipPath,
          newZipUrl: zipAsset.browser_download_url,
          destPath: zipDest,
          downloadBytes: plan.downloadBytes,
          throttleBytesPerSec: throttle,
          onProgress
        })
        log.info('app', 'differential download complete, verifying…')
        onStatus?.({ phase: 'verifying' })
        if ((await sha512OfFile(zipDest)) === expectedSha512) {
          differential = true
          log.info('app', 'differential download verified (SHA-512 OK)')
        } else {
          log.warn('app', 'differential result failed verification, downloading full zip')
        }
      } else {
        log.info('app', 'too little to reuse — full download is simpler')
      }
    } catch (err) {
      const why = err instanceof RangeUnsupportedError ? 'range requests unsupported' : err
      log.warn('app', 'differential update failed, downloading full zip:', why)
    }
  }

  if (!differential) {
    log.info('app', `downloading full zip ${zipAsset.name} (${formatBytes(zipAsset.size)})…`)
    onStatus?.({ phase: 'downloading' })
    await downloadToFile(zipAsset.browser_download_url, zipDest, {
      onProgress,
      throttleBytesPerSec: throttle
    })
    log.info('app', 'full download complete, verifying…')
    onStatus?.({ phase: 'verifying' })
    if (expectedSha512 && (await sha512OfFile(zipDest)) !== expectedSha512) {
      throw new Error('update verification failed: SHA-512 mismatch')
    }
    log.info(
      'app',
      expectedSha512 ? 'full download verified (SHA-512 OK)' : 'full download complete'
    )
  }

  // Refresh the cache so the next update can diff against this build.
  try {
    if (!newBlockmapPath && blockmapAsset) {
      newBlockmapPath = join(destDir, blockmapAsset.name)
      await downloadToFile(blockmapAsset.browser_download_url, newBlockmapPath, {
        throttleBytesPerSec: throttle
      })
    }
    if (newBlockmapPath) {
      storeCachedUpdate(cacheDir, zipDest, newBlockmapPath)
      log.info('app', `update cache refreshed for next differential update (${zipAsset.name})`)
    } else {
      log.info('app', 'no blockmap to cache — next update will be a full download')
    }
  } catch (err) {
    log.warn('app', 'could not refresh update cache:', err)
  }

  return zipDest
}
