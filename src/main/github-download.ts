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
import { net } from 'electron'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'

const LATEST_RELEASE_API = 'https://api.github.com/repos/filiphsps/plucker/releases/latest'

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

/** Stream a URL to `destPath`, reporting 0–100 progress when a length is known. */
function downloadToFile(
  url: string,
  destPath: string,
  onProgress?: (percent: number) => void
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
      res.on('data', (c) => {
        received += c.length
        out.write(c)
        if (onProgress && total > 0) onProgress(Math.round((received / total) * 100))
      })
      res.on('end', () => out.end(() => resolve()))
      res.on('error', (err) => {
        out.destroy()
        reject(err)
      })
    })
    req.on('error', reject)
    req.end()
  })
}

/**
 * Download the latest macOS release zip for the running architecture into `destDir`
 * and resolve its on-disk path. Throws when the latest release has no matching asset.
 */
export async function downloadLatestMacZip(opts: {
  destDir: string
  arch: string
  onProgress?: (percent: number) => void
}): Promise<string> {
  const release = await fetchJson(LATEST_RELEASE_API)
  const asset = pickArchZip(release.assets ?? [], opts.arch)
  if (!asset) {
    throw new Error(`no macOS ${opts.arch} update asset in the latest release`)
  }
  const dest = join(opts.destDir, asset.name)
  await downloadToFile(asset.browser_download_url, dest, opts.onProgress)
  return dest
}
