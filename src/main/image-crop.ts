// src/main/image-crop.ts
import { spawnManaged } from './spawn'
import { imageSize } from '../shared/image-size'

/** Cover art Plucker handles; anything else falls back to JPEG encoding. */
function isPng(mime: string): boolean {
  return mime.toLowerCase() === 'image/png'
}

/**
 * ffmpeg argv that reads an image from stdin, center-crops it to a square the
 * size of its shorter side (ffmpeg defaults the crop origin to the center), and
 * writes the result to stdout. PNG sources stay lossless; everything else is
 * re-encoded as JPEG.
 */
export function ffmpegCropArgs(mime: string): string[] {
  const out = isPng(mime)
    ? ['-c:v', 'png', '-f', 'image2pipe']
    : ['-c:v', 'mjpeg', '-q:v', '2', '-f', 'image2pipe']
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    'pipe:0',
    '-vf',
    "crop='min(iw,ih)':'min(iw,ih)'",
    ...out,
    'pipe:1'
  ]
}

/**
 * Center-crop an in-memory cover image to a square via the bundled ffmpeg.
 *
 * Already-square images are returned untouched, so a square cover is never
 * re-encoded (no quality loss, no subprocess). Non-square images are piped
 * through ffmpeg; the cropped bytes are returned with their (possibly changed)
 * mime type.
 */
export function cropToSquare(
  ffmpegPath: string,
  image: Buffer,
  mime: string,
  signal?: AbortSignal
): Promise<{ image: Buffer; mime: string }> {
  const size = imageSize(image)
  if (size && size.width === size.height) return Promise.resolve({ image, mime })

  const outMime = isPng(mime) ? 'image/png' : 'image/jpeg'
  return new Promise((resolve, reject) => {
    const child = spawnManaged(ffmpegPath, ffmpegCropArgs(mime), {}, signal)
    const chunks: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => chunks.push(d))
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      const out = Buffer.concat(chunks)
      if (code === 0 && out.length > 0) resolve({ image: out, mime: outMime })
      else reject(new Error(`ffmpeg crop failed (code ${code}): ${stderr.trim()}`))
    })
    child.stdin.on('error', () => {
      /* broken pipe if ffmpeg exits early — the close handler reports it */
    })
    child.stdin.end(image)
  })
}
