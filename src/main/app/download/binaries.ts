import { join } from 'node:path'

export interface BinaryEnv {
  packaged: boolean
  arch: 'arm64' | 'x64'
  resourcesPath: string
  projectRoot: string
}

export interface BinaryPaths {
  ytdlp: string
  ffmpeg: string
}

export function binaryPaths(env: BinaryEnv): BinaryPaths {
  const base = env.packaged
    ? join(env.resourcesPath, 'bin')
    : join(env.projectRoot, 'resources', 'bin')
  return {
    // yt-dlp ships per-arch as a PyInstaller *onedir* folder: the `yt-dlp_macos`
    // executable beside an `_internal/` runtime. Running it in place avoids the
    // self-extraction the onefile build performs on every launch — a big win on
    // older Intel Macs, where we spawn yt-dlp once per track.
    ytdlp: join(base, env.arch, 'yt-dlp', 'yt-dlp_macos'),
    ffmpeg: join(base, env.arch, 'ffmpeg')
  }
}
