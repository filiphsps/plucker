// src/main/transforms/trim-silence.ts
import { renameSync } from 'node:fs'
import type { ConfigField } from '../../shared/transforms'
import type { TransformDefinition, TrackContext, TransformServices } from './types'
import type { TrimMode } from '../../shared/silence-filter'
import { trimSilence, ffmpegTrimDeps } from '../audio-trim'

export interface TrimSilenceConfig {
  mode: TrimMode
  thresholdDb: number
  minDurationSec: number
}

const CONFIG_SCHEMA: ConfigField[] = [
  {
    key: 'mode',
    labelKey: 'transforms.trimSilence.fields.mode',
    type: 'enum',
    default: 'both',
    options: [
      { value: 'both', labelKey: 'transforms.trimSilence.modes.both' },
      { value: 'start', labelKey: 'transforms.trimSilence.modes.start' },
      { value: 'end', labelKey: 'transforms.trimSilence.modes.end' },
      { value: 'none', labelKey: 'transforms.trimSilence.modes.none' }
    ]
  },
  {
    key: 'thresholdDb',
    labelKey: 'transforms.trimSilence.fields.thresholdDb',
    type: 'number',
    default: -90,
    min: -120,
    max: 0
  },
  {
    key: 'minDurationSec',
    labelKey: 'transforms.trimSilence.fields.minDurationSec',
    type: 'number',
    default: 0.1,
    min: 0
  }
]

/**
 * Trim leading/trailing silence from the working audio file. Re-encodes only
 * when there is edge silence to remove (see trimSilence), then replaces the
 * working file in place. Multiple instances are allowed (e.g. a strict pass plus
 * a looser one).
 */
export const trimSilenceTransform: TransformDefinition<TrimSilenceConfig> = {
  type: 'trim-silence',
  apiVersion: 1,
  labelKey: 'transforms.trimSilence.label',
  descriptionKey: 'transforms.trimSilence.description',
  allowMultiple: true,
  failureMode: 'skip',
  configSchema: CONFIG_SCHEMA,
  defaultConfig: { mode: 'both', thresholdDb: -90, minDurationSec: 0.1 },
  async run(
    ctx: TrackContext,
    config: TrimSilenceConfig,
    services: TransformServices
  ): Promise<void> {
    if (config.mode === 'none') {
      services.log.debug('mode=none — nothing to do')
      return
    }
    const result = await trimSilence(
      ctx.workingFile,
      config,
      ffmpegTrimDeps(services.bin.ffmpeg, services.signal)
    )
    const settings = `mode=${config.mode}, threshold ${config.thresholdDb}dB, min ${config.minDurationSec}s`
    if (result.trimmed) {
      renameSync(result.file, ctx.workingFile)
      const ends: string[] = []
      if (result.leadingSec > 0) ends.push(`${result.leadingSec.toFixed(2)}s from start`)
      if (result.trailingSec > 0) ends.push(`${result.trailingSec.toFixed(2)}s from end`)
      const removed = ends.length ? ends.join(' + ') : 'edge silence'
      services.log.info(`trimmed ${removed} (${settings})`)
    } else {
      services.log.debug(`no edge silence to trim (${settings})`)
    }
  }
}
