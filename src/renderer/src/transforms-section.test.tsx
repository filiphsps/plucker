// src/renderer/src/TransformsSection.test.tsx
import { describe, it, expect } from 'vitest'
import { move, addInstance, canAdd, hasConfig } from './transform-list-utils'
import type { TransformInstance, TransformManifest } from '../../shared/transforms'

const insts: TransformInstance[] = [
  { instanceId: 'a', type: 'auto-tag', enabled: true, config: {} },
  { instanceId: 'b', type: 'rename', enabled: true, config: {} }
]
const catalog: TransformManifest[] = [
  {
    type: 'auto-tag',
    apiVersion: 1,
    labelKey: '',
    descriptionKey: '',
    allowMultiple: false,
    configSchema: [],
    defaultConfig: { x: 1 }
  },
  {
    type: 'trim',
    apiVersion: 1,
    labelKey: '',
    descriptionKey: '',
    allowMultiple: true,
    configSchema: [],
    defaultConfig: {}
  }
]

describe('list helpers', () => {
  it('move swaps adjacent items', () => {
    expect(move(insts, 0, 1).map((i) => i.instanceId)).toEqual(['b', 'a'])
  })
  it('move is a no-op out of bounds', () => {
    expect(move(insts, 0, -1)).toEqual(insts)
  })
  it('addInstance appends with default config and a fresh id', () => {
    const out = addInstance(insts, catalog[1], () => 'new-id')
    expect(out).toHaveLength(3)
    expect(out[2]).toMatchObject({ instanceId: 'new-id', type: 'trim', enabled: true, config: {} })
  })
  it('canAdd is false for a single-instance type already present', () => {
    expect(canAdd(insts, catalog[0])).toBe(false)
    expect(canAdd(insts, catalog[1])).toBe(true)
  })
})

describe('hasConfig', () => {
  it('is false for an unknown manifest', () => {
    expect(hasConfig(undefined)).toBe(false)
  })
  it('is false when the schema is empty and no custom UI is registered', () => {
    expect(hasConfig(catalog[0])).toBe(false)
  })
  it('is true when the schema has fields', () => {
    const withFields: TransformManifest = {
      ...catalog[1],
      configSchema: [{ key: 'enrich', labelKey: 'f.enrich', type: 'boolean', default: true }]
    }
    expect(hasConfig(withFields)).toBe(true)
  })
})
