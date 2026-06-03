import { describe, it, expect } from 'vitest'
import { parseMp3Info } from './mp3-info'

// MPEG1 Layer III, stereo, 320 kbps, 44100 Hz: FF FB E0 00.
//   byte1 0xFB = 111(sync) 11(MPEG1) 01(LayerIII) 1(no-CRC)
//   byte2 0xE0 = 1110(bitrate idx 14 = 320) 00(srate idx 0 = 44100) 0(pad) 0
//   byte3 0x00 = 00(stereo) ...
const V1_STEREO_320 = [0xff, 0xfb, 0xe0, 0x00]
const V1_FRAME_LEN = Math.floor(((1152 / 8) * 320000) / 44100) // 1044

function putHeader(buf: Buffer, off: number, header: number[]): void {
  for (let k = 0; k < header.length; k++) buf[off + k] = header[k]
}

describe('parseMp3Info', () => {
  it('parses a CBR 320 stereo MPEG1 stream and estimates duration from byte count', () => {
    // Two frames so the first frame's next-sync validation passes.
    const buf = Buffer.alloc(V1_FRAME_LEN * 2)
    putHeader(buf, 0, V1_STEREO_320)
    putHeader(buf, V1_FRAME_LEN, V1_STEREO_320)
    const info = parseMp3Info(buf)
    expect(info).not.toBeNull()
    expect(info).toMatchObject({ codec: 'mp3', bitrateKbps: 320, sampleRateHz: 44100, channels: 2 })
    // duration ≈ bytes*8 / 320000
    expect(info!.durationSec).toBeCloseTo((buf.length * 8) / 320000, 2)
  })

  it('reads accurate duration from a Xing (frame-count) header', () => {
    // header(4) + sideInfo(32 for MPEG1 stereo) then the "Xing" tag.
    const buf = Buffer.alloc(64)
    putHeader(buf, 0, V1_STEREO_320)
    buf.write('Xing', 36, 'latin1')
    buf.writeUInt32BE(0x00000001, 40) // flags: frames present
    buf.writeUInt32BE(1000, 44) // 1000 frames
    const info = parseMp3Info(buf)
    expect(info).not.toBeNull()
    // 1000 frames * 1152 samples / 44100 Hz ≈ 26.12 s
    expect(info!.durationSec).toBeCloseTo((1000 * 1152) / 44100, 2)
    expect(info!.bitrateKbps).toBe(320)
  })

  it('recovers the average bitrate for VBR from the Xing byte count', () => {
    const frames = 1000
    const bytes = 700000
    const buf = Buffer.alloc(64)
    putHeader(buf, 0, V1_STEREO_320)
    buf.write('Info', 36, 'latin1')
    buf.writeUInt32BE(0x00000003, 40) // flags: frames + bytes
    buf.writeUInt32BE(frames, 44)
    buf.writeUInt32BE(bytes, 48)
    const info = parseMp3Info(buf)
    const duration = (frames * 1152) / 44100
    expect(info!.bitrateKbps).toBe(Math.round((bytes * 8) / duration / 1000))
    expect(info!.bitrateKbps).not.toBe(320) // proves the average overrode the header
  })

  it('parses a mono MPEG2 header (22050 Hz, 128 kbps)', () => {
    // MPEG2 LIII mono: FF F3 C0 C0
    //   byte1 0xF3 = 111 10(MPEG2) 01(LIII) 1
    //   byte2 0xC0 = 1100(idx12 = 128 in V2 table) 00(srate idx0 = 22050) 0 0
    //   byte3 0xC0 = 11(mono)
    const buf = Buffer.alloc(64)
    putHeader(buf, 0, [0xff, 0xf3, 0xc0, 0xc0])
    const info = parseMp3Info(buf)
    expect(info).toMatchObject({
      codec: 'mp3',
      bitrateKbps: 128,
      sampleRateHz: 22050,
      channels: 1
    })
  })

  it('skips a leading ID3v2 tag before the first frame', () => {
    const id3 = Buffer.alloc(10)
    id3.write('ID3', 0, 'latin1')
    id3[3] = 0x03 // version
    // synchsafe size = 20 → body of 20 bytes
    id3[9] = 20
    const body = Buffer.alloc(20)
    const audio = Buffer.alloc(V1_FRAME_LEN * 2)
    putHeader(audio, 0, V1_STEREO_320)
    putHeader(audio, V1_FRAME_LEN, V1_STEREO_320)
    const info = parseMp3Info(Buffer.concat([id3, body, audio]))
    expect(info).toMatchObject({ codec: 'mp3', bitrateKbps: 320, sampleRateHz: 44100 })
  })

  it('returns null for a buffer with no frame sync', () => {
    expect(parseMp3Info(Buffer.from('not an mp3 at all, just text padding'.repeat(4)))).toBeNull()
  })

  it('rejects a false 0xFF that is not a real frame header', () => {
    // 0xFF followed by bytes that fail the layer/bitrate checks, no valid frame.
    expect(parseMp3Info(Buffer.from([0xff, 0x00, 0xff, 0x12, 0x34, 0xff, 0xff]))).toBeNull()
  })
})
