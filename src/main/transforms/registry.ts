// src/main/transforms/registry.ts
import type { TransformManifest } from '../../shared/transforms'
import type { TransformDefinition } from './types'
import { autoTagTransform } from './auto-tag'
import { analyzeKeyBpmTransform } from './analyze-key-bpm'
import { renameTransform } from './rename'
import { squareCoverTransform } from './square-cover'
import { trimSilenceTransform } from './trim-silence'

const BUILTINS: TransformDefinition[] = [
  autoTagTransform as unknown as TransformDefinition,
  trimSilenceTransform as unknown as TransformDefinition,
  analyzeKeyBpmTransform as unknown as TransformDefinition,
  renameTransform as unknown as TransformDefinition,
  squareCoverTransform as unknown as TransformDefinition
]

export function buildRegistry(): Map<string, TransformDefinition> {
  return new Map(BUILTINS.map((d) => [d.type, d]))
}

/** Serializable manifests for the renderer (everything except run). */
export function getCatalog(): TransformManifest[] {
  return BUILTINS.map((d) => ({
    type: d.type,
    apiVersion: d.apiVersion,
    labelKey: d.labelKey,
    descriptionKey: d.descriptionKey,
    allowMultiple: d.allowMultiple,
    configSchema: d.configSchema,
    defaultConfig: d.defaultConfig
  }))
}
