import { createHash } from 'node:crypto'

/**
 * Strip ID3 metadata from an MP3 buffer, returning only the audio frames.
 *
 * Removes a leading ID3v2 tag (10-byte header + synchsafe-sized body + optional
 * 10-byte footer) and a trailing 128-byte ID3v1 tag. The result is independent
 * of any tag edits, so it can be content-hashed for stable identity.
 */
export function stripId3(buf: Buffer): Buffer {
  let start = 0
  if (buf.length >= 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    // ID3v2: bytes 6-9 are a synchsafe (7-bit) integer body length.
    const size = (buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]
    const footer = (buf[5] & 0x10) !== 0 ? 10 : 0
    start = 10 + size + footer
  }
  let end = buf.length
  if (end - start >= 128 && buf.toString('latin1', end - 128, end - 125) === 'TAG') {
    end -= 128
  }
  return buf.subarray(start, end)
}

/** sha256 (hex) of an MP3's audio frames, ignoring ID3 tags. */
export function audioContentHash(buf: Buffer): string {
  return createHash('sha256').update(stripId3(buf)).digest('hex')
}
