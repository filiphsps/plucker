// src/main/transforms/rename.ts
import type { ConfigField } from '../../shared/transforms'
import type { TransformDefinition, TrackContext, TransformServices } from './types'
import { buildFileName } from '../rename'

export interface RenameConfig {
  template: string
}

const CONFIG_SCHEMA: ConfigField[] = [
  {
    key: 'template',
    labelKey: 'transforms.rename.fields.template',
    type: 'string',
    default: '{artist} - {track}. {title} - {album} ({year})'
  }
]

export const renameTransform: TransformDefinition<RenameConfig> = {
  type: 'rename',
  apiVersion: 1,
  labelKey: 'transforms.rename.label',
  descriptionKey: 'transforms.rename.description',
  allowMultiple: false,
  failureMode: 'skip',
  configSchema: CONFIG_SCHEMA,
  defaultConfig: { template: '{artist} - {track}. {title} - {album} ({year})' },
  async run(ctx: TrackContext, config: RenameConfig, services: TransformServices): Promise<void> {
    const name = buildFileName(config.template, ctx.tags)
    if (name) {
      ctx.outputName = name
      services.log.info(`output name "${name}.mp3" (template "${config.template}")`)
    } else {
      services.log.warn(`template "${config.template}" produced an empty name — keeping original`)
    }
  }
}
