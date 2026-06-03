// src/main/audio-pcm.ts
import { spawnManaged } from '@app/app/process/spawn'

/** Injectable I/O so the decode orchestration is unit-testable without ffmpeg. */
export interface PcmDeps {
  /** Run ffmpeg with the given args; resolve with the raw stdout bytes. */
  run: (args: string[]) => Promise<Buffer>
}

/** ffmpeg args to decode `file` to raw mono float32 little-endian PCM on stdout. */
export function decodeArgs(file: string, sampleRate: number): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    file,
    '-ac',
    '1',
    '-ar',
    String(sampleRate),
    '-f',
    'f32le',
    '-'
  ]
}

/** Parse f32le bytes into a Float32Array (alignment-safe; drops a partial tail). */
export function parsePcm(buf: Buffer): Float32Array {
  const count = Math.floor(buf.length / 4)
  const out = new Float32Array(count)
  for (let i = 0; i < count; i++) out[i] = buf.readFloatLE(i * 4)
  return out
}

/** Decode `file` to mono float32 PCM at `sampleRate`. */
export async function decodePcm(
  file: string,
  sampleRate: number,
  deps: PcmDeps
): Promise<Float32Array> {
  const bytes = await deps.run(decodeArgs(file, sampleRate))
  return parsePcm(bytes)
}

/** Real ffmpeg-backed deps for {@link decodePcm}. Collects stdout to a Buffer. */
export function ffmpegPcmDeps(
  ffmpegPath: string,
  signal?: AbortSignal,
  groupKey?: number
): PcmDeps {
  return {
    run: (args) =>
      new Promise<Buffer>((resolve, reject) => {
        const child = spawnManaged(ffmpegPath, args, {}, signal, undefined, groupKey)
        const chunks: Buffer[] = []
        let stderr = ''
        child.stdout.on('data', (d: Buffer) => chunks.push(d))
        child.stderr.on('data', (d: Buffer) => {
          stderr += d.toString()
        })
        child.on('error', reject)
        child.on('close', (code) => {
          if (code === 0) resolve(Buffer.concat(chunks))
          else reject(new Error(`ffmpeg decode failed (code ${code}): ${stderr.trim()}`))
        })
      })
  }
}
