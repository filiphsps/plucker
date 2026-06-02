// src/shared/image-size.test.ts
import { describe, it, expect } from 'vitest'
import { imageSize } from './image-size'

/** Minimal PNG: 8-byte signature + IHDR chunk carrying width/height. */
function pngOf(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(8 + 13 + 4) // len + 'IHDR' + 13 data + crc
  ihdr.writeUInt32BE(13, 0)
  ihdr.write('IHDR', 4, 'ascii')
  ihdr.writeUInt32BE(width, 8)
  ihdr.writeUInt32BE(height, 12)
  return Buffer.concat([sig, ihdr])
}

/** Minimal JPEG: SOI + a SOF0 frame header carrying height/width. */
function jpegOf(width: number, height: number): Buffer {
  const soi = Buffer.from([0xff, 0xd8])
  const sof = Buffer.alloc(2 + 2 + 1 + 2 + 2) // marker + len + precision + h + w
  sof.writeUInt16BE(0xffc0, 0) // SOF0
  sof.writeUInt16BE(8 + 9 - 2, 2) // segment length (precision+h+w+comp count covered loosely)
  sof.writeUInt8(8, 4) // precision
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  return Buffer.concat([soi, sof])
}

describe('imageSize', () => {
  it('reads PNG dimensions from the IHDR chunk', () => {
    expect(imageSize(pngOf(640, 480))).toEqual({ width: 640, height: 480 })
  })

  it('reads JPEG dimensions from the SOF0 marker', () => {
    expect(imageSize(jpegOf(1280, 720))).toEqual({ width: 1280, height: 720 })
  })

  it('finds the SOF marker after preceding APP segments in a JPEG', () => {
    const soi = Buffer.from([0xff, 0xd8])
    // APP0 (JFIF-like) segment to skip over: marker + length(16) + 14 bytes
    const app0 = Buffer.alloc(2 + 16)
    app0.writeUInt16BE(0xffe0, 0)
    app0.writeUInt16BE(16, 2)
    const sof = jpegOf(300, 300).subarray(2) // drop the SOI from the helper
    expect(imageSize(Buffer.concat([soi, app0, sof]))).toEqual({ width: 300, height: 300 })
  })

  it('returns null for data that is neither PNG nor JPEG', () => {
    expect(imageSize(Buffer.from('not an image'))).toBeNull()
  })

  it('returns null for a truncated JPEG with no SOF marker', () => {
    expect(imageSize(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBeNull()
  })
})
