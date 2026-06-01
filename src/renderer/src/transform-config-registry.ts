// src/renderer/src/transform-config-registry.ts
import type React from 'react'

/** Props passed to a transform's custom configuration component. */
export interface TransformConfigProps {
  config: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  t: (key: string) => string
}

/**
 * Renderer-side registry of custom configuration UIs, keyed by transform type.
 *
 * Transform manifests are serialized over IPC and cannot carry React
 * components, so a transform that needs a bespoke config UI (beyond the generic
 * {@link SchemaForm}) registers its component here. When a type has no entry,
 * the generic SchemaForm renders its `configSchema` instead.
 */
export const transformConfigComponents: Record<
  string,
  React.ComponentType<TransformConfigProps>
> = {}
