import { spawnManaged } from '@app/app/process/spawn'
import { hashAudioFile } from './audio-hash'
import type { MetadataCache } from '@app/app/metadata/metadata-cache'
import type { BinaryPaths } from '@app/app/download/binaries'
import type { Waveform } from '@shared/types'

/** Number of bars (and peaks) rendered for a waveform. */
export const WAVEFORM_BARS = 120

/** Decode sample rate — low enough to keep the PCM small, ample for 120 bars. */
const DECODE_HZ = 8000

/**
 * Downsample 16-bit mono PCM to `buckets` normalized peaks. Each bucket is the
 * max absolute amplitude over its slice; the whole set is then scaled so the
 * loudest bucket is 1 (so quiet tracks still fill the strip). Returns `[]` for
 * empty input.
 */
export function pcmToPeaks(samples: Int16Array, buckets: number): number[] {
  if (samples.length === 0) return []
  const out = new Array<number>(buckets).fill(0)
  const per = samples.length / buckets
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * per)
    const end = Math.min(samples.length, Math.floor((b + 1) * per))
    let max = 0
    for (let i = start; i < end; i++) {
      const v = Math.abs(samples[i])
      if (v > max) max = v
    }
    out[b] = max
  }
  const peak = Math.max(...out)
  if (peak === 0) return out
  return out.map((v) => v / peak)
}

/** Injectable I/O for {@link getWaveform} (real impls in {@link forWaveform}). */
export interface WaveformDeps {
  cache: Pick<MetadataCache, 'read'> & { writeWaveform: MetadataCache['writeWaveform'] }
  /** Decode a file to mono 16-bit PCM, or null if it can't be read/decoded. */
  decode: (file: string) => Promise<{ samples: Int16Array; sampleRate: number } | null>
  /** Derive the content hash from the file (to backfill tracks with no hash). */
  hashFile: (file: string) => Promise<string | undefined>
}

/**
 * Resolve the waveform for a file: cache-first, otherwise decode → downsample →
 * cache. Never throws — a decode failure resolves to null so the UI omits the
 * strip. Called only from the `waveform:get` IPC handler (lazy, on first expand).
 */
export async function getWaveform(
  file: string,
  hash: string | undefined,
  deps: WaveformDeps
): Promise<Waveform | null> {
  const key = hash ?? (await deps.hashFile(file))
  const cached = key ? deps.cache.read(key)?.waveform : undefined
  if (cached) return cached

  const decoded = await deps.decode(file)
  if (!decoded) return null

  const waveform: Waveform = {
    peaks: pcmToPeaks(decoded.samples, WAVEFORM_BARS),
    durationSec: decoded.samples.length / decoded.sampleRate
  }
  if (key) deps.cache.writeWaveform(key, waveform)
  return waveform
}

/** Decode a media file to mono 16-bit little-endian PCM via the bundled ffmpeg. */
function decodePcm(
  ffmpegPath: string,
  file: string
): Promise<{ samples: Int16Array; sampleRate: number } | null> {
  return new Promise((resolve) => {
    const child = spawnManaged(ffmpegPath, [
      '-hide_banner',
      '-i',
      file,
      '-ac',
      '1',
      '-ar',
      String(DECODE_HZ),
      '-f',
      's16le',
      'pipe:1'
    ])
    const chunks: Buffer[] = []
    child.stdout.on('data', (d: Buffer) => chunks.push(d))
    child.on('error', () => resolve(null))
    child.on('close', (code) => {
      if (code !== 0 || chunks.length === 0) return resolve(null)
      const buf = Buffer.concat(chunks)
      const samples = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2))
      resolve({ samples, sampleRate: DECODE_HZ })
    })
  })
}

/** Build real {@link WaveformDeps} backed by the bundled ffmpeg + on-disk cache. */
export function forWaveform(bin: BinaryPaths, cache: MetadataCache): WaveformDeps {
  return {
    cache,
    decode: (file) => decodePcm(bin.ffmpeg, file),
    hashFile: async (file) => {
      try {
        return await hashAudioFile(file)
      } catch {
        return undefined
      }
    }
  }
}
