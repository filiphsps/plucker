// src/main/transforms/square-cover.ts
import type { ConfigField } from '../../shared/transforms'
import type { TransformDefinition, TrackContext, TransformServices } from './types'
import { readCoverImage, embedCover } from '../tagger'
import { cropToSquare } from '../image-crop'

export type SquareCoverConfig = Record<string, never>

interface SquareCoverDeps {
  // readCover/embed may run off-thread (Promise) or inline (sync) — both awaited.
  readCover: (
    file: string
  ) => Promise<{ image: Buffer; mime: string } | null> | ({ image: Buffer; mime: string } | null)
  crop: (image: Buffer, mime: string) => Promise<{ image: Buffer; mime: string }>
  embed: (file: string, image: Buffer, mime: string) => Promise<void> | void
  log?: (msg: string) => void
}

/**
 * Center-crop the file's embedded cover to a square and re-embed it. No-ops
 * when the file has no cover. Injectable deps keep the I/O (ID3 read/write,
 * ffmpeg) out of the unit under test.
 */
export async function squareCover(file: string, deps: SquareCoverDeps): Promise<void> {
  const cover = await deps.readCover(file)
  if (!cover) {
    deps.log?.('no embedded cover — skipping')
    return
  }
  deps.log?.(`cropping cover to square (${cover.image.length} bytes, ${cover.mime})`)
  const squared = await deps.crop(cover.image, cover.mime)
  await deps.embed(file, squared.image, squared.mime)
  deps.log?.(`embedded squared cover (${squared.image.length} bytes)`)
}

const CONFIG_SCHEMA: ConfigField[] = []

export const squareCoverTransform: TransformDefinition<SquareCoverConfig> = {
  type: 'square-cover',
  apiVersion: 1,
  labelKey: 'transforms.squareCover.label',
  descriptionKey: 'transforms.squareCover.description',
  allowMultiple: false,
  failureMode: 'skip',
  configSchema: CONFIG_SCHEMA,
  defaultConfig: {},
  async run(
    ctx: TrackContext,
    _config: SquareCoverConfig,
    services: TransformServices
  ): Promise<void> {
    const media = services.media
    await squareCover(ctx.workingFile, {
      readCover: media ? (file) => media.readCover(file) : readCoverImage,
      crop: (image, mime) =>
        cropToSquare(services.bin.ffmpeg, image, mime, services.signal, services.groupKey),
      embed: media ? (file, image, mime) => media.embedCover(file, image, mime) : embedCover,
      log: (msg) => services.log.info(msg)
    })
  }
}
