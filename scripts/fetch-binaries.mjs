// Sets up the bundled binaries the app needs (yt-dlp + ffmpeg) under resources/bin/
// so Plucker works out of the box. Runs automatically on `postinstall` and is
// idempotent (skips anything already present). Safe to re-run manually:
//   pnpm fetch-binaries
//
// Layout produced (matches src/main/binaries.ts → binaryPaths):
//   resources/bin/universal/yt-dlp     (universal2 macOS binary, macOS 10.15+)
//   resources/bin/<arch>/ffmpeg        (static build for the current arch)
//
// ffmpeg comes from the `ffmpeg-static` dependency (downloaded for the host arch
// during install). To bundle the *other* arch's ffmpeg when packaging both DMGs,
// set FFMPEG_ARM64_URL / FFMPEG_X64_URL to verified static-build URLs.
import { mkdirSync, chmodSync, existsSync, copyFileSync, createWriteStream } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BIN = join(ROOT, 'resources', 'bin')
const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64'

// Always-valid asset: GitHub's "latest" redirect resolves to the newest release.
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'

async function downloadTo(url, dest) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`)
  mkdirSync(dirname(dest), { recursive: true })
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  chmodSync(dest, 0o755)
}

async function ensureYtDlp() {
  const dest = join(BIN, 'universal', 'yt-dlp')
  if (existsSync(dest)) {
    console.log('✓ yt-dlp already present')
    return
  }
  console.log('↓ downloading yt-dlp …')
  await downloadTo(YTDLP_URL, dest)
  console.log('✓ yt-dlp →', dest)
}

async function ensureFfmpeg(arch) {
  const dest = join(BIN, arch, 'ffmpeg')
  if (existsSync(dest)) {
    console.log(`✓ ffmpeg (${arch}) already present`)
    return
  }

  // Explicit per-arch URL override (used to fetch the non-host arch for packaging).
  const urlOverride = process.env[`FFMPEG_${arch.toUpperCase()}_URL`]
  if (urlOverride) {
    console.log(`↓ downloading ffmpeg (${arch}) …`)
    await downloadTo(urlOverride, dest)
    console.log('✓ ffmpeg →', dest)
    return
  }

  // Default: copy the host-arch binary provided by the ffmpeg-static dependency.
  if (arch !== ARCH) {
    throw new Error(
      `no ffmpeg source for ${arch} (host is ${ARCH}); set FFMPEG_${arch.toUpperCase()}_URL`
    )
  }
  const require = createRequire(import.meta.url)
  let src
  try {
    src = require('ffmpeg-static')
  } catch {
    src = null
  }
  if (!src || !existsSync(src)) {
    throw new Error('ffmpeg-static binary missing — run `pnpm install` to fetch it')
  }
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(src, dest)
  chmodSync(dest, 0o755)
  console.log('✓ ffmpeg →', dest)
}

async function main() {
  console.log(`Setting up binaries for ${process.platform}/${ARCH} …`)
  await ensureYtDlp()
  await ensureFfmpeg(ARCH)
  console.log('Binary setup complete.')
}

main().catch((err) => {
  // Never brick `pnpm install` on a transient network failure — warn loudly and
  // let the user re-run `pnpm fetch-binaries` once they have connectivity.
  console.warn(`\n⚠ Binary setup incomplete: ${err.message}`)
  console.warn('  Plucker needs yt-dlp + ffmpeg. Run `pnpm fetch-binaries` to retry.\n')
  process.exit(0)
})
