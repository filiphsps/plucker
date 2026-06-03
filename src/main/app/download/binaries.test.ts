import { describe, it, expect } from 'vitest'
import { binaryPaths } from './binaries'

describe('binaryPaths', () => {
  it('uses resources/bin in dev', () => {
    const p = binaryPaths({
      packaged: false,
      arch: 'arm64',
      resourcesPath: '/app/res',
      projectRoot: '/proj'
    })
    expect(p.ytdlp).toBe('/proj/resources/bin/arm64/yt-dlp/yt-dlp_macos')
    expect(p.ffmpeg).toBe('/proj/resources/bin/arm64/ffmpeg')
  })
  it('uses resourcesPath when packaged', () => {
    const p = binaryPaths({
      packaged: true,
      arch: 'x64',
      resourcesPath: '/app/res',
      projectRoot: '/proj'
    })
    expect(p.ytdlp).toBe('/app/res/bin/x64/yt-dlp/yt-dlp_macos')
    expect(p.ffmpeg).toBe('/app/res/bin/x64/ffmpeg')
  })
})
