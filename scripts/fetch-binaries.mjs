// Sets up the bundled binaries the app needs (yt-dlp + ffmpeg) under resources/bin/
// so Plucker works out of the box. Runs automatically on `postinstall` (host arch
// only) and is idempotent. Safe to re-run manually:
//   pnpm fetch-binaries          # host arch only (dev)
//   pnpm fetch-binaries --all    # both arm64 + x64 (for packaging two DMGs)
//
// Layout produced (matches src/main/app/download/binaries.ts → binaryPaths):
//   resources/bin/<arch>/yt-dlp/yt-dlp_macos   (PyInstaller onedir: exe + _internal/)
//   resources/bin/<arch>/ffmpeg                (static build per arch)
import { mkdirSync, chmodSync, existsSync, copyFileSync, createWriteStream, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BIN = join(ROOT, 'resources', 'bin')
const HOST_ARCH = process.arch === 'arm64' ? 'arm64' : 'x64'

// We bundle the *onedir* macOS build (yt-dlp_macos.zip): the executable beside an
// `_internal/` runtime, which runs in place instead of self-extracting a whole
// Python runtime to a temp dir on every spawn (onefile). That self-extraction is
// what makes yt-dlp brutally slow on older Intel Macs, where we launch it once
// per track.
//
// Per-arch yt-dlp source (GitHub repo + version). All ship the onedir
// `yt-dlp_macos.zip` — the executable beside an `_internal/` runtime that we unzip
// to resources/bin/<arch>/yt-dlp/yt-dlp_macos.
//   arm64 → latest stable.
//   x64   → a pinned NIGHTLY build. The stable channel hasn't shipped since
//           2026.03.17, whose extractor stopped resolving some YouTube videos on the
//           x86_64 slice (every track failing as "format not available"). The nightly
//           channel rebuilds daily with current extractor fixes. We pin a specific
//           nightly (rather than track latest-nightly) so a future build can't
//           silently change behavior or raise the macOS floor.
//
//           Ventura floor: yt-dlp_macos is universal2; the real floor is the highest
//           `minos` across its bundled native libs (curl_cffi etc.). This nightly's
//           x86_64 slice + every bundled lib target macOS 11, comfortably below our
//           Ventura (13) support floor. Re-verify before bumping:
//             vtool -show-build <unzipped>/yt-dlp_macos
//             find <unzipped>/_internal -name '*.so' -o -name '*.dylib'  # check each minos
const YTDLP_SOURCE = {
  arm64: { repo: 'yt-dlp/yt-dlp', version: 'latest' },
  x64: { repo: 'yt-dlp/yt-dlp-nightly-builds', version: '2026.05.25.234532' }
}
const ytdlpUrl = (arch) => {
  const { repo, version } = YTDLP_SOURCE[arch]
  const base =
    version === 'latest'
      ? `https://github.com/${repo}/releases/latest/download`
      : `https://github.com/${repo}/releases/download/${version}`
  return `${base}/yt-dlp_macos.zip`
}

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
  const stream = url.endsWith('.gz')
    ? pipeline(body, createGunzip(), createWriteStream(dest))
    : pipeline(body, createWriteStream(dest))
  await stream
  chmodSync(dest, 0o755)
}

async function ensureYtDlp(arch) {
  const dir = join(BIN, arch, 'yt-dlp')
  const exe = join(dir, 'yt-dlp_macos')
  if (existsSync(exe)) {
    console.log(`✓ yt-dlp (${arch}) already present`)
    return
  }
  console.log(`↓ downloading yt-dlp (${arch}, ${YTDLP_SOURCE[arch].version}) …`)
  const zip = join(BIN, arch, 'yt-dlp_macos.zip')
  await downloadTo(ytdlpUrl(arch), zip)
  mkdirSync(dir, { recursive: true })
  // Onedir zip → resources/bin/<arch>/yt-dlp/{yt-dlp_macos,_internal/…}. Use the
  // system unzip (always present on macOS, where these binaries are used).
  execFileSync('unzip', ['-oq', zip, '-d', dir])
  rmSync(zip)
  chmodSync(exe, 0o755)
  console.log(`✓ yt-dlp (${arch}) →`, exe)
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
  for (const arch of arches) {
    await ensureYtDlp(arch)
    await ensureFfmpeg(arch)
  }
  console.log('Binary setup complete.')
}

main().catch((err) => {
  // Never brick `pnpm install` on a transient network failure — warn loudly and
  // let the user re-run `pnpm fetch-binaries` once they have connectivity.
  console.warn(`\n⚠ Binary setup incomplete: ${err.message}`)
  console.warn('  Plucker needs yt-dlp + ffmpeg. Run `pnpm fetch-binaries` to retry.\n')
  process.exit(0)
})
