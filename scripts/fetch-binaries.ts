/**
 * Downloads pinned yt-dlp (universal) + static ffmpeg (arm64, x64) into
 * resources/bin/. Run once after clone and before packaging.
 *   pnpm tsx scripts/fetch-binaries.ts
 */
import { mkdirSync, createWriteStream, chmodSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const ROOT = join(import.meta.dirname, '..')
const BIN = join(ROOT, 'resources', 'bin')

// Pin a known-good yt-dlp release (universal2 macOS binary, supports macOS 10.15+).
const YTDLP_VERSION = '2025.09.26'
const YTDLP_URL = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_macos`

// Static ffmpeg builds (per arch). osxexperts.net publishes signed static builds;
// pin the exact URLs you downloaded and verified. Placeholders below MUST be set
// to real, verified URLs before running.
const FFMPEG = {
  arm64: process.env.FFMPEG_ARM64_URL ?? '',
  x64: process.env.FFMPEG_X64_URL ?? ''
}

async function download(url: string, dest: string): Promise<void> {
  if (!url) throw new Error(`Missing URL for ${dest} (set the env var / pin the URL)`)
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Download failed ${res.status}: ${url}`)
  mkdirSync(join(dest, '..'), { recursive: true })
  await pipeline(
    Readable.fromWeb(res.body as import('node:stream/web').ReadableStream),
    createWriteStream(dest)
  )
  chmodSync(dest, 0o755)
  console.log('✓', dest)
}

async function main(): Promise<void> {
  await download(YTDLP_URL, join(BIN, 'universal', 'yt-dlp'))
  await download(FFMPEG.arm64, join(BIN, 'arm64', 'ffmpeg'))
  await download(FFMPEG.x64, join(BIN, 'x64', 'ffmpeg'))
  if (!existsSync(join(BIN, 'universal', 'yt-dlp'))) throw new Error('yt-dlp missing')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
