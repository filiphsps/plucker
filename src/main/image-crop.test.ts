// src/main/image-crop.test.ts
import { describe, it, expect } from 'vitest'
import { ffmpegCropArgs, cropToSquare } from './image-crop'

/** Minimal PNG header of the given size (enough for imageSize to read). */
function pngOf(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(8 + 13 + 4)
  ihdr.writeUInt32BE(13, 0)
  ihdr.write('IHDR', 4, 'ascii')
  ihdr.writeUInt32BE(width, 8)
  ihdr.writeUInt32BE(height, 12)
  return Buffer.concat([sig, ihdr])
}

describe('ffmpegCropArgs', () => {
  it('reads from stdin, center-crops to the shorter side, writes to stdout', () => {
    const args = ffmpegCropArgs('image/jpeg')
    expect(args).toContain('pipe:0')
    expect(args).toContain('pipe:1')
    const vfIdx = args.indexOf('-vf')
    expect(vfIdx).toBeGreaterThanOrEqual(0)
    expect(args[vfIdx + 1]).toBe("crop='min(iw,ih)':'min(iw,ih)'")
  })

  it('keeps PNG lossless for a PNG source', () => {
    const args = ffmpegCropArgs('image/png')
    const fIdx = args.lastIndexOf('-f')
    expect(args[fIdx + 1]).toBe('image2pipe')
    expect(args).toContain('png')
  })

  it('encodes JPEG output for a JPEG source', () => {
    const args = ffmpegCropArgs('image/jpeg')
    expect(args).toContain('mjpeg')
  })
})

describe('cropToSquare', () => {
  it('returns the original image untouched when it is already square (no ffmpeg)', async () => {
    const square = pngOf(500, 500)
    const result = await cropToSquare('/nonexistent/ffmpeg', square, 'image/png')
    expect(result.image).toBe(square)
    expect(result.mime).toBe('image/png')
  })
})
