import { stripId3 } from './audio-hash'
import type { AudioInfo } from './audio-meta'

// We always output MP3, so the technical audio block can be read straight from
// the file's frame header instead of spawning ffmpeg per track. On older Intel
// hardware an ffmpeg cold-start dominates the probe cost; parsing in-process
// removes that subprocess entirely (ffmpeg stays only as a fallback).

// MPEG version IDs as encoded in the header (bits 4-3 of byte 1).
const MPEG1 = 3
const MPEG2 = 2
const MPEG25 = 0

// Layer III bitrate tables (kbps) indexed by the 4-bit bitrate index.
// Index 0 (free) and 15 (bad) are 0 → treated as invalid.
const BITRATE_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
const BITRATE_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]

// Sampling rates (Hz) indexed by the 2-bit sample-rate index, per MPEG version.
const SAMPLE_RATES: Record<number, number[]> = {
  [MPEG1]: [44100, 48000, 32000],
  [MPEG2]: [22050, 24000, 16000],
  [MPEG25]: [11025, 12000, 8000]
}

// Scan only the first few KB for the initial frame sync — a clean LAME file
// starts a frame immediately after any ID3v2 tag stripped by stripId3.
const SYNC_SCAN_LIMIT = 4096

interface FrameHeader {
  version: number
  bitrateKbps: number
  sampleRateHz: number
  channels: number
  samplesPerFrame: number
  sideInfoSize: number
  /** Total bytes of this frame, used to validate the next sync + walk the stream. */
  frameLength: number
}

/** Parse the 4-byte MPEG audio frame header at offset `i`, or null if invalid. */
function parseFrameHeader(b: Buffer, i: number): FrameHeader | null {
  if (i + 4 > b.length) return null
  // Frame sync: 11 set bits (0xFFE).
  if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null
  const version = (b[i + 1] >> 3) & 0x03 // 0=2.5, 1=reserved, 2=2, 3=1
  if (version === 1) return null
  const layer = (b[i + 1] >> 1) & 0x03 // 1 = Layer III (the only layer we emit)
  if (layer !== 1) return null
  const bitrateIndex = (b[i + 2] >> 4) & 0x0f
  const srIndex = (b[i + 2] >> 2) & 0x03
  if (srIndex === 3) return null
  const bitrateKbps = (version === MPEG1 ? BITRATE_V1_L3 : BITRATE_V2_L3)[bitrateIndex]
  if (!bitrateKbps) return null
  const sampleRateHz = SAMPLE_RATES[version][srIndex]
  const padding = (b[i + 2] >> 1) & 0x01
  const channels = ((b[i + 3] >> 6) & 0x03) === 3 ? 1 : 2
  const samplesPerFrame = version === MPEG1 ? 1152 : 576
  // Side-info block size depends on version + channel count.
  const sideInfoSize = version === MPEG1 ? (channels === 1 ? 17 : 32) : channels === 1 ? 9 : 17
  // Layer III: bytesPerFrame = samplesPerFrame/8 * bitrate / sampleRate + padding.
  const frameLength =
    Math.floor(((samplesPerFrame / 8) * (bitrateKbps * 1000)) / sampleRateHz) + padding
  return {
    version,
    bitrateKbps,
    sampleRateHz,
    channels,
    samplesPerFrame,
    sideInfoSize,
    frameLength
  }
}

function readU32BE(b: Buffer, off: number): number {
  return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0
}

/** Read a Xing/Info VBR header (frame + byte counts) from the stream's first frame. */
function readXing(
  b: Buffer,
  frameStart: number,
  h: FrameHeader
): { frames?: number; bytes?: number } | null {
  const off = frameStart + 4 + h.sideInfoSize
  if (off + 8 > b.length) return null
  const tag = b.toString('latin1', off, off + 4)
  if (tag !== 'Xing' && tag !== 'Info') return null
  const flags = readU32BE(b, off + 4)
  let p = off + 8
  let frames: number | undefined
  let bytes: number | undefined
  if (flags & 0x1) {
    frames = readU32BE(b, p)
    p += 4
  }
  if (flags & 0x2) {
    bytes = readU32BE(b, p)
  }
  return { frames, bytes }
}

/**
 * Derive {@link AudioInfo} from an MP3 buffer without ffmpeg, or null when the
 * file isn't a parseable MP3 (the caller then falls back to ffmpeg).
 */
export function parseMp3Info(buf: Buffer): AudioInfo | null {
  const frames = stripId3(buf)

  // Locate the first valid frame, confirming the next sync lands where the
  // header says it should (or the stream simply ends) to reject false positives.
  let start = -1
  let header: FrameHeader | null = null
  const limit = Math.min(frames.length - 4, SYNC_SCAN_LIMIT)
  for (let i = 0; i <= limit; i++) {
    if (frames[i] !== 0xff) continue
    const h = parseFrameHeader(frames, i)
    if (!h) continue
    const next = i + h.frameLength
    const validated =
      next + 2 > frames.length || (frames[next] === 0xff && (frames[next + 1] & 0xe0) === 0xe0)
    if (validated) {
      start = i
      header = h
      break
    }
  }
  if (start < 0 || !header) return null

  const xing = readXing(frames, start, header)
  let bitrateKbps = header.bitrateKbps
  let durationSec: number | undefined
  if (xing?.frames) {
    durationSec = (xing.frames * header.samplesPerFrame) / header.sampleRateHz
    // VBR: recover the true average bitrate from the stream byte count.
    if (xing.bytes && durationSec > 0)
      bitrateKbps = Math.round((xing.bytes * 8) / durationSec / 1000)
  } else {
    // CBR with no Xing header: estimate duration from the audio byte count.
    durationSec = ((frames.length - start) * 8) / (bitrateKbps * 1000)
  }

  return {
    codec: 'mp3',
    bitrateKbps,
    sampleRateHz: header.sampleRateHz,
    channels: header.channels,
    durationSec: Math.round(durationSec * 100) / 100
  }
}
