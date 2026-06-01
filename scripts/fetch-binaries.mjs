// Sets up the bundled binaries the app needs (yt-dlp + ffmpeg) under resources/bin/
// so Plucker works out of the box. Runs automatically on `postinstall` (host arch
// only) and is idempotent. Safe to re-run manually:
//   pnpm fetch-binaries          # host arch only (dev)
//   pnpm fetch-binaries --all    # both arm64 + x64 (for packaging two DMGs)
//
// Layout produced (matches src/main/binaries.ts → binaryPaths):
//   resources/bin/universal/yt-dlp     (universal2 macOS binary, macOS 10.15+)
//   resources/bin/<arch>/ffmpeg        (static build per arch)
import { mkdirSync, chmodSync, existsSync, copyFileSync, createWriteStream } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BIN = join(ROOT, 'resources', 'bin')
const HOST_ARCH = process.arch === 'arm64' ? 'arm64' : 'x64'

// Always-valid asset: GitHub's "latest" redirect resolves to the newest release.
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'

// Static ffmpeg builds (gzipped), pinned to the ffmpeg-static release. Per-arch env
// overrides win if set. These let us bundle ffmpeg for an arch other than the host.
const FFMPEG_RELEASE = 'b6.1.1'
const ffmpegUrl = (arch) =>
  process.env[`FFMPEG_${arch.toUpperCase()}_URL`] ??
  `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_RELEASE}/ffmpeg-darwin-${arch}.gz`

async function downloadTo(url, dest) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`)
  mkdirSync(dirname(dest), { recursive: true })
  const body = Readable.fromWeb(res.body)
  const stream = url.endsWith('.gz') ? pipeline(body, createGunzip(), createWriteStream(dest)) : pipeline(body, createWriteStream(dest))
  await stream
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

  // Fast path for the host arch: reuse the binary the ffmpeg-static dep already
  // downloaded (decompressed). Other arches always come from the pinned URL.
  if (arch === HOST_ARCH && !process.env[`FFMPEG_${arch.toUpperCase()}_URL`]) {
    try {
      const src = createRequire(import.meta.url)('ffmpeg-static')
      if (src && existsSync(src)) {
        mkdirSync(dirname(dest), { recursive: true })
        copyFileSync(src, dest)
        chmodSync(dest, 0o755)
        console.log('✓ ffmpeg →', dest)
        return
      }
    } catch {
      // fall through to URL download
    }
  }

  console.log(`↓ downloading ffmpeg (${arch}) …`)
  await downloadTo(ffmpegUrl(arch), dest)
  console.log('✓ ffmpeg →', dest)
}

async function main() {
  const all = process.argv.includes('--all')
  const arches = all ? ['arm64', 'x64'] : [HOST_ARCH]
  console.log(`Setting up binaries (${arches.join(', ')}) …`)
  await ensureYtDlp()
  for (const arch of arches) await ensureFfmpeg(arch)
  console.log('Binary setup complete.')
}

main().catch((err) => {
  // Never brick `pnpm install` on a transient network failure — warn loudly and
  // let the user re-run `pnpm fetch-binaries` once they have connectivity.
  console.warn(`\n⚠ Binary setup incomplete: ${err.message}`)
  console.warn('  Plucker needs yt-dlp + ffmpeg. Run `pnpm fetch-binaries` to retry.\n')
  process.exit(0)
})
