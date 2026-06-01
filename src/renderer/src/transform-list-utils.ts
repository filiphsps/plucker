// src/renderer/src/transform-list-utils.ts
import type { TransformInstance, TransformManifest } from '../../shared/transforms'

export function move(list: TransformInstance[], from: number, to: number): TransformInstance[] {
  if (to < 0 || to >= list.length || from < 0 || from >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function addInstance(
  list: TransformInstance[],
  manifest: TransformManifest,
  newId: () => string
): TransformInstance[] {
  return [
    ...list,
    {
      instanceId: newId(),
      type: manifest.type,
      enabled: true,
      config: { ...manifest.defaultConfig }
    }
  ]
}

export function canAdd(list: TransformInstance[], manifest: TransformManifest): boolean {
  if (manifest.allowMultiple) return true
  return !list.some((i) => i.type === manifest.type)
}
