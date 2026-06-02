// src/main/transforms/square-cover.ts
import type { ConfigField } from '../../shared/transforms'
import type { TransformDefinition, TrackContext, TransformServices } from './types'
import { readCoverImage, embedCover } from '../tagger'
import { cropToSquare } from '../image-crop'

export type SquareCoverConfig = Record<string, never>

interface SquareCoverDeps {
  readCover: (file: string) => { image: Buffer; mime: string } | null
  crop: (image: Buffer, mime: string) => Promise<{ image: Buffer; mime: string }>
  embed: (file: string, image: Buffer, mime: string) => void
  log?: (msg: string) => void
}

/**
 * Center-crop the file's embedded cover to a square and re-embed it. No-ops
 * when the file has no cover. Injectable deps keep the I/O (ID3 read/write,
 * ffmpeg) out of the unit under test.
 */
export async function squareCover(file: string, deps: SquareCoverDeps): Promise<void> {
  const cover = deps.readCover(file)
  if (!cover) {
    deps.log?.('no embedded cover — skipping')
    return
  }
  const squared = await deps.crop(cover.image, cover.mime)
  deps.embed(file, squared.image, squared.mime)
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
    await squareCover(ctx.workingFile, {
      readCover: readCoverImage,
      crop: (image, mime) => cropToSquare(services.bin.ffmpeg, image, mime, services.signal),
      embed: embedCover,
      log: (msg) => services.log(`[square-cover] ${msg}`)
    })
  }
}
