// src/shared/transforms.ts

/** A single configurable field, used to render the settings form generically. */
export type ConfigField =
  | { key: string; labelKey: string; type: 'boolean'; default: boolean }
  | { key: string; labelKey: string; type: 'number'; default: number; min?: number; max?: number }
  | { key: string; labelKey: string; type: 'string'; default: string }
  | {
      key: string
      labelKey: string
      type: 'enum'
      default: string
      options: { value: string; labelKey: string }[]
    }

/** A configured transform in the user's chain (persisted in settings). */
export interface TransformInstance {
  instanceId: string
  type: string
  enabled: boolean
  config: Record<string, unknown>
}

/** Serializable description of a transform type, sent to the renderer for the UI. */
export interface TransformManifest {
  type: string
  apiVersion: number
  labelKey: string
  descriptionKey: string
  allowMultiple: boolean
  configSchema: ConfigField[]
  defaultConfig: Record<string, unknown>
}
