// src/shared/image-size.ts

/** Pixel dimensions of a raster image. */
export interface ImageSize {
  width: number
  height: number
}

/** SOF markers carry the frame dimensions; SOF4/8/12 (DHT/JPG/DAC) do not. */
function isSofMarker(marker: number): boolean {
  return (
    marker >= 0xffc0 &&
    marker <= 0xffcf &&
    marker !== 0xffc4 &&
    marker !== 0xffc8 &&
    marker !== 0xffcc
  )
}

function pngSize(buf: Buffer): ImageSize | null {
  // 8-byte signature, then IHDR whose data begins at offset 16 (len+type=8 bytes).
  if (buf.length < 24) return null
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

function jpegSize(buf: Buffer): ImageSize | null {
  // Walk the marker segments after SOI until a Start-Of-Frame is found.
  let offset = 2
  while (offset + 9 <= buf.length) {
    if (buf[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = buf.readUInt16BE(offset)
    if (isSofMarker(marker)) {
      // length(2) precision(1) height(2) width(2)
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) }
    }
    // Standalone markers (RSTn, SOI, EOI, TEM) have no length payload.
    if (marker === 0xffd8 || marker === 0xffd9 || (marker >= 0xffd0 && marker <= 0xffd7)) {
      offset += 2
      continue
    }
    const segLen = buf.readUInt16BE(offset + 2)
    if (segLen < 2) return null
    offset += 2 + segLen
  }
  return null
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * Read an image's pixel dimensions from its header without decoding pixels.
 * Supports PNG (IHDR) and JPEG (SOF markers) — the formats Plucker embeds as
 * cover art. Returns null for anything else or a header too truncated to parse.
 */
export function imageSize(buf: Buffer): ImageSize | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return pngSize(buf)
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return jpegSize(buf)
  return null
}
