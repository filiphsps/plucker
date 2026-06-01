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
    ytdlp: join(base, 'universal', 'yt-dlp'),
    ffmpeg: join(base, env.arch, 'ffmpeg')
  }
}
