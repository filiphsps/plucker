import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { stripId3, audioContentHash } from './audio-hash'

/** Build a synthetic ID3v2 header for a payload of `payloadLen` bytes (synchsafe size). */
function id3v2(payloadLen: number, footer = false): Buffer {
  const header = Buffer.alloc(10)
  header.write('ID3', 0, 'latin1')
  header[3] = 0x04 // version major
  header[4] = 0x00 // version minor
  header[5] = footer ? 0x10 : 0x00 // flags (0x10 = footer present)
  header[6] = (payloadLen >> 21) & 0x7f
  header[7] = (payloadLen >> 14) & 0x7f
  header[8] = (payloadLen >> 7) & 0x7f
  header[9] = payloadLen & 0x7f
  const payload = Buffer.alloc(payloadLen, 0xaa)
  const parts = [header, payload]
  if (footer) {
    const ftr = Buffer.alloc(10)
    ftr.write('3DI', 0, 'latin1')
    parts.push(ftr)
  }
  return Buffer.concat(parts)
}

/** Build a synthetic 128-byte ID3v1 trailer. */
function id3v1(): Buffer {
  const b = Buffer.alloc(128, 0x00)
  b.write('TAG', 0, 'latin1')
  return b
}

const AUDIO = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06])

describe('stripId3', () => {
  it('removes a leading ID3v2 tag', () => {
    const buf = Buffer.concat([id3v2(40), AUDIO])
    expect(stripId3(buf)).toEqual(AUDIO)
  })

  it('removes a leading ID3v2 tag that declares a footer', () => {
    const buf = Buffer.concat([id3v2(40, true), AUDIO])
    expect(stripId3(buf)).toEqual(AUDIO)
  })

  it('removes a trailing ID3v1 tag', () => {
    const buf = Buffer.concat([AUDIO, id3v1()])
    expect(stripId3(buf)).toEqual(AUDIO)
  })

  it('removes both ID3v2 and ID3v1 wrappers', () => {
    const buf = Buffer.concat([id3v2(64), AUDIO, id3v1()])
    expect(stripId3(buf)).toEqual(AUDIO)
  })

  it('returns the whole buffer when there are no tags', () => {
    expect(stripId3(AUDIO)).toEqual(AUDIO)
  })
})

describe('audioContentHash', () => {
  it('hashes only the audio frames', () => {
    const buf = Buffer.concat([id3v2(40), AUDIO, id3v1()])
    const expected = createHash('sha256').update(AUDIO).digest('hex')
    expect(audioContentHash(buf)).toBe(expected)
  })

  it('is stable when only the tags change', () => {
    const tagged = Buffer.concat([id3v2(40), AUDIO, id3v1()])
    const retagged = Buffer.concat([id3v2(120), AUDIO]) // different tags, same audio
    expect(audioContentHash(tagged)).toBe(audioContentHash(retagged))
  })

  it('differs when the audio differs', () => {
    const a = audioContentHash(Buffer.concat([id3v2(40), AUDIO]))
    const b = audioContentHash(Buffer.concat([id3v2(40), Buffer.from([0xff, 0xfb, 0x99])]))
    expect(a).not.toBe(b)
  })
})
