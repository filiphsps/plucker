import { describe, it, expect, vi } from 'vitest'
import { decodeArgs, parsePcm, decodePcm } from './audio-pcm'

describe('decodeArgs', () => {
  it('requests mono f32le PCM at the given sample rate to stdout', () => {
    const args = decodeArgs('/tmp/a.mp3', 11025)
    expect(args).toEqual([
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      '/tmp/a.mp3',
      '-ac',
      '1',
      '-ar',
      '11025',
      '-f',
      'f32le',
      '-'
    ])
  })
})

describe('parsePcm', () => {
  it('reads little-endian float32 samples and drops a trailing partial sample', () => {
    const buf = Buffer.alloc(4 * 2 + 1)
    buf.writeFloatLE(0.5, 0)
    buf.writeFloatLE(-0.25, 4)
    const out = parsePcm(buf)
    expect(out.length).toBe(2)
    expect(out[0]).toBeCloseTo(0.5, 6)
    expect(out[1]).toBeCloseTo(-0.25, 6)
  })
})

describe('decodePcm', () => {
  it('runs ffmpeg with the decode args and parses the captured stdout', async () => {
    const buf = Buffer.alloc(4)
    buf.writeFloatLE(1, 0)
    const run = vi.fn(async () => buf)
    const out = await decodePcm('/tmp/a.mp3', 11025, { run })
    expect(run).toHaveBeenCalledWith(decodeArgs('/tmp/a.mp3', 11025))
    expect(out.length).toBe(1)
    expect(out[0]).toBeCloseTo(1, 6)
  })
})
